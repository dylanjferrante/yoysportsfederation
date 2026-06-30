import { describe, it, expect } from 'vitest'
import { optimizeLineup, lineupAdvice, type OptPlayer } from './lineup'

// A simple NFL-ish slot setup with a flex eligible to RB/WR/TE.
const eligible = (pos: string): string[] => {
  const map: Record<string, string[]> = {
    QB: ['QB'], RB: ['RB', 'FLEX'], WR: ['WR', 'FLEX'], TE: ['TE', 'FLEX'], K: ['K'],
  }
  return map[pos] ?? []
}
const widths: Record<string, number> = { QB: 1, RB: 1, WR: 1, TE: 1, K: 1, FLEX: 3 }
const slotWidth = (s: string) => widths[s] ?? 99
const slots = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX']

describe('optimizeLineup', () => {
  it('fills restrictive slots first so flex takes the leftover best', () => {
    const players: OptPlayer[] = [
      { id: 'qb', position: 'QB', proj: 25 },
      { id: 'rb1', position: 'RB', proj: 20 }, { id: 'rb2', position: 'RB', proj: 18 }, { id: 'rb3', position: 'RB', proj: 17 },
      { id: 'wr1', position: 'WR', proj: 16 }, { id: 'wr2', position: 'WR', proj: 12 },
      { id: 'te1', position: 'TE', proj: 8 },
    ]
    const { assigned, total } = optimizeLineup(players, slots, eligible, slotWidth)
    expect(assigned).toHaveLength(7)
    // The 3rd RB (17) should win the FLEX over the weaker WR/TE.
    expect(assigned.find(a => a.slot === 'FLEX')?.player.id).toBe('rb3')
    expect(total).toBe(25 + 20 + 18 + 16 + 12 + 8 + 17)
  })

  it('treats out/bye players as 0 and leaves them out of the optimum', () => {
    const players: OptPlayer[] = [
      { id: 'qbA', position: 'QB', proj: 30, out: true },
      { id: 'qbB', position: 'QB', proj: 10 },
    ]
    const { assigned } = optimizeLineup(players, ['QB'], eligible, slotWidth)
    expect(assigned[0].player.id).toBe('qbB') // healthy backup starts over the injured star
  })
})

describe('lineupAdvice', () => {
  it('recommends starting a healthy bench player over an injured starter', () => {
    const players: OptPlayer[] = [
      { id: 'qb', position: 'QB', proj: 25 },
      { id: 'starterRB', position: 'RB', proj: 20, out: true }, // injured, currently started
      { id: 'benchRB', position: 'RB', proj: 14 },
    ]
    const current = new Set(['qb', 'starterRB'])
    const adv = lineupAdvice(players, current, ['QB', 'RB'], eligible, slotWidth)
    expect(adv.alerts.map(p => p.id)).toContain('starterRB')
    expect(adv.toStart.map(a => a.player.id)).toContain('benchRB')
    expect(adv.toSit.map(p => p.id)).toContain('starterRB')
    expect(adv.gain).toBeGreaterThan(0)
  })

  it('reports no gain when the lineup is already optimal', () => {
    const players: OptPlayer[] = [{ id: 'qb', position: 'QB', proj: 25 }, { id: 'bench', position: 'QB', proj: 5 }]
    const adv = lineupAdvice(players, new Set(['qb']), ['QB'], eligible, slotWidth)
    expect(adv.gain).toBe(0)
    expect(adv.toStart).toHaveLength(0)
  })
})
