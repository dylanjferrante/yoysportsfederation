// Deterministic real-game schedule. Our player pool has no real-life game
// calendar, so we derive a stable round-robin pairing of each sport's real
// teams per week (circle method) to label "this week's opponent" on rosters.

function rotate<T>(a: T[], k: number): T[] {
  if (!a.length) return a
  k = ((k % a.length) + a.length) % a.length
  return [...a.slice(a.length - k), ...a.slice(0, a.length - k)]
}

export type Opp = { opp: string; home: boolean }

// Map of teamAbbr -> { opp, home } for a given week.
export function realOpponents(abbrs: string[], week: number): Record<string, Opp> {
  const teams = [...new Set(abbrs.filter(Boolean))].sort()
  const map: Record<string, Opp> = {}
  if (teams.length < 2) return map
  const list = teams.length % 2 ? [...teams, 'BYE'] : [...teams]
  const m = list.length
  const arr = [list[0], ...rotate(list.slice(1), (week - 1) % (m - 1))]
  for (let i = 0; i < m / 2; i++) {
    const a = arr[i], b = arr[m - 1 - i]
    if (a !== 'BYE' && b !== 'BYE') { map[a] = { opp: b, home: true }; map[b] = { opp: a, home: false } }
    else if (a !== 'BYE') map[a] = { opp: 'BYE', home: true }
    else if (b !== 'BYE') map[b] = { opp: 'BYE', home: false }
  }
  return map
}

export const oppLabel = (o: Opp | undefined) => !o ? '—' : o.opp === 'BYE' ? 'BYE' : `${o.home ? 'vs ' : '@'}${o.opp}`
