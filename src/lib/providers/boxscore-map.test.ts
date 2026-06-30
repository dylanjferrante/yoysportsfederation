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

  it('derives MLB singles from total hits', () => {
    const base = mapBoxScoreBase('MLB', { H: 3, '2B': 1, HR: 1, RBI: 2, R: 1 })
    const stats = deriveWeekly('MLB', { ...base })
    expect(stats.singles).toBe(1) // 3 hits − 1 double − 1 HR
    expect(stats.doubles).toBe(1)
    expect(stats.homeRuns).toBe(1)
  })

  it('maps NHL skater stats', () => {
    const base = mapBoxScoreBase('NHL', { goals: 2, assists: 1, shots: 5, plusMinus: 2 })
    expect(base.goals).toBe(2)
    expect(base.assists).toBe(1)
    expect(base.shotsOnGoal).toBe(5)
    expect(scorePlayer(deriveWeekly('NHL', base), DEFAULT_SCORING.NHL)).toBeGreaterThan(0)
  })
})
