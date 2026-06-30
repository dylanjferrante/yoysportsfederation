// Pure standings helpers — strength of schedule and clinch/elimination numbers.
// No DB, no React: plain data in, plain data out, so they're unit-testable and
// shared by the standings view.

export type WR = { w: number; rem: number } // wins and games remaining

// Strength of schedule = average win% of a team's opponents, scaled to 0–1000
// (so it renders like a baseball average, e.g. .512). Returns 0 with no games.
export function strengthOfSchedule(opponentIds: string[], winPctById: Record<string, number>): number {
  if (!opponentIds.length) return 0
  const avg = opponentIds.reduce((a, id) => a + (winPctById[id] ?? 0), 0) / opponentIds.length
  return Math.round(avg * 1000)
}

// Magic / tragic number vs the playoff-cut boundary team (single-rival
// simplification; ignores PF tiebreaks). For an in-cut team: clinch ('x') over
// the first team out. For an out team: elimination ('e') by the last team in.
// magic is the combined self-wins + rival-losses still needed to clinch.
export function clinchStatus(opts: {
  rank: number; cut: number; remaining: number;
  self: WR; firstOut?: WR; lastIn?: WR;
}): { clinch: 'x' | 'e' | null; magic: number | null } {
  const { rank, cut, remaining, self, firstOut, lastIn } = opts
  if (remaining === 0) return { clinch: rank < cut ? 'x' : 'e', magic: null }
  if (rank < cut) {
    if (!firstOut) return { clinch: 'x', magic: null }
    const magic = Math.max(0, firstOut.w + firstOut.rem - self.w + 1)
    return { clinch: magic === 0 ? 'x' : null, magic }
  }
  if (lastIn) {
    if (self.w + self.rem < lastIn.w) return { clinch: 'e', magic: null }
    return { clinch: null, magic: Math.max(0, self.w + self.rem - lastIn.w + 1) }
  }
  return { clinch: null, magic: null }
}
