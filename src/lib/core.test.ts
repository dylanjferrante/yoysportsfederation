import { describe, it, expect } from 'vitest'
import { scorePlayer, generateStatLine } from './scoring'
import { defaultFederationScoring, federationPointsFor, rankWithinSport, computeFederationStandings } from './federation'
import { realOpponents, oppLabel } from './realschedule'
import { slotEligible, eligibleSlots, resolveTradeDeadlineWeek, defaultTradeDeadlines } from './defaults'
import { safeParse } from './utils'

describe('scoring', () => {
  it('scorePlayer is a dot product of stats and scoring weights', () => {
    expect(scorePlayer({ passYards: 300, passTD: 2 }, { passYards: 0.04, passTD: 4 })).toBeCloseTo(300 * 0.04 + 2 * 4)
  })
  it('ignores stats without a scoring weight', () => {
    expect(scorePlayer({ foo: 99, passTD: 1 }, { passTD: 4 })).toBe(4)
  })
  it('generateStatLine returns a populated stat object scaled by talent', () => {
    const elite = generateStatLine('NFL', 'QB', 1.6)
    expect(typeof elite).toBe('object')
    expect(Object.keys(elite).length).toBeGreaterThan(0)
    // Average raw production over many samples: more talent should produce more.
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + (b || 0), 0)
    const avg = (t: number) => Array.from({ length: 80 }, () => sum(generateStatLine('NFL', 'QB', t)))
      .reduce((a, b) => a + b, 0) / 80
    expect(avg(1.6)).toBeGreaterThan(avg(0.4))
  })
})

describe('federation scoring', () => {
  const fs = defaultFederationScoring(12, ['NFL', 'NBA', 'NHL', 'MLB'])
  it('default placement gives maxTeams down to 1', () => {
    expect(fs.placement[0]).toBe(12)
    expect(fs.placement[11]).toBe(1)
  })
  it('federationPointsFor adds the champion bonus', () => {
    expect(federationPointsFor(1, false, fs)).toBe(12)
    expect(federationPointsFor(1, true, fs)).toBe(12 + fs.championBonus)
    expect(federationPointsFor(99, false, fs)).toBe(0)
  })
  it('rankWithinSport orders by wins then points-for', () => {
    const ranked = rankWithinSport([
      { teamId: 'a', wins: 5, pointsFor: 100 },
      { teamId: 'b', wins: 5, pointsFor: 120 },
      { teamId: 'c', wins: 8, pointsFor: 90 },
    ])
    expect(ranked.map(r => r.teamId)).toEqual(['c', 'b', 'a'])
  })
  it('computeFederationStandings aggregates only included sports', () => {
    const teams = [{ id: 'a' }, { id: 'b' }]
    const records = [
      { teamId: 'a', sport: 'NFL', finishPosition: 1, isChampion: true },
      { teamId: 'a', sport: 'NBA', finishPosition: 3 },
      { teamId: 'b', sport: 'NFL', finishPosition: 2 },
    ]
    const out = computeFederationStandings(teams, records, fs, ['NFL'])
    expect(out[0].team.id).toBe('a')
    expect(out[0].total).toBe(12 + fs.championBonus)
    expect(out[0].perSport.NBA).toBeUndefined() // NBA excluded
  })
})

describe('real schedule', () => {
  it('produces mutual round-robin pairings', () => {
    const map = realOpponents(['KC', 'BUF', 'SF', 'DAL'], 1)
    for (const [team, { opp }] of Object.entries(map)) {
      if (opp === 'BYE') continue
      expect(map[opp].opp).toBe(team) // pairing is symmetric
    }
  })
  it('rotates opponents week to week', () => {
    const w1 = realOpponents(['KC', 'BUF', 'SF', 'DAL'], 1)
    const w2 = realOpponents(['KC', 'BUF', 'SF', 'DAL'], 2)
    expect(w1.KC.opp).not.toBe(w2.KC.opp)
  })
  it('oppLabel formats home/away/bye', () => {
    expect(oppLabel({ opp: 'KC', home: true })).toBe('vs KC')
    expect(oppLabel({ opp: 'KC', home: false })).toBe('@KC')
    expect(oppLabel({ opp: 'BYE', home: true })).toBe('BYE')
    expect(oppLabel(undefined)).toBe('—')
  })
})

describe('roster slot eligibility', () => {
  it('a QB fits QB, FLEX-less, bench, but not RB', () => {
    expect(slotEligible('QB', 'QB')).toBe(true)
    expect(slotEligible('QB', 'BN')).toBe(true)
    expect(slotEligible('QB', 'RB')).toBe(false)
  })
  it('a RB is flex-eligible', () => {
    expect(slotEligible('RB', 'RB/WR/TE')).toBe(true)
  })
  it('eligibleSlots only returns configured slots for the position', () => {
    const slots = eligibleSlots('RB', { QB: 1, RB: 2, 'RB/WR/TE': 1, BN: 4 })
    expect(slots).toContain('RB')
    expect(slots).toContain('BN')
    expect(slots).not.toContain('QB')
  })
})

describe('trade deadlines', () => {
  const schedule = [
    { sport: 'NFL', phase: 'FOOTBALL', startWeek: 1, endWeek: 14 },
    { sport: 'NBA', phase: 'WINTER', startWeek: 9, endWeek: 27 },
  ]
  it('defaults every sport to its playoffs start', () => {
    const d = defaultTradeDeadlines(['NFL', 'NBA'])
    expect(d.NFL.mode).toBe('SPORT_PLAYOFFS')
  })
  it('resolves each mode to the right lock week', () => {
    expect(resolveTradeDeadlineWeek({ mode: 'WEEK', week: 11 }, 'NFL', schedule, 2)).toBe(11)
    expect(resolveTradeDeadlineWeek({ mode: 'SPORT_PLAYOFFS' }, 'NFL', schedule, 2)).toBe(14)
    expect(resolveTradeDeadlineWeek({ mode: 'SPORT_CHAMPIONSHIP' }, 'NFL', schedule, 2)).toBe(16)
    expect(resolveTradeDeadlineWeek({ mode: 'FEDERATION_CHAMPIONSHIP' }, 'NFL', schedule, 2)).toBe(29)
    expect(resolveTradeDeadlineWeek({ mode: 'NONE' }, 'NFL', schedule, 2)).toBe(Infinity)
  })
})

describe('safeParse', () => {
  it('parses valid JSON and falls back on bad input', () => {
    expect(safeParse('{"a":1}', {})).toEqual({ a: 1 })
    expect(safeParse('not json', { fallback: true })).toEqual({ fallback: true })
    expect(safeParse(null, [])).toEqual([])
  })
})
