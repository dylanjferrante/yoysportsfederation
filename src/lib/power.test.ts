import { describe, it, expect } from 'vitest'
import { computePowerRankings, type PowerGame } from './power'

const g = (sport: string, week: number, home: string, away: string, hs: number, as: number): PowerGame =>
  ({ sport, week, homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as, isComplete: true })

describe('computePowerRankings', () => {
  it('ranks an undefeated, high-scoring club first', () => {
    const games = [
      g('NFL', 1, 'A', 'B', 30, 10), g('NFL', 2, 'A', 'C', 28, 12),
      g('NFL', 1, 'C', 'B', 20, 18), g('NFL', 2, 'B', 'C', 15, 22),
    ]
    const rows = computePowerRankings(games, ['A', 'B', 'C'])
    expect(rows[0].teamId).toBe('A')
    expect(rows[0].rank).toBe(1)
    expect(rows.find(r => r.teamId === 'A')!.wins).toBe(2)
    expect(rows.find(r => r.teamId === 'A')!.losses).toBe(0)
  })

  it('aggregates across sports into one ranking', () => {
    const games = [
      g('NFL', 1, 'A', 'B', 20, 10),
      g('NBA', 1, 'B', 'A', 5, 25), // A wins in a second sport too
    ]
    const rows = computePowerRankings(games, ['A', 'B'])
    expect(rows[0].teamId).toBe('A')
    expect(rows.find(r => r.teamId === 'A')!.wins).toBe(2)
    expect(rows.find(r => r.teamId === 'A')!.form).toEqual(['W', 'W'])
  })

  it('reports upward movement when the prior-week order differs', () => {
    // Through wk1: B leads (beat A). Wk2: A wins big twice → A overtakes.
    const games = [
      g('NFL', 1, 'B', 'A', 30, 10),
      g('NFL', 2, 'A', 'B', 40, 5),
      g('NBA', 2, 'A', 'B', 40, 5),
    ]
    const rows = computePowerRankings(games, ['A', 'B'])
    const a = rows.find(r => r.teamId === 'A')!
    expect(a.rank).toBe(1)
    expect(a.prevRank).toBe(2)
    expect(a.delta).toBe(1) // climbed one spot
  })

  it('handles a team with no games without crashing', () => {
    const rows = computePowerRankings([g('NFL', 1, 'A', 'B', 10, 8)], ['A', 'B', 'C'])
    const c = rows.find(r => r.teamId === 'C')!
    expect(c.wins).toBe(0)
    expect(c.score).toBe(0)
    expect(rows).toHaveLength(3)
  })
})
