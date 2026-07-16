import { describe, it, expect } from 'vitest'
import { toScoringStats, applyScoring, mapNFLDefense } from './tank01-map'
import { DEFAULT_SCORING } from '../defaults'

// Real Tank01 getNFLProjections sample (Aaron Rodgers, season projection).
const RODGERS = {
  twoPointConversion: '0.1',
  Rushing: { rushYds: '6.3', carries: '1.7', rushTD: '0.1' },
  Passing: { passAttempts: '29.7', passTD: '1.4', passYds: '215', int: '0.5', passCompletions: '18.7' },
  Receiving: { receptions: '0', targets: '0', recTD: '0', recYds: '0' },
  fumblesLost: '0.1', pos: 'QB', team: 'PIT', longName: 'Aaron Rodgers', playerID: '8439',
}

describe('Tank01 NFL stat mapping', () => {
  it('flattens nested raw stats onto our scoring keys', () => {
    const s = toScoringStats('NFL', RODGERS)
    expect(s.passingYards).toBe(215)
    expect(s.passingTD).toBeCloseTo(1.4)
    expect(s.passingInt).toBeCloseTo(0.5)
    expect(s.rushingYards).toBeCloseTo(6.3)
    expect(s.rushingTD).toBeCloseTo(0.1)
    expect(s.receptions).toBe(0)
    expect(s.fumbleLost).toBeCloseTo(0.1)
  })

  it('computes per-league projected points from raw stats (not Tank01 default)', () => {
    const stats = toScoringStats('NFL', RODGERS)
    // Default league: 4-pt passing TD, 0.04/passing yard.
    const standard = applyScoring(DEFAULT_SCORING.NFL, stats)
    // A 6-pt passing-TD league scores the same player higher.
    const sixPtTD = applyScoring({ ...DEFAULT_SCORING.NFL, passingTD: 6 }, stats)
    expect(sixPtTD).toBeGreaterThan(standard)
    // Sanity: ~215*0.04 + 1.4*4 - 0.5*2 ... lands in a believable QB range.
    expect(standard).toBeGreaterThan(5)
    expect(standard).toBeLessThan(40)
  })

  it('maps team-defense projections', () => {
    const d = mapNFLDefense({ sacks: '2.2', interceptions: '0.6', defTD: '0.1', ptsAgainst: '25.5', fumbleRecoveries: '0.3' })
    expect(d.sack).toBeCloseTo(2.2)
    expect(d.interception).toBeCloseTo(0.6)
    expect(d.pointsAllowed).toBeCloseTo(25.5)
  })
})
