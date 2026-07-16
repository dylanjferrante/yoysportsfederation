// Pure lineup optimizer — shared by the My Team advisor (and reusable for
// auto-substitution). No DB, no React: takes plain data so it's unit-testable.

export type OptPlayer = { id: string; position: string; proj: number; out?: boolean }

// Effective projection: an out/bye/inactive player contributes 0.
const eff = (p: OptPlayer) => (p.out ? 0 : (p.proj || 0))

// Greedy optimal assignment: highest-projected players first into the most
// restrictive eligible open slot (so flex slots fill last). `slotInstances` is
// the expanded list of starter slots (e.g. ['QB','RB','RB','FLEX']). `eligible`
// maps a position to the starter slots it can fill. `slotWidth` is how many of
// the sport's positions can fill a slot (lower = more restrictive).
export function optimizeLineup(
  players: OptPlayer[],
  slotInstances: string[],
  eligible: (position: string) => string[],
  slotWidth: (slot: string) => number,
): { assigned: { slot: string; player: OptPlayer }[]; total: number } {
  const open = slotInstances.map((slot, idx) => ({ slot, idx, width: slotWidth(slot), taken: null as OptPlayer | null }))
  for (const p of [...players].sort((a, b) => eff(b) - eff(a))) {
    const elig = eligible(p.position)
    const cand = open.filter(o => !o.taken && elig.includes(o.slot)).sort((a, b) => a.width - b.width)
    if (cand.length) cand[0].taken = p
  }
  const assigned = open.filter(o => o.taken).map(o => ({ slot: o.slot, player: o.taken! }))
  const total = assigned.reduce((s, a) => s + eff(a.player), 0)
  return { assigned, total }
}

// Compare the optimal lineup to the currently-started players: the projected
// gain, who to start (with target slot), who to sit, and out/bye starters.
export function lineupAdvice(
  rosterStartable: OptPlayer[],
  currentStarterIds: Set<string>,
  slotInstances: string[],
  eligible: (position: string) => string[],
  slotWidth: (slot: string) => number,
) {
  const { assigned, total: optimalTotal } = optimizeLineup(rosterStartable, slotInstances, eligible, slotWidth)
  const optimalIds = new Set(assigned.map(a => a.player.id))
  const current = rosterStartable.filter(p => currentStarterIds.has(p.id))
  const currentTotal = current.reduce((s, p) => s + eff(p), 0)
  const toStart = assigned.filter(a => !currentStarterIds.has(a.player.id))
  const toSit = current.filter(p => !optimalIds.has(p.id))
  const alerts = current.filter(p => p.out)
  return { currentTotal, optimalTotal, gain: +(optimalTotal - currentTotal).toFixed(1), toStart, toSit, alerts }
}
