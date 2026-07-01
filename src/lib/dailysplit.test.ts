import { describe, it, expect } from 'vitest'
import { gameDatesForClub, splitStatLine } from './dailysplit'

const week = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11']

describe('gameDatesForClub', () => {
  it('returns the sport cadence count of dates, in order, within the week', () => {
    const nba = gameDatesForClub('NBA', 'BOS', week, 's1')
    expect(nba).toHaveLength(3)
    expect(nba.every(d => week.includes(d))).toBe(true)
    expect([...nba]).toEqual([...nba].sort())
  })
  it('is deterministic for the same inputs', () => {
    expect(gameDatesForClub('MLB', 'NYY', week, 's1')).toEqual(gameDatesForClub('MLB', 'NYY', week, 's1'))
  })
  it('gives MLB more games than NBA', () => {
    expect(gameDatesForClub('MLB', 'NYY', week, 's1').length).toBeGreaterThan(gameDatesForClub('NBA', 'NYY', week, 's1').length)
  })
  it('all players on the same club share game days', () => {
    // gameDatesForClub keys off the club, not the player, so it is shared.
    expect(gameDatesForClub('NHL', 'TOR', week, 's1')).toEqual(gameDatesForClub('NHL', 'TOR', week, 's1'))
  })
})

describe('splitStatLine', () => {
  it('splits a stat line across dates so each stat sums back to the weekly total', () => {
    const stats = { pts: 30, reb: 12, ast: 9 }
    const dates = ['2026-01-05', '2026-01-07', '2026-01-09']
    const split = splitStatLine('p1', stats, dates)
    expect(split).toHaveLength(3)
    for (const key of ['pts', 'reb', 'ast']) {
      const sum = split.reduce((s, d) => s + d.stats[key], 0)
      expect(sum).toBeCloseTo(stats[key as keyof typeof stats], 1)
    }
  })
  it('returns the whole line unchanged for a single date', () => {
    const split = splitStatLine('p1', { pts: 20 }, ['2026-01-05'])
    expect(split).toEqual([{ date: '2026-01-05', stats: { pts: 20 } }])
  })
  it('is deterministic', () => {
    const a = splitStatLine('p1', { pts: 30 }, ['2026-01-05', '2026-01-07'])
    const b = splitStatLine('p1', { pts: 30 }, ['2026-01-05', '2026-01-07'])
    expect(a).toEqual(b)
  })
})
