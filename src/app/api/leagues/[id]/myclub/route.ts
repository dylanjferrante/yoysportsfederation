import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, rosters, players, teamRecords, matchups, waiverClaims, gameSchedule, playerSeasonStats, dailyLineups } from '@/db/schema'
import { eq, and, inArray, gte, lte, notInArray, desc, sql } from 'drizzle-orm'
import { safeParse, orderedSports } from '@/lib/utils'
import { lineupCadenceFor, weekDateRange } from '@/lib/defaults'
import { weekDates } from '@/lib/dailylineup'
import { bearerUserId } from '@/lib/mobileAuth'

// Everything the My Club page needs for one league (sport): this week's matchup, the lineup
// (per day for daily leagues) with each player's game, lock state and season stats, FAAB,
// pending claims, and the free-agent pool with stats.
//   GET /api/leagues/:id/myclub?sport=NBA&date=2026-11-12
const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const uid = session?.user?.id ?? bearerUserId(req)
  if (!uid) return NextResponse.json({ error: 'Sign in to manage your club' }, { status: 401 })

  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 })
  const [team] = await db.select().from(teams).where(and(eq(teams.leagueId, id), eq(teams.userId, uid))).limit(1)
  if (!team) return NextResponse.json({ error: 'You have no club in this league' }, { status: 403 })

  const url = new URL(req.url)
  const sportsEnabled = orderedSports(safeParse<string[]>(league.sportsEnabled, []), league.seasonStart)
  const sport = url.searchParams.get('sport') && sportsEnabled.includes(url.searchParams.get('sport')!) ? url.searchParams.get('sport')! : sportsEnabled[0]
  const season = league.season
  const cadence = lineupCadenceFor(safeParse<Record<string, string>>(league.lineupCadence, {}), sport)
  const rosterCfg = safeParse<Record<string, Record<string, number>>>(league.rosterSettings, {})[sport] ?? {}
  const sportAbbr = safeParse<Record<string, string>>(league.sportAbbr, {})

  // this week = the earliest incomplete matchup week for the sport
  const [cur] = await db.select({ week: matchups.week }).from(matchups)
    .where(and(eq(matchups.leagueId, id), eq(matchups.season, season), eq(matchups.sport, sport), eq(matchups.isComplete, false)))
    .orderBy(matchups.week).limit(1)
  const week = cur?.week ?? null
  const now = new Date(), today = ymd(now)
  const dates = week && cadence === 'DAILY' ? weekDates(season, week) : []
  const date = dates.length ? (url.searchParams.get('date') && dates.includes(url.searchParams.get('date')!) ? url.searchParams.get('date')! : (dates.find(d => d.replace(/-/g, '') >= today) ?? dates[dates.length - 1])) : null

  // matchup
  let matchup: any = null
  if (week) {
    const ms = await db.select().from(matchups).where(and(eq(matchups.leagueId, id), eq(matchups.season, season), eq(matchups.sport, sport), eq(matchups.week, week)))
    const m = ms.find(x => x.homeTeamId === team.id || x.awayTeamId === team.id)
    if (m) {
      const oppId = m.homeTeamId === team.id ? m.awayTeamId : m.homeTeamId
      const [opp] = oppId ? await db.select().from(teams).where(eq(teams.id, oppId)).limit(1) : []
      const { start, end } = weekDateRange(season, week)
      matchup = { week, start: start.toISOString(), end: end.toISOString(), me: m.homeTeamId === team.id ? m.homeScore : m.awayScore, them: m.homeTeamId === team.id ? m.awayScore : m.homeScore,
        opp: opp ? { id: opp.id, name: opp.name, abbreviation: opp.abbreviation, logo: opp.logo, altLogo: opp.altLogo, primaryColor: opp.primaryColor } : null }
    }
  }

  // roster with effective slot for the day
  const rows = await db.select({ rosterId: rosters.id, slot: rosters.slot, playerId: players.id, name: players.name, position: players.position, eligible: players.eligiblePositions,
      team: players.realTeamAbbr, status: players.status, injury: players.injuryNote })
    .from(rosters).innerJoin(players, eq(rosters.playerId, players.id))
    .where(and(eq(rosters.teamId, team.id), eq(rosters.sport, sport)))
  const overrides: Record<string, string> = {}
  if (date) for (const o of await db.select().from(dailyLineups).where(and(eq(dailyLineups.teamId, team.id), eq(dailyLineups.season, season), eq(dailyLineups.sport, sport), eq(dailyLineups.date, date)))) overrides[o.playerId] = o.slot

  // games: the selected day (daily) or the whole week (weekly)
  const range = week ? weekDateRange(season, week) : null
  const from = date ? date.replace(/-/g, '') : range ? ymd(range.start) : today
  const to = date ? date.replace(/-/g, '') : range ? ymd(new Date(range.end.getTime() + 86_400_000)) : today
  const games = await db.select().from(gameSchedule).where(and(eq(gameSchedule.sport, sport), gte(gameSchedule.gameDate, from), lte(gameSchedule.gameDate, to)))
  const gameOf = (abbr: string | null) => {
    if (!abbr) return null
    const g = games.filter(x => x.homeAbbr === abbr || x.awayAbbr === abbr).sort((a, b) => Number(a.gameTimeEpoch ?? 0) - Number(b.gameTimeEpoch ?? 0))[0]
    if (!g) return null
    const home = g.homeAbbr === abbr
    return { opp: home ? g.awayAbbr : g.homeAbbr, home, epoch: g.gameTimeEpoch ? Number(g.gameTimeEpoch) * 1000 : null, status: g.status ?? '', gameId: g.id }
  }
  const pastDay = !!date && date.replace(/-/g, '') < today

  const statRows = await db.select().from(playerSeasonStats).where(and(eq(playerSeasonStats.leagueId, id), eq(playerSeasonStats.season, season), eq(playerSeasonStats.sport, sport)))
  const statBy = new Map(statRows.map(s => [s.playerId, s]))
  const posOf = (position: string, eligible: string | null) => { const e = safeParse<string[]>(eligible, []); return (e.length > 1 ? e : [position]).join('/') }

  // this matchup's points and games for each player, from the scoring engine's per-day/per-week lines
  const wk = new Map<string, { pts: number; gp: number }>()
  if (week && id === 'ysf') {
    const startWeek = safeParse<{ sport: string; startWeek: number }[]>((league as any).sportSchedule, []).find(x => x.sport === sport)?.startWeek ?? 1
    const per = week - startWeek + 1
    for (const r of db.all<{ name: string; pts: number | null; st: string | null }>(sql`SELECT name, engine_pts pts, engine_stats st FROM fantrax_player_periods
      WHERE season = ${season} AND sport = ${sport} AND matchup_period = ${per} AND team_id = ${team.id} AND engine_pts IS NOT NULL`)) {
      const cur = wk.get(r.name) ?? { pts: 0, gp: 0 }
      cur.pts += r.pts ?? 0; cur.gp += Number(safeParse<any>(r.st, {}).GP ?? 0) || 0
      wk.set(r.name, cur)
    }
  }
  const roster = rows.map(r => {
    const g = gameOf(r.team)
    const started = !!g && ((g.epoch != null && Date.now() >= g.epoch) || /final|completed|live|progress/i.test(g.status))
    const st = statBy.get(r.playerId)
    return { rosterId: r.rosterId, playerId: r.playerId, name: r.name, position: r.position, pos: posOf(r.position, r.eligible), team: r.team,
      slot: overrides[r.playerId] ?? r.slot, injury: r.status && !/^(active|healthy)$/i.test(r.status) ? r.status : null, injuryNote: r.injury || null,
      game: g, locked: pastDay || started, gp: st?.gp ?? 0, points: st?.points ?? null,
      wkGp: wk.get(r.name)?.gp ?? 0, wkPoints: wk.has(r.name) ? +wk.get(r.name)!.pts.toFixed(2) : null }
  })

  // FAAB + claims
  const [rec] = await db.select().from(teamRecords).where(and(eq(teamRecords.teamId, team.id), eq(teamRecords.season, season), eq(teamRecords.sport, sport))).limit(1)
  const claimRows = await db.select().from(waiverClaims).where(and(eq(waiverClaims.leagueId, id), eq(waiverClaims.teamId, team.id), eq(waiverClaims.status, 'PENDING')))
  const claimPlayers = claimRows.length ? await db.select({ id: players.id, name: players.name, sport: players.sport, team: players.realTeamAbbr, position: players.position }).from(players)
    .where(inArray(players.id, [...new Set(claimRows.flatMap(c => [c.addPlayerId, c.dropPlayerId].filter(Boolean) as string[]))])) : []
  const cpBy = new Map(claimPlayers.map(p => [p.id, p]))
  const claims = claimRows.map(c => ({ id: c.id, bid: c.bidAmount, add: cpBy.get(c.addPlayerId) ?? null, drop: c.dropPlayerId ? cpBy.get(c.dropPlayerId) ?? null : null }))

  // free agents: not rostered by any club in the league, best season points first
  const leagueTeamIds = (await db.select({ id: teams.id }).from(teams).where(eq(teams.leagueId, id))).map(t => t.id)
  const rostered = (await db.select({ p: rosters.playerId }).from(rosters).where(and(inArray(rosters.teamId, leagueTeamIds), eq(rosters.sport, sport)))).map(r => r.p)
  const faRows = await db.select({ playerId: players.id, name: players.name, position: players.position, eligible: players.eligiblePositions, team: players.realTeamAbbr,
      status: players.status, injury: players.injuryNote, gp: playerSeasonStats.gp, points: playerSeasonStats.points })
    .from(playerSeasonStats).innerJoin(players, eq(playerSeasonStats.playerId, players.id))
    .where(and(eq(playerSeasonStats.leagueId, id), eq(playerSeasonStats.season, season), eq(playerSeasonStats.sport, sport), rostered.length ? notInArray(players.id, rostered) : undefined))
    .orderBy(desc(playerSeasonStats.points)).limit(250)
  const freeAgents = faRows.map(f => ({ playerId: f.playerId, name: f.name, position: f.position, pos: posOf(f.position, f.eligible), team: f.team, gp: f.gp ?? 0, points: f.points ?? 0,
    injury: f.status && !/^(active|healthy)$/i.test(f.status) ? f.status : null, injuryNote: f.injury || null, pending: claims.some(c => c.add?.id === f.playerId) }))

  // trade partners + my picks for this sport
  const others = await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation, logo: teams.logo, altLogo: teams.altLogo, primaryColor: teams.primaryColor })
    .from(teams).where(and(eq(teams.leagueId, id), eq(teams.archived, false)))

  return NextResponse.json({
    team: { id: team.id, name: team.name, abbreviation: team.abbreviation, logo: team.logo, altLogo: team.altLogo, primaryColor: team.primaryColor },
    sports: sportsEnabled.map(s => ({ sport: s, code: sportAbbr[s] || s })), sport, code: sportAbbr[sport] || sport,
    cadence, week, dates, date, today: `${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6)}`, matchup,
    slots: rosterCfg, roster, faab: rec?.faabRemaining ?? 0, waiverPriority: rec?.waiverPriority ?? null, claims, freeAgents,
    clubs: others.filter(o => o.id !== team.id),
  })
}
