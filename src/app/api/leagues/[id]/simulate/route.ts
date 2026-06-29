import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, rosters, players, matchups, teamRecords, playerGameStats } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { safeParse } from '@/lib/utils'
import { RESERVE_SLOTS } from '@/lib/defaults'
import { scorePlayer, generateStatLine } from '@/lib/scoring'
import { logActivity } from '@/lib/activity'

const isStarter = (slot: string) => !RESERVE_SLOTS.includes(slot)

// Generate stat lines for a sport+week, score the matchups, and update standings.
async function scoreSportWeek(league: any, sport: string, week: number) {
  const scoring = (safeParse<any>(league.scoringSettings, {})[sport]) ?? {}

  // Rostered players of this sport in the league.
  const roster = await db
    .select({ playerId: rosters.playerId, teamId: rosters.teamId, slot: rosters.slot, position: players.position, projected: players.projectedPoints })
    .from(rosters).innerJoin(players, eq(rosters.playerId, players.id)).innerJoin(teams, eq(rosters.teamId, teams.id))
    .where(and(eq(teams.leagueId, league.id), eq(rosters.sport, sport)))
  if (!roster.length) return

  const avgProj = roster.reduce((a, r) => a + (r.projected ?? 0), 0) / roster.length || 1

  // Fresh stat lines for this week.
  await db.delete(playerGameStats).where(and(eq(playerGameStats.leagueId, league.id), eq(playerGameStats.season, league.season), eq(playerGameStats.week, week), eq(playerGameStats.sport, sport)))
  const pointsByPlayer: Record<string, number> = {}
  for (const r of roster) {
    const talent = (r.projected ?? avgProj) / avgProj
    const stats = generateStatLine(sport, r.position, talent)
    const pts = scorePlayer(stats, scoring)
    pointsByPlayer[r.playerId] = pts
    await db.insert(playerGameStats).values({ id: nanoid(), leagueId: league.id, season: league.season, week, sport, playerId: r.playerId, teamId: r.teamId, stats: JSON.stringify(stats), points: pts })
  }

  // Each team's starter total for the week.
  const teamTotal: Record<string, number> = {}
  for (const r of roster) if (isStarter(r.slot)) teamTotal[r.teamId] = +(((teamTotal[r.teamId] ?? 0) + (pointsByPlayer[r.playerId] ?? 0)).toFixed(1))

  // Score this week's matchups.
  const games = await db.select().from(matchups).where(and(eq(matchups.leagueId, league.id), eq(matchups.sport, sport), eq(matchups.week, week)))
  for (const g of games) {
    const hs = teamTotal[g.homeTeamId] ?? 0
    const as = g.awayTeamId ? (teamTotal[g.awayTeamId] ?? 0) : 0
    await db.update(matchups).set({ homeScore: hs, awayScore: as, isComplete: true }).where(eq(matchups.id, g.id))
  }

  // Recompute this sport's standings from all completed matchups this season.
  const allGames = await db.select().from(matchups).where(and(eq(matchups.leagueId, league.id), eq(matchups.sport, sport), eq(matchups.isComplete, true)))
  const rec: Record<string, { w: number; l: number; t: number; pf: number; pa: number }> = {}
  const bump = (id: string) => (rec[id] ??= { w: 0, l: 0, t: 0, pf: 0, pa: 0 })
  for (const g of allGames) {
    if (!g.awayTeamId) continue
    const h = bump(g.homeTeamId), a = bump(g.awayTeamId)
    h.pf += g.homeScore ?? 0; h.pa += g.awayScore ?? 0; a.pf += g.awayScore ?? 0; a.pa += g.homeScore ?? 0
    if ((g.homeScore ?? 0) > (g.awayScore ?? 0)) { h.w++; a.l++ } else if ((g.homeScore ?? 0) < (g.awayScore ?? 0)) { a.w++; h.l++ } else { h.t++; a.t++ }
  }
  const ranked = Object.entries(rec).sort((x, y) => y[1].w - x[1].w || y[1].pf - x[1].pf)
  for (let i = 0; i < ranked.length; i++) {
    const [teamId, r] = ranked[i]
    await db.update(teamRecords).set({ wins: r.w, losses: r.l, ties: r.t, pointsFor: +r.pf.toFixed(1), pointsAgainst: +r.pa.toFixed(1), finishPosition: i + 1 })
      .where(and(eq(teamRecords.teamId, teamId), eq(teamRecords.leagueId, league.id), eq(teamRecords.season, league.season), eq(teamRecords.sport, sport)))
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (league.commissionerId !== session.user.id) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { sport?: string; week?: number }
  const sports = safeParse<string[]>(league.sportsEnabled, [])

  const targets: { sport: string; week: number }[] = []
  if (body.sport && body.week) {
    targets.push({ sport: body.sport, week: body.week })
  } else {
    // Advance each sport's current (lowest incomplete) week.
    for (const sport of sports) {
      const incomplete = await db.select({ week: matchups.week }).from(matchups)
        .where(and(eq(matchups.leagueId, id), eq(matchups.sport, sport), eq(matchups.isComplete, false)))
      const weeks = incomplete.map(r => r.week)
      if (weeks.length) targets.push({ sport, week: Math.min(...weeks) })
    }
  }

  for (const tgt of targets) await scoreSportWeek(league, tgt.sport, tgt.week)
  if (targets.length) await logActivity(id, 'SCORES', `Scores posted: ${targets.map(t => `${t.sport} Wk ${t.week}`).join(', ')}`)
  return NextResponse.json({ ok: true, scored: targets })
}
