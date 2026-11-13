import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, rosters, players, teamRecords, matchups, waiverClaims, gameSchedule, playerSeasonStats, dailyLineups } from '@/db/schema'
import { eq, and, or, inArray, gte, lte, notInArray, desc, sql } from 'drizzle-orm'
import { loadGameLines } from '@/lib/ysf-gamelines'
import { mapBoxScoreBase, deriveWeekly } from '@/lib/providers/boxscore-map'
import { scorePlayer } from '@/lib/scoring'
import { tank01Configured, tank01WeekProjections } from '@/lib/providers/tank01'
import { safeParse, orderedSports } from '@/lib/utils'
import { lineupCadenceFor, weekDateRange } from '@/lib/defaults'
import { weekDates } from '@/lib/dailylineup'
import { bearerUserId } from '@/lib/mobileAuth'
import { lastNflRun, nextNflRun } from '@/lib/waivers'
import { clubInk } from '@/lib/ysf'
import { playerProjection } from '@/lib/ysf-model'
import { taxiLockAt } from '@/lib/ysf-rules'
import { playerNews } from '@/lib/ysf-player-news'

// Everything the My Club page needs for one league (sport) and one week: the matchup, the lineup
// (per day for daily leagues) with each player's game, lock state and stats — that week's, the
// season's and projected — FAAB, pending claims, and the free-agent pool with stats. Past weeks show
// the lineup as it was played (read-only); future weeks the current roster.
//   GET /api/leagues/:id/myclub?sport=NBA&week=10&date=2026-11-12
// &team=<club id> shows another club's roster, view only (no claims, free agents or moves).
const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const uid = session?.user?.id ?? bearerUserId(req)
  const url = new URL(req.url)
  const viewId = url.searchParams.get('team')
  if (!uid && !viewId) return NextResponse.json({ error: 'Sign in to manage your club' }, { status: 401 })

  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 })
  const [team] = viewId
    ? await db.select().from(teams).where(and(eq(teams.leagueId, id), eq(teams.id, viewId))).limit(1)
    : await db.select().from(teams).where(and(eq(teams.leagueId, id), eq(teams.userId, uid!))).limit(1)
  if (!team) return NextResponse.json({ error: viewId ? 'Club not found' : 'You have no club in this league' }, { status: viewId ? 404 : 403 })
  // another club's roster: shown, not managed
  const readOnly = !uid || team.userId !== uid

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
  // ySFFL weeks run Tuesday–Monday (Thursday night through Monday night); the other leagues Monday–Sunday
  const wr = (w: number) => { const r = weekDateRange(season, w); if (sport !== 'NFL') return r; const d = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate() + 1); return { start: d(r.start), end: d(r.end) } }
  const curWeek = cur?.week ?? null
  const sched = safeParse<{ sport: string; startWeek: number; endWeek: number }[]>((league as any).sportSchedule, []).find(x => x.sport === sport)
  const teamWeeks = [...new Set((await db.select({ week: matchups.week }).from(matchups)
    .where(and(eq(matchups.leagueId, id), eq(matchups.season, season), eq(matchups.sport, sport), or(eq(matchups.homeTeamId, team.id), eq(matchups.awayTeamId, team.id))))).map(r => r.week))].sort((a, b) => a - b)
  const reqWeek = Number(url.searchParams.get('week'))
  const week = teamWeeks.includes(reqWeek) ? reqWeek : curWeek ?? teamWeeks[teamWeeks.length - 1] ?? null
  const pastWeek = week != null && (curWeek == null || week < curWeek)
  const futureWeek = week != null && curWeek != null && week > curWeek
  const per = week != null ? week - (sched?.startWeek ?? 1) + 1 : null
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
      const { start, end } = wr(week)
      matchup = { week, final: !!m.isComplete, start: start.toISOString(), end: end.toISOString(), me: m.homeTeamId === team.id ? m.homeScore : m.awayScore, them: m.homeTeamId === team.id ? m.awayScore : m.homeScore,
        opp: opp ? { id: opp.id, name: opp.name, abbreviation: opp.abbreviation, logo: opp.logo, altLogo: opp.altLogo, primaryColor: opp.primaryColor, ink: clubInk(opp.primaryColor, opp.secondaryColor) } : null }
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
  const range = week ? wr(week) : null
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
    for (const r of db.all<{ name: string; pts: number | null; st: string | null }>(sql`SELECT name, engine_pts pts, engine_stats st FROM fantrax_player_periods
      WHERE season = ${season} AND sport = ${sport} AND matchup_period = ${per} AND team_id = ${team.id} AND engine_pts IS NOT NULL`)) {
      const cur = wk.get(r.name) ?? { pts: 0, gp: 0 }
      cur.pts += r.pts ?? 0; cur.gp += Number(safeParse<any>(r.st, {}).GP ?? 0) || 0
      wk.set(r.name, cur)
    }
  }
  // ── stats: the week's (from the game logs), the season's, and projected ──
  const scoring = safeParse<Record<string, Record<string, number>>>(league.scoringSettings, {})[sport] ?? {}
  const wkRange = week ? wr(week) : null
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const wkStats = new Map<string, Record<string, number>>()
  if (wkRange && !futureWeek) {
    for (const l of loadGameLines(sport as any, iso(wkRange.start), iso(wkRange.end), scoring, true)) {
      for (const k of [l.tankId, `n:${l.name.toLowerCase()}`]) {
        const t = wkStats.get(k) ?? {}
        for (const [s, v] of Object.entries(l.stats)) t[s] = (t[s] ?? 0) + v
        wkStats.set(k, t)
      }
    }
  }
  // games each pro team plays in the week (for projections)
  const wkGames = new Map<string, number>()
  if (wkRange) for (const g of await db.select({ h: gameSchedule.homeAbbr, a: gameSchedule.awayAbbr }).from(gameSchedule)
    .where(and(eq(gameSchedule.sport, sport), gte(gameSchedule.gameDate, ymd(wkRange.start)), lte(gameSchedule.gameDate, ymd(wkRange.end)))))
    for (const t of [g.h, g.a]) if (t) wkGames.set(t, (wkGames.get(t) ?? 0) + 1)
  // ySFFL: Tank01's weekly projections, scored with the league's scoring; elsewhere (and as a
  // fallback) each player's per-game average times his team's games that week
  let tankProj: Record<string, any> = {}
  if (sport === 'NFL' && !pastWeek && per && tank01Configured()) {
    try { tankProj = await tank01WeekProjections('NFL', per, season) } catch { /* fall back to averages */ }
  }
  const extOf = new Map((rows.length ? await db.select({ id: players.id, ext: players.externalId }).from(players).where(inArray(players.id, rows.map(r => r.playerId))) : []).map(p => [p.id, p.ext]))
  const statsFor = (playerId: string | null, name: string, team: string | null) => {
    const st = playerId ? statBy.get(playerId) : undefined
    const seasonStats = safeParse<Record<string, number>>(st?.stats ?? null, {})
    const gp = st?.gp ?? 0, points = st?.points ?? null
    const ext = playerId ? extOf.get(playerId) ?? null : null
    const wk = (ext && wkStats.get(ext)) || wkStats.get(`n:${name.toLowerCase()}`) || null
    let proj: { pts: number; games: number; stats: Record<string, number>; source: string } | null = null
    const fromModel = !pastWeek && playerId && week != null ? playerProjection(playerId, season, week) : null
    if (fromModel) proj = { pts: +fromModel.pts.toFixed(1), games: fromModel.games, stats: fromModel.stats, source: fromModel.source }
    else if (!pastWeek) {
      const raw = ext ? tankProj[ext] : undefined
      if (raw) {
        const stats = deriveWeekly(sport, mapBoxScoreBase(sport, raw))
        proj = { pts: +scorePlayer(stats, scoring).toFixed(1), games: team ? wkGames.get(team) ?? 1 : 1, stats, source: 'tank01' }
      } else if (gp > 0) {
        const games = team ? wkGames.get(team) ?? 0 : 0
        const stats = Object.fromEntries(Object.entries(seasonStats).map(([k, v]) => [k, +(v / gp * games).toFixed(1)]))
        proj = { pts: +(((points ?? 0) / gp) * games).toFixed(1), games, stats, source: 'average' }
      }
    }
    return { gp, points, seasonStats, wkStats: wk, proj }
  }

  // past weeks: the lineup as Fantrax recorded it (read-only)
  const SLOT_FX: Record<string, string> = { RWT: 'RB/WR/TE', DST: 'DEF', Flx: 'UTIL', Skt: 'UTIL', UT: 'UTIL' }
  let roster: any[]
  if (pastWeek && per && id === 'ysf') {
    const hist = db.all<{ name: string; pro_team: string | null; positions: string | null; slot: string; status: string; opp: string | null; date: string | null; pts: number | null; st: string | null }>(sql`
      SELECT name, pro_team, positions, slot, status, opp, date, engine_pts pts, engine_stats st FROM fantrax_player_periods
      WHERE season = ${season} AND sport = ${sport} AND team_id = ${team.id} AND matchup_period = ${per}`)
    const day = date ?? null
    const shown = cadence === 'DAILY' && day ? hist.filter(h => h.date === day) : hist
    const byName = new Map(shown.map(h => [h.name, h]))
    const ids = new Map((byName.size ? await db.select({ id: players.id, name: players.name, ext: players.externalId, eligible: players.eligiblePositions, position: players.position })
      .from(players).where(and(eq(players.sport, sport), inArray(players.name, [...byName.keys()]))) : []).map(p => [p.name, p]))
    for (const p of ids.values()) extOf.set(p.id, p.ext)
    roster = [...byName.values()].map(h => {
      const p = ids.get(h.name)
      const tot = hist.filter(x => x.name === h.name)
      const s = statsFor(p?.id ?? null, h.name, h.pro_team)
      return { rosterId: `h-${h.name}`, playerId: p?.id ?? '', name: h.name, position: p?.position ?? (h.positions ?? '').split(',')[0], pos: (h.positions ?? '').replace(/,/g, '/'), team: h.pro_team,
        slot: h.status === '1' ? SLOT_FX[h.slot] ?? h.slot : h.status === '3' ? 'IR' : h.status === '9' ? 'TAXI' : 'BN', injury: null, injuryNote: null,
        game: null, oppText: h.opp ? h.opp.replace(/ F$/, '') : null, locked: true, gp: s.gp, points: s.points,
        wkGp: tot.reduce((a, x) => a + (Number(safeParse<any>(x.st, {}).GP ?? 0) || 0), 0), wkPoints: tot.some(x => x.pts != null) ? +tot.reduce((a, x) => a + (x.pts ?? 0), 0).toFixed(2) : null,
        seasonStats: s.seasonStats, wkStats: s.wkStats, proj: null }
    })
  } else {
    roster = rows.map(r => {
      const g = gameOf(r.team)
      const started = !!g && ((g.epoch != null && Date.now() >= g.epoch) || /final|completed|live|progress/i.test(g.status))
      const s = statsFor(r.playerId, r.name, r.team)
      return { rosterId: r.rosterId, playerId: r.playerId, name: r.name, position: r.position, pos: posOf(r.position, r.eligible), team: r.team,
        slot: overrides[r.playerId] ?? r.slot, injury: r.status && !/^(active|healthy)$/i.test(r.status) ? r.status : null, injuryNote: r.injury || null,
        // a future week of a weekly league shows the lineup as it stands; it is set week by week
        game: g, locked: pastDay || started || (futureWeek && cadence !== 'DAILY'), gp: s.gp, points: s.points,
        wkGp: wk.get(r.name)?.gp ?? 0, wkPoints: wk.has(r.name) ? +wk.get(r.name)!.pts.toFixed(2) : null,
        seasonStats: s.seasonStats, wkStats: s.wkStats, proj: s.proj }
    })
  }

  // FAAB + claims
  const [rec] = await db.select().from(teamRecords).where(and(eq(teamRecords.teamId, team.id), eq(teamRecords.season, season), eq(teamRecords.sport, sport))).limit(1)
  const claimRows = readOnly ? [] : await db.select().from(waiverClaims).where(and(eq(waiverClaims.leagueId, id), eq(waiverClaims.teamId, team.id), eq(waiverClaims.status, 'PENDING')))
  const claimPlayers = claimRows.length ? await db.select({ id: players.id, name: players.name, sport: players.sport, team: players.realTeamAbbr, position: players.position }).from(players)
    .where(inArray(players.id, [...new Set(claimRows.flatMap(c => [c.addPlayerId, c.dropPlayerId].filter(Boolean) as string[]))])) : []
  const cpBy = new Map(claimPlayers.map(p => [p.id, p]))
  const claims = claimRows.map(c => ({ id: c.id, bid: c.bidAmount, add: cpBy.get(c.addPlayerId) ?? null, drop: c.dropPlayerId ? cpBy.get(c.dropPlayerId) ?? null : null }))

  // free agents: not rostered by any club in the league, best season points first
  const leagueTeamIds = (await db.select({ id: teams.id }).from(teams).where(eq(teams.leagueId, id))).map(t => t.id)
  const rostered = (await db.select({ p: rosters.playerId }).from(rosters).where(and(inArray(rosters.teamId, leagueTeamIds), eq(rosters.sport, sport)))).map(r => r.p)
  const faRows = readOnly ? [] : await db.select({ playerId: players.id, name: players.name, position: players.position, eligible: players.eligiblePositions, team: players.realTeamAbbr,
      status: players.status, injury: players.injuryNote, gp: playerSeasonStats.gp, points: playerSeasonStats.points })
    .from(playerSeasonStats).innerJoin(players, eq(playerSeasonStats.playerId, players.id))
    .where(and(eq(playerSeasonStats.leagueId, id), eq(playerSeasonStats.season, season), eq(playerSeasonStats.sport, sport), rostered.length ? notInArray(players.id, rostered) : undefined))
    .orderBy(desc(playerSeasonStats.points)).limit(250)
  // on waivers (claim, processed at the waiver run) vs free agents (add straight away): dropped players
  // until they clear, and in ySFFL anyone whose game this week has kicked off (until Wednesday's run)
  const wire = new Map(db.all<{ p: string; c: string }>(sql`SELECT player_id p, clears_at c FROM waiver_wire WHERE league_id = ${id} AND sport = ${sport} AND clears_at > ${now.toISOString()}`).map(r => [r.p, r.c]))
  let nflLocked = new Set<string>()
  if (sport === 'NFL' && id === 'ysf') {
    const since = Math.floor(lastNflRun(now).getTime() / 1000), until = Math.floor(now.getTime() / 1000) + 300
    nflLocked = new Set(db.all<{ t: string }>(sql`SELECT home_abbr t FROM game_schedule WHERE sport = 'NFL' AND game_time_epoch BETWEEN ${since} AND ${until} UNION SELECT away_abbr FROM game_schedule WHERE sport = 'NFL' AND game_time_epoch BETWEEN ${since} AND ${until}`).map(r => r.t))
  }
  const nflRun = nextNflRun(now, 0).toISOString()
  const clearsOf = (pid: string, team: string | null) => wire.get(pid) ?? (team && nflLocked.has(team) ? nflRun : null)
  const freeAgents = faRows.map(f => ({ clears: clearsOf(f.playerId, f.team), playerId: f.playerId, name: f.name, position: f.position, pos: posOf(f.position, f.eligible), team: f.team, gp: f.gp ?? 0, points: f.points ?? 0,
    injury: f.status && !/^(active|healthy)$/i.test(f.status) ? f.status : null, injuryNote: f.injury || null, pending: claims.some(c => c.add?.id === f.playerId) }))

  // trade partners + my picks for this sport
  const others = (await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation, logo: teams.logo, altLogo: teams.altLogo, primaryColor: teams.primaryColor, secondaryColor: teams.secondaryColor })
    .from(teams).where(and(eq(teams.leagueId, id), eq(teams.archived, false)))).map(o => ({ ...o, ink: clubInk(o.primaryColor, o.secondaryColor) }))

  // player news: each player's latest note, and the roster's newest notes
  const pn = playerNews(roster.map(r => r.playerId).filter(Boolean), 8)
  roster = roster.map(r => ({ ...r, news: pn.latest.get(r.playerId) ?? null }))

  return NextResponse.json({
    readOnly, news: pn.recent,
    team: { id: team.id, name: team.name, abbreviation: team.abbreviation, logo: team.logo, altLogo: team.altLogo, primaryColor: team.primaryColor, ink: clubInk(team.primaryColor, team.secondaryColor) },
    sports: sportsEnabled.map(s => ({ sport: s, code: sportAbbr[s] || s })), sport, code: sportAbbr[sport] || sport,
    taxiLocked: id === 'ysf' ? ((await taxiLockAt(sport))?.getTime() ?? Infinity) <= Date.now() : false,
    cadence, week, curWeek, weeks: teamWeeks.map(w => { const r = wr(w); return { week: w, label: sched ? `${sport === 'NFL' ? 'WEEK' : 'PERIOD'} ${w - sched.startWeek + 1}` : `WEEK ${w}`, start: r.start.toISOString(), end: r.end.toISOString() } }), past: pastWeek, future: futureWeek, dates, date, today: `${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6)}`, matchup,
    slots: rosterCfg, roster, faab: rec?.faabRemaining ?? 0, waiverPriority: rec?.waiverPriority ?? null, claims, freeAgents,
    clubs: others.filter(o => o.id !== team.id),
  })
}
