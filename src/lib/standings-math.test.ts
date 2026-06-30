import { describe, it, expect } from 'vitest'
import { strengthOfSchedule, clinchStatus } from './standings-math'

describe('strengthOfSchedule', () => {
  it('averages opponent win% and scales to 0–1000', () => {
    expect(strengthOfSchedule(['a', 'b'], { a: 0.5, b: 0.7 })).toBe(600)
    expect(strengthOfSchedule([], { a: 1 })).toBe(0)
    expect(strengthOfSchedule(['a', 'a'], { a: 0.512 })).toBe(512)
  })
})

describe('clinchStatus', () => {
  it('marks a finished in-cut team as clinched and out team as eliminated', () => {
    expect(clinchStatus({ rank: 0, cut: 6, remaining: 0, self: { w: 10, rem: 0 } }).clinch).toBe('x')
    expect(clinchStatus({ rank: 7, cut: 6, remaining: 0, self: { w: 3, rem: 0 } }).clinch).toBe('e')
  })

  it('computes a magic number for an in-cut team vs the first team out', () => {
    // self 8 wins; rival has 6 wins + 3 to play → can reach 9. magic = 9 - 8 + 1 = 2.
    const r = clinchStatus({ rank: 2, cut: 6, remaining: 3, self: { w: 8, rem: 3 }, firstOut: { w: 6, rem: 3 } })
    expect(r.magic).toBe(2)
    expect(r.clinch).toBeNull()
  })

  it('clinches when the rival can no longer catch up (magic 0)', () => {
    // rival max = 6+1 = 7, self already 8 → magic clamps to 0 → clinched.
    const r = clinchStatus({ rank: 1, cut: 6, remaining: 1, self: { w: 8, rem: 1 }, firstOut: { w: 6, rem: 1 } })
    expect(r.clinch).toBe('x')
    expect(r.magic).toBe(0)
  })

  it('eliminates an out team that cannot reach the last team in', () => {
    // self max = 4+2 = 6 < 7 wins held → eliminated.
    const r = clinchStatus({ rank: 8, cut: 6, remaining: 2, self: { w: 4, rem: 2 }, lastIn: { w: 7, rem: 0 } })
    expect(r.clinch).toBe('e')
  })
})
