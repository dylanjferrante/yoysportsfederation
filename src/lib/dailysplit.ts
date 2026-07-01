// Deterministic helpers for the daily model of NBA/NHL/MLB: how many game days a
// club has in a fantasy week, and how to split a player's weekly stat line into
// per-day box lines that sum back to the week. Pure + deterministic so the same
// week always renders identically and per-day points sum to the weekly total.

const hash = (s: string): number => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }

// Games a club plays in a fantasy week, by sport (roughly real-league cadence).
const GAMES_PER_WEEK: Record<string, number> = { NBA: 3, NHL: 3, MLB: 6, NFL: 1 }

// Pick which of the week's dates a club plays on — deterministic per (club, week),
// so every player on that club shares the same game days.
export function gameDatesForClub(sport: string, realTeamAbbr: string | null | undefined, weekDates: string[], seedKey: string): string[] {
  if (!weekDates.length) return []
  const count = Math.min(weekDates.length, GAMES_PER_WEEK[sport] ?? 1)
  if (count >= weekDates.length) return [...weekDates]
  const h = hash(`${seedKey}:${realTeamAbbr ?? 'FA'}:${sport}`)
  // Deterministically choose `count` distinct day indices.
  const idx = weekDates.map((_, i) => i).sort((a, b) => (hash(`${h}:${a}`) - hash(`${h}:${b}`)))
  return idx.slice(0, count).sort((a, b) => a - b).map(i => weekDates[i])
}

// Split a weekly stat line across the given game dates. Each date gets a weight
// (a "big game" vs "quiet game") deterministic per (player, date); every stat is
// distributed by those weights so the per-day lines sum to the weekly line.
export function splitStatLine(playerId: string, stats: Record<string, number>, dates: string[]): { date: string; stats: Record<string, number> }[] {
  if (!dates.length) return []
  if (dates.length === 1) return [{ date: dates[0], stats: { ...stats } }]
  const rawW = dates.map(d => 0.5 + (hash(`${playerId}:${d}`) % 1000) / 1000) // 0.5–1.5
  const sumW = rawW.reduce((a, b) => a + b, 0)
  const w = rawW.map(x => x / sumW)
  return dates.map((date, i) => {
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(stats)) out[k] = +(v * w[i]).toFixed(2)
    return { date, stats: out }
  })
}
