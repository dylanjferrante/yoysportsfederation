import { describe, it, expect } from 'vitest'
import { mapBoxScoreBase, deriveWeekly } from './boxscore-map'
import { scorePlayer } from '../scoring'
import { DEFAULT_SCORING } from '../defaults'

describe('boxscore-map → scoring keys', () => {
  it('maps a nested NFL box score onto our scoring keys and scores non-zero', () => {
    const raw = { Passing: { passYds: '305', passTD: 3, int: 1 }, Rushing: { rushYds: 12, rushTD: 0, carries: 2 } }
    const base = mapBoxScoreBase('NFL', raw)
    expect(base.passingYards).toBe(305)
    expect(base.passingTD).toBe(3)
    expect(base.passingInt).toBe(1)
    expect(base.rushingYards).toBe(12)
    const stats = deriveWeekly('NFL', { ...base })
    expect(stats.passing300Bonus).toBe(1) // derived from 305 yards
    const pts = scorePlayer(stats, DEFAULT_SCORING.NFL)
    expect(pts).toBeGreaterThan(0)
  })

  it('maps a flat NBA box score and derives a double-double', () => {
    const base = mapBoxScoreBase('NBA', { pts: 24, reb: 11, ast: 5, stl: 1, blk: 0, tov: 3, tptfgm: 2 })
    const stats = deriveWeekly('NBA', { ...base })
    expect(stats.points).toBe(24)
    expect(stats.rebounds).toBe(11)
    expect(stats.doubleDouble).toBe(1)
    expect(scorePlayer(stats, DEFAULT_SCORING.NBA)).toBeGreaterThan(0)
  })

  it('derives MLB singles from total hits (flat batting input)', () => {
    const base = mapBoxScoreBase('MLB', { H: 3, '2B': 1, HR: 1, RBI: 2, R: 1 })
    const stats = deriveWeekly('MLB', { ...base })
    expect(stats.singles).toBe(1) // 3 hits − 1 double − 1 HR
    expect(stats.doubles).toBe(1)
    expect(stats.homeRuns).toBe(1)
  })

  it('scores NFL field goals by tier, by yardage, and with a per-FG minimum', () => {
    // Distances arrive from scoringPlays as __fgMade (attached by tank01BoxScore).
    const base = mapBoxScoreBase('NFL', { Kicking: { fgMade: '4', xpMade: '0' }, __fgMade: [32, 23, 55, 60] })
    expect(base.fgDist32).toBe(1)
    expect(base.fgMade0_39).toBe(2) // 32, 23
    expect(base.fgMade50plus).toBe(2) // 55, 60
    // Tier scoring (default): 2×3 + 2×5
    expect(scorePlayer(base, DEFAULT_SCORING.NFL)).toBe(16)
    // Per-yardage: (32+23+55+60) × 0.1 — and NOT double-counted with tiers
    expect(scorePlayer(base, { ...DEFAULT_SCORING.NFL, fgPointsPerYard: 0.1 })).toBe(17)
    // Per-yardage with a 3-pt floor: the 23-yarder pays 3.0 instead of 2.3
    expect(scorePlayer(base, { ...DEFAULT_SCORING.NFL, fgPointsPerYard: 0.1, fgMinPoints: 3 })).toBe(17.7)
  })

  it('maps NFL team defense (DST) points/yards-allowed tiers + turnovers', () => {
    const stingy = mapBoxScoreBase('NFL', { __dst: { teamID: '4', sacks: '3', defensiveInterceptions: '2', fumblesRecovered: '1', defTD: '0', ptsAllowed: '8', ydsAllowed: '122', safeties: '0' } })
    expect(stingy.ptsAllowed7_13).toBe(1)
    expect(stingy.yardsAllowed100_199).toBe(1)
    expect(stingy.sack).toBe(3)
    expect(stingy.interception).toBe(2)
    expect(stingy.fumbleRecovery).toBe(1)
    const blownOut = mapBoxScoreBase('NFL', { __dst: { teamID: '25', sacks: '0', ptsAllowed: '35', ydsAllowed: '470' } })
    expect(blownOut.ptsAllowed35plus).toBe(1)
    expect(blownOut.yardsAllowed400plus).toBe(1)
  })

  it('maps NFL individual-defender (IDP) stats to idp* keys', () => {
    const base = mapBoxScoreBase('NFL', { Defense: { totalTackles: '7', soloTackles: '5', sacks: '1', tfl: '2', qbHits: '1', passDeflections: '1', defensiveInterceptions: '1', forcedFumbles: '1', defTD: '0' } })
    expect(base.idpSoloTackle).toBe(5)
    expect(base.idpAssistTackle).toBe(2) // 7 total − 5 solo
    expect(base.idpSack).toBe(1)
    expect(base.idpInterception).toBe(1)
    expect(base.idpForcedFumble).toBe(1)
  })

  it('maps the NFL passing/receiving 2-pt and special-teams-return fields', () => {
    const base = mapBoxScoreBase('NFL', {
      Passing: { passYds: '120', passTD: '1', passingTwoPointConversion: '1' },
      Receiving: { receptions: '4', recYds: '60', recTD: '1', receivingTwoPointConversion: '1' },
      Kicking: { xpMade: '2', fgMissed: '1', kickReturnTD: '1' },
    })
    expect(base.passing2pt).toBe(1)
    expect(base.receiving2pt).toBe(1)
    expect(base.fgMissed).toBe(1)
    expect(base.specialTeamsTD).toBe(1)
  })

  it('maps a real-shape MLB box score WITHOUT confusing batting and pitching', () => {
    // A pure batter: every player still carries a zero-filled Pitching group.
    const batter = mapBoxScoreBase('MLB', {
      Hitting: { H: '2', '2B': '1', HR: '0', '3B': '0', R: '1', RBI: '2', BB: '1', SO: '1', HBP: '0', SF: '1' },
      Pitching: { H: '0', R: '0', BB: '0', SO: '0', ER: '0', InningsPitched: '0.0', decision: '' },
      BaseRunning: { SB: '1', CS: '0' },
    })
    expect(batter.strikeoutsAsBatter).toBe(1)
    expect(batter.strikeoutsAsPitcher ?? 0).toBe(0) // pitcher SO must NOT leak in
    expect(batter.walks).toBe(1)
    expect(batter.walksAllowed ?? 0).toBe(0)
    expect(batter.stolenBases).toBe(1)
    expect(batter.sacFly).toBe(1)
    const stats = deriveWeekly('MLB', { ...batter })
    expect(stats.singles).toBe(1) // 2 hits − 1 double
    expect(scorePlayer(stats, DEFAULT_SCORING.MLB)).toBeGreaterThan(0)
  })

  it('maps a winning starting pitcher: IP outs, K, decision, quality start', () => {
    const sp = mapBoxScoreBase('MLB', {
      Hitting: { H: '0', R: '0', BB: '0', SO: '0' },
      Pitching: { H: '5', R: '0', ER: '0', BB: '1', SO: '7', InningsPitched: '6.2', decision: 'W', pitchingOrder: '1' },
      BaseRunning: { SB: '0', CS: '0' },
    })
    expect(sp.inningsPitched).toBeCloseTo(6 + 2 / 3, 5) // "6.2" = 6⅔ innings, not 6.2
    expect(sp.strikeoutsAsPitcher).toBe(7)
    expect(sp.strikeoutsAsBatter ?? 0).toBe(0)
    expect(sp.hitsAllowed).toBe(5)
    expect(sp.walksAllowed).toBe(1)
    expect(sp.wins).toBe(1)
    expect(sp.losses ?? 0).toBe(0)
    expect(sp.qualityStart).toBe(1) // started, ≥6 IP, ≤3 ER
  })

  it('counts MLB save / hold decisions, and does not flag a reliever quality start', () => {
    const closer = mapBoxScoreBase('MLB', {
      Pitching: { InningsPitched: '1.0', SO: '2', ER: '0', decision: 'S', pitchingOrder: '5' },
    })
    expect(closer.saves).toBe(1)
    expect(closer.qualityStart ?? 0).toBe(0) // not the starter
    const holder = mapBoxScoreBase('MLB', { Pitching: { InningsPitched: '0.2', decision: 'H', pitchingOrder: '4' } })
    expect(holder.holds).toBe(1)
  })

  it('maps NHL skater stats', () => {
    const base = mapBoxScoreBase('NHL', { goals: 2, assists: 1, shots: 5, plusMinus: 2 })
    expect(base.goals).toBe(2)
    expect(base.assists).toBe(1)
    expect(base.shotsOnGoal).toBe(5)
    expect(scorePlayer(deriveWeekly('NHL', base), DEFAULT_SCORING.NHL)).toBeGreaterThan(0)
  })

  it('derives NBA missed shots from attempts minus makes', () => {
    const base = mapBoxScoreBase('NBA', { pts: 22, fgm: 7, fga: 12, ftm: 3, fta: 3, reb: 10, OffReb: 1, DefReb: 9, blk: 2, tptfgm: 5 })
    const stats = deriveWeekly('NBA', { ...base })
    expect(stats.fieldGoalsMissed).toBe(5) // 12 − 7
    expect(stats.freeThrowsMissed).toBe(0) // 3 − 3
    expect((stats as any).__fga).toBeUndefined() // helper removed
    expect(stats.doubleDouble).toBe(1) // 22 pts + 10 reb
  })

  it('maps the NHL power-play fields without confusing PP goals and PP points', () => {
    // powerPlayPoints (= PP goals + PP assists) must NOT be read as ppGoals.
    const base = mapBoxScoreBase('NHL', {
      goals: 0, assists: 1, shots: 3, plusMinus: -1,
      powerPlayGoals: 0, powerPlayAssists: 1, powerPlayPoints: 1, penaltiesInMinutes: 2, faceoffsLost: 4,
    })
    expect(base.ppGoals).toBe(0)
    expect(base.ppAssists).toBe(1)
    expect(base.penaltyMinutes).toBe(2) // from penaltiesInMinutes, not a missing "pim"
    expect(base.faceoffsLost).toBe(4)
  })

  it('credits an NHL goalie win/shutout from the goalieDecision string', () => {
    const winNoSO = mapBoxScoreBase('NHL', { goalieDecision: 'W', saves: 21, goalsAgainst: 2 })
    expect(winNoSO.wins).toBe(1)
    expect(winNoSO.saves).toBe(21)
    expect(winNoSO.goalsAllowed).toBe(2)
    expect(winNoSO.shutout ?? 0).toBe(0) // allowed 2

    const shutout = mapBoxScoreBase('NHL', { goalieDecision: 'W', saves: 30, goalsAgainst: 0 })
    expect(shutout.shutout).toBe(1)

    const otl = mapBoxScoreBase('NHL', { goalieDecision: 'OTL', saves: 28, goalsAgainst: 3 })
    expect(otl.overtimeLoss).toBe(1)
    expect(otl.wins ?? 0).toBe(0)
  })
})
