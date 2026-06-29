import { NextResponse } from 'next/server'
import { db } from '@/db'
import { matchups, teams, teamRecords, leagueHistory } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

// League record book / superlatives — computed from completed matchups, season
// records, and championship history. All-time across every season on file.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const teamRows = await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation }).from(teams).where(eq(teams.leagueId, id))
  const tname = Object.fromEntries(teamRows.map(t => [t.id, t.name]))

  const games = await db.select().from(matchups)
    .where(and(eq(matchups.leagueId, id), eq(matchups.isComplete, true)))
  const real = games.filter(g => g.homeTeamId && g.awayTeamId)

  // ── Single-game superlatives (per team-side) ──────────────────────────────
  type Side = { teamId: string; team: string; opp: string; score: number; oppScore: number; sport: string; season: string | null; week: number; playoff: boolean }
  const sides: Side[] = []
  for (const g of real) {
    sides.push({ teamId: g.homeTeamId!, team: tname[g.homeTeamId!] ?? '?', opp: tname[g.awayTeamId!] ?? '?', score: g.homeScore ?? 0, oppScore: g.awayScore ?? 0, sport: g.sport, season: g.season, week: g.week, playoff: !!g.isPlayoff })
    sides.push({ teamId: g.awayTeamId!, team: tname[g.awayTeamId!] ?? '?', opp: tname[g.homeTeamId!] ?? '?', score: g.awayScore ?? 0, oppScore: g.homeScore ?? 0, sport: g.sport, season: g.season, week: g.week, playoff: !!g.isPlayoff })
  }

  const bySport: Record<string, Side[]> = {}
  for (const s of sides) (bySport[s.sport] ??= []).push(s)

  function topScores(pool: Side[]) {
    const highest = [...pool].sort((a, b) => b.score - a.score).slice(0, 5)
    const lowest = [...pool].sort((a, b) => a.score - b.score).slice(0, 5)
    const blowouts = [...pool].filter(s => s.score >= s.oppScore).sort((a, b) => (b.score - b.oppScore) - (a.score - a.oppScore)).slice(0, 5)
    return { highest, lowest, blowouts }
  }

  // ── Win streaks (per team, chronological) ─────────────────────────────────
  const order = (s: Side) => `${s.season ?? ''}`.padStart(8, '0') + String(s.week).padStart(3, '0')
  const streaks: { team: string; len: number; sport: string }[] = []
  for (const sport of Object.keys(bySport)) {
    const byTeam: Record<string, Side[]> = {}
    for (const s of bySport[sport]) (byTeam[s.teamId] ??= []).push(s)
    for (const tid of Object.keys(byTeam)) {
      const seq = byTeam[tid].sort((a, b) => order(a).localeCompare(order(b)))
      let cur = 0, best = 0
      for (const g of seq) { if (g.score > g.oppScore) { cur++; best = Math.max(best, cur) } else cur = 0 }
      if (best >= 2) streaks.push({ team: tname[tid] ?? '?', len: best, sport })
    }
  }
  streaks.sort((a, b) => b.len - a.len)

  // ── Season records ────────────────────────────────────────────────────────
  const recs = await db.select().from(teamRecords).where(eq(teamRecords.leagueId, id))
  const mostWins = [...recs].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0)).slice(0, 5)
    .map(r => ({ team: tname[r.teamId] ?? '?', wins: r.wins ?? 0, losses: r.losses ?? 0, sport: r.sport, season: r.season }))
  const bestPF = [...recs].sort((a, b) => (b.pointsFor ?? 0) - (a.pointsFor ?? 0)).slice(0, 5)
    .map(r => ({ team: tname[r.teamId] ?? '?', pf: +(r.pointsFor ?? 0).toFixed(1), sport: r.sport, season: r.season }))

  // ── Championship leaderboard ──────────────────────────────────────────────
  const history = await db.select().from(leagueHistory).where(eq(leagueHistory.leagueId, id))
  const titleCount: Record<string, { sport: number; federation: number }> = {}
  for (const h of history) {
    if (!h.championTeamId) continue
    const t = (titleCount[h.championTeamId] ??= { sport: 0, federation: 0 })
    if (h.scope === 'OVERALL') t.federation++; else t.sport++
  }
  const titles = Object.entries(titleCount)
    .map(([tid, c]) => ({ team: tname[tid] ?? '?', ...c, total: c.sport + c.federation }))
    .sort((a, b) => b.federation - a.federation || b.total - a.total)

  const single = topScores(sides)

  return NextResponse.json({
    single,
    streaks: streaks.slice(0, 5),
    mostWins, bestPF, titles,
    gamesPlayed: real.length,
  })
}
