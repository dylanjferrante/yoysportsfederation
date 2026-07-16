// Cross-sport power rankings. A club's power score blends overall win rate,
// recent form, and scoring — aggregated across every sport it plays — so one
// number ranks the whole franchise. Movement compares this week's order to the
// order through the previous week.

export type PowerGame = {
  sport: string; week: number
  homeTeamId: string | null; awayTeamId: string | null
  homeScore: number | null; awayScore: number | null
  isComplete: boolean | null
}

export type PowerRow = {
  teamId: string; rank: number; prevRank: number | null; delta: number
  score: number; wins: number; losses: number; pointsFor: number; form: ('W' | 'L')[]
}

type Tally = { wins: number; losses: number; pf: number; games: { week: number; win: boolean }[] }

function tally(games: PowerGame[], teamIds: string[]): Map<string, Tally> {
  const t = new Map<string, Tally>(teamIds.map(id => [id, { wins: 0, losses: 0, pf: 0, games: [] }]))
  for (const g of games) {
    if (!g.isComplete || !g.homeTeamId || !g.awayTeamId) continue
    const hs = g.homeScore ?? 0, as = g.awayScore ?? 0
    const h = t.get(g.homeTeamId), a = t.get(g.awayTeamId)
    const homeWon = hs >= as
    if (h) { h.pf += hs; homeWon ? h.wins++ : h.losses++; h.games.push({ week: g.week, win: homeWon }) }
    if (a) { a.pf += as; homeWon ? a.losses++ : a.wins++; a.games.push({ week: g.week, win: !homeWon }) }
  }
  return t
}

// Composite 0–100 score: 50% overall win rate, 30% last-5 form, 20% scoring
// (relative to the league's top scorer).
function scoreOf(tallies: Map<string, Tally>): Map<string, { score: number; wins: number; losses: number; pf: number; form: ('W' | 'L')[] }> {
  const maxPf = Math.max(1, ...[...tallies.values()].map(v => v.pf))
  const out = new Map<string, { score: number; wins: number; losses: number; pf: number; form: ('W' | 'L')[] }>()
  for (const [id, v] of tallies) {
    const gp = v.wins + v.losses
    const winPct = gp ? v.wins / gp : 0
    const last5 = v.games.slice().sort((a, b) => a.week - b.week).slice(-5)
    const recentPct = last5.length ? last5.filter(g => g.win).length / last5.length : winPct
    const pfIndex = v.pf / maxPf
    const score = Math.round(100 * (0.5 * winPct + 0.3 * recentPct + 0.2 * pfIndex))
    out.set(id, { score, wins: v.wins, losses: v.losses, pf: +v.pf.toFixed(1), form: last5.map(g => g.win ? 'W' : 'L') })
  }
  return out
}

function rankOrder(scored: Map<string, { score: number }>): Map<string, number> {
  const order = [...scored.entries()].sort((a, b) => b[1].score - a[1].score).map(([id]) => id)
  return new Map(order.map((id, i) => [id, i + 1]))
}

export function computePowerRankings(games: PowerGame[], teamIds: string[]): PowerRow[] {
  const completed = games.filter(g => g.isComplete && g.homeTeamId && g.awayTeamId)
  const maxWeek = completed.length ? Math.max(...completed.map(g => g.week)) : 0

  const cur = scoreOf(tally(completed, teamIds))
  const curRank = rankOrder(cur)
  // "Last week" = the standings through the prior week (drops the latest week).
  const hasPrev = completed.some(g => g.week < maxWeek)
  const prevRank = hasPrev ? rankOrder(scoreOf(tally(completed.filter(g => g.week < maxWeek), teamIds))) : null

  return teamIds
    .map(id => {
      const s = cur.get(id)!
      const rank = curRank.get(id)!
      const prev = prevRank?.get(id) ?? null
      return { teamId: id, rank, prevRank: prev, delta: prev == null ? 0 : prev - rank, score: s.score, wins: s.wins, losses: s.losses, pointsFor: s.pf, form: s.form }
    })
    .sort((a, b) => a.rank - b.rank)
}
