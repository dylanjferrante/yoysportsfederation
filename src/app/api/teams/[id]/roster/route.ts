import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { teams, rosters, players, draftPicks, users, leagues, playerGameStats, matchups, activity, dailyLineups } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { safeParse } from '@/lib/utils'
import { slotEligible, irEligible, defaultIrDesignations, lineupCadenceFor } from '@/lib/defaults'
import { weekDates, gameDateOf, teamDayLineups } from '@/lib/dailylineup'
import { logActivity } from '@/lib/activity'
import { realOpponents } from '@/lib/realschedule'
import { scheduleOpponents, scheduleKickoffs } from '@/lib/schedule'
import { playerKickoff } from '@/lib/locks'
import { placeOnWaivers, onWaivers } from '@/lib/waivers'
import { isTeamManager } from '@/lib/permissions'
import { teamManagers } from '@/db/schema'

// A franchise's full cross-sport roster + tradeable picks + slot options.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)

  const [team] = await db
    .select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation, logo: teams.logo, altLogo: teams.altLogo, wordmark: teams.wordmark, primaryColor: teams.primaryColor, secondaryColor: teams.secondaryColor, logoBg: teams.logoBg, leagueId: teams.leagueId, userId: teams.userId, ownerName: users.name })
    .from(teams).leftJoin(users, eq(teams.userId, users.id))
    .where(eq(teams.id, id)).limit(1)
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [league] = await db.select().from(leagues).where(eq(leagues.id, team.leagueId)).limit(1)

  const roster = await db
    .select({
      rosterId: rosters.id, slot: rosters.slot, sport: rosters.sport, onBlock: rosters.onBlock, isKeeper: rosters.isKeeper,
      salary: rosters.salary, contractYears: rosters.contractYears,
      id: players.id, name: players.name, position: players.position,
      realTeam: players.realTeam, realTeamAbbr: players.realTeamAbbr, status: players.status,
      injuryNote: players.injuryNote, byeWeek: players.byeWeek,
      seasonPoints: players.seasonPoints, projectedPoints: players.projectedPoints, weeklyAvg: players.weeklyAvg,
    })
    .from(rosters).innerJoin(players, eq(rosters.playerId, players.id))
    .where(eq(rosters.teamId, id))

  const picks = await db.select().from(draftPicks).where(and(eq(draftPicks.currentTeamId, id), eq(draftPicks.isUsed, false)))

  // Aggregate each player's game logs → season category totals, games played, last game.
  const playerIds = roster.map(r => r.id)
  const logs = playerIds.length
    ? await db.select({ playerId: playerGameStats.playerId, week: playerGameStats.week, points: playerGameStats.points, stats: playerGameStats.stats })
        .from(playerGameStats)
        .where(and(eq(playerGameStats.leagueId, team.leagueId), eq(playerGameStats.season, league?.season ?? ''), inArray(playerGameStats.playerId, playerIds)))
    : []
  const agg: Record<string, { season: Record<string, number>; gp: number; lastWk: number; lastPts: number }> = {}
  for (const g of logs) {
    const a = (agg[g.playerId] ??= { season: {}, gp: 0, lastWk: -1, lastPts: 0 })
    const s = safeParse<Record<string, number>>(g.stats ?? '{}', {})
    for (const k in s) a.season[k] = (a.season[k] ?? 0) + (s[k] ?? 0)
    a.gp++
    if (g.week > a.lastWk) { a.lastWk = g.week; a.lastPts = g.points ?? 0 }
  }

  // Current (lowest incomplete) week per sport → drives this week's real opponent.
  const incompletes = await db.select({ sport: matchups.sport, week: matchups.week })
    .from(matchups).where(and(eq(matchups.leagueId, team.leagueId), eq(matchups.isComplete, false)))
  const curWeek: Record<string, number> = {}
  for (const m of incompletes) curWeek[m.sport] = Math.min(curWeek[m.sport] ?? Infinity, m.week)

  // Real-game opponent map per sport. Prefer the real schedule (game_schedule);
  // fall back to the synthetic round-robin when no schedule has been synced.
  const sportsOnRoster = [...new Set(roster.map(r => r.sport))]
  const leagueSeason = league?.season ?? ''
  const oppMaps: Record<string, Record<string, { opp: string; home: boolean }>> = {}
  const koMaps: Record<string, Record<string, number> | null> = {} // real kickoff (epoch ms) per team
  for (const sp of sportsOnRoster) {
    const week = curWeek[sp] ?? 1
    const abbrs = (await db.select({ a: players.realTeamAbbr }).from(players).where(eq(players.sport, sp))).map(r => r.a).filter(Boolean) as string[]
    oppMaps[sp] = (await scheduleOpponents(sp, leagueSeason, abbrs, week)) ?? realOpponents(abbrs, week)
    koMaps[sp] = await scheduleKickoffs(sp, leagueSeason, week)
  }

  const season = league?.season ?? ''
  const enriched = roster.map(r => {
    const a = agg[r.id]
    const wk = curWeek[r.sport] ?? 1
    // Prefer the real kickoff from the schedule; fall back to the synthetic one.
    const realKo = r.realTeamAbbr ? koMaps[r.sport]?.[r.realTeamAbbr] : null
    const kickoff = realKo ?? playerKickoff(r.sport, r.realTeamAbbr, season, wk)
    return {
      ...r,
      gp: a?.gp ?? 0,
      lastPts: a?.lastPts ?? null,
      seasonStats: a?.season ?? {},
      opp: r.realTeamAbbr ? (oppMaps[r.sport]?.[r.realTeamAbbr] ?? null) : null,
      kickoff,
      locked: kickoff != null && Date.now() >= kickoff,
      gameDate: gameDateOf(r.sport, r.realTeamAbbr, season, wk),
    }
  }).sort((x, y) => (y.seasonPoints ?? 0) - (x.seasonPoints ?? 0))

  // Lineup cadence per sport (NFL weekly, others daily by default) + the current
  // week's calendar dates and the team's per-day lineup overrides for daily sports.
  const cadRaw = safeParse<Record<string, string>>(league?.lineupCadence, {})
  const cadence: Record<string, string> = {}
  const sportWeekDates: Record<string, string[]> = {}
  const dailyOverrides: Record<string, Record<string, Record<string, string>>> = {}
  for (const sp of sportsOnRoster) {
    cadence[sp] = lineupCadenceFor(cadRaw, sp)
    if (cadence[sp] !== 'DAILY') continue
    const dates = weekDates(season, curWeek[sp] ?? 1)
    sportWeekDates[sp] = dates
    dailyOverrides[sp] = await teamDayLineups(team.leagueId, id, season, sp, dates)
  }

  picks.sort((a, b) => a.year - b.year || (a.sport ?? '').localeCompare(b.sport ?? '') || a.round - b.round)

  const managers = await db
    .select({ userId: teamManagers.userId, name: users.name, email: users.email })
    .from(teamManagers).leftJoin(users, eq(teamManagers.userId, users.id))
    .where(eq(teamManagers.teamId, id))

  const isOwner = !!session && session.user.id === team.userId
  const isCommish = !!session && session.user.id === league?.commissionerId
  const isCoManager = !!session && managers.some(m => m.userId === session.user.id)
  const canManage = isOwner || isCommish || isCoManager

  return NextResponse.json({
    team, players: enriched, picks, managers,
    cadence, weekDates: sportWeekDates, dailyLineups: dailyOverrides,
    rosterSettings: safeParse(league?.rosterSettings, {}),
    keeperEnabled: !!league?.keeperEnabled, keeperCount: league?.keeperCount ?? 0,
    salaryCapEnabled: !!league?.salaryCapEnabled, salaryCap: league?.salaryCap ?? 0, capMode: league?.capMode ?? 'SOFT',
    canManage, isOwner, isCommish, isCoManager,
  })
}

// Roster actions: move a player to a slot, drop, or add a free agent.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1)
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [league] = await db.select().from(leagues).where(eq(leagues.id, team.leagueId)).limit(1)
  if (team.userId !== session.user.id && league?.commissionerId !== session.user.id && !(await isTeamManager(id, session.user.id)))
    return NextResponse.json({ error: 'Not your franchise' }, { status: 403 })

  const body = await req.json() as { action: string; rosterId?: string; slot?: string; playerId?: string; dropRosterId?: string; onBlock?: boolean; isKeeper?: boolean; salary?: number; contractYears?: number; date?: string }

  if (body.action === 'SET_SLOT' && body.rosterId && body.slot) {
    // Validate the player is eligible for the requested slot.
    const [row] = await db
      .select({ playerId: rosters.playerId, sport: rosters.sport, slot: rosters.slot, position: players.position, status: players.status, realTeamAbbr: players.realTeamAbbr, isRookie: players.isRookie })
      .from(rosters).innerJoin(players, eq(rosters.playerId, players.id))
      .where(and(eq(rosters.id, body.rosterId), eq(rosters.teamId, id))).limit(1)
    if (!row) return NextResponse.json({ error: 'Not on roster' }, { status: 400 })
    // Per-player game-time lock: once a player's game has kicked off, their slot
    // is frozen for the week. Commissioners may still override.
    const isCommish = league?.commissionerId === session.user.id
    if (!isCommish && row.slot !== body.slot) {
      const [cur] = await db.select({ week: matchups.week })
        .from(matchups)
        .where(and(eq(matchups.leagueId, team.leagueId), eq(matchups.sport, row.sport), eq(matchups.isComplete, false)))
        .orderBy(matchups.week).limit(1)
      const wk = cur?.week ?? 1
      // Prefer the real game time; fall back to the synthetic kickoff.
      const realKo = (await scheduleKickoffs(row.sport, league?.season ?? '', wk))?.[row.realTeamAbbr ?? '']
      const ko = realKo ?? playerKickoff(row.sport, row.realTeamAbbr, league?.season ?? '', wk)
      if (ko != null && Date.now() >= ko)
        return NextResponse.json({ error: `${row.position} is locked — their game has already started` }, { status: 400 })
    }
    if (!slotEligible(row.position, body.slot)) return NextResponse.json({ error: `Not eligible for ${body.slot}` }, { status: 400 })
    // Injured-reserve slots require an injury designation the commissioner has
    // marked IR-eligible for that sport.
    if (['IR', 'IL', 'DL'].includes(body.slot)) {
      const config = safeParse<Record<string, string[]>>(league?.irEligibleDesignations, defaultIrDesignations([row.sport]))
      if (!irEligible(row.sport, row.status, config))
        return NextResponse.json({ error: `Player's status (${row.status || 'ACTIVE'}) is not IR-eligible in this league` }, { status: 400 })
    }
    // Taxi-squad eligibility (e.g. rookies only).
    if (body.slot === 'TAXI' && (league?.taxiEligibility ?? 'ALL') === 'ROOKIES' && !row.isRookie) {
      return NextResponse.json({ error: 'Only rookies may be placed on the taxi squad in this league' }, { status: 400 })
    }
    // Daily-cadence sports: a dated move sets that one calendar day's lineup
    // (leaving the standing lineup, and every other day, untouched). A move with
    // no date sets the standing lineup that every un-overridden day inherits.
    const cadence = lineupCadenceFor(safeParse<Record<string, string>>(league?.lineupCadence, {}), row.sport)
    if (body.date && cadence === 'DAILY') {
      await db.insert(dailyLineups)
        .values({ id: nanoid(), leagueId: team.leagueId, teamId: id, season: league?.season ?? '', sport: row.sport, date: body.date, playerId: row.playerId, slot: body.slot })
        .onConflictDoUpdate({ target: [dailyLineups.teamId, dailyLineups.season, dailyLineups.sport, dailyLineups.date, dailyLineups.playerId], set: { slot: body.slot } })
      return NextResponse.json({ ok: true })
    }
    await db.update(rosters).set({ slot: body.slot }).where(and(eq(rosters.id, body.rosterId), eq(rosters.teamId, id)))
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'SET_BLOCK' && body.rosterId) {
    await db.update(rosters).set({ onBlock: !!body.onBlock }).where(and(eq(rosters.id, body.rosterId), eq(rosters.teamId, id)))
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'SET_KEEPER' && body.rosterId) {
    if (!league?.keeperEnabled) return NextResponse.json({ error: 'Keepers are not enabled in this league' }, { status: 400 })
    const [row] = await db.select({ sport: rosters.sport }).from(rosters).where(and(eq(rosters.id, body.rosterId), eq(rosters.teamId, id))).limit(1)
    if (!row) return NextResponse.json({ error: 'Not on roster' }, { status: 400 })
    // Enforce the per-sport keeper limit when designating a new keeper.
    if (body.isKeeper) {
      const kept = await db.select({ id: rosters.id }).from(rosters)
        .where(and(eq(rosters.teamId, id), eq(rosters.sport, row.sport), eq(rosters.isKeeper, true)))
      if (kept.length >= (league.keeperCount ?? 0))
        return NextResponse.json({ error: `Keeper limit reached: max ${league.keeperCount} in ${row.sport}` }, { status: 400 })
    }
    await db.update(rosters).set({ isKeeper: !!body.isKeeper }).where(and(eq(rosters.id, body.rosterId), eq(rosters.teamId, id)))
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'SET_CONTRACT' && body.rosterId) {
    if (!league?.salaryCapEnabled) return NextResponse.json({ error: 'Salary cap is not enabled in this league' }, { status: 400 })
    // Only the owner or commissioner may set contracts (not co-managers).
    if (team.userId !== session.user.id && league.commissionerId !== session.user.id)
      return NextResponse.json({ error: 'Only the owner or commissioner can set contracts' }, { status: 403 })
    const salary = Math.max(0, Math.round(body.salary ?? 0))
    const years = body.contractYears == null ? null : Math.max(0, Math.round(body.contractYears))
    // Hard cap: block a contract that would put the team over the salary cap.
    if ((league.capMode ?? 'SOFT') === 'HARD') {
      const rows = await db.select({ rid: rosters.id, salary: rosters.salary }).from(rosters).where(eq(rosters.teamId, id))
      const total = rows.reduce((sum, r) => sum + (r.rid === body.rosterId ? salary : (r.salary ?? 0)), 0)
      if (total > (league.salaryCap ?? 0))
        return NextResponse.json({ error: `Over the hard salary cap: ${total} > ${league.salaryCap ?? 0}` }, { status: 400 })
    }
    await db.update(rosters).set({ salary, contractYears: years }).where(and(eq(rosters.id, body.rosterId), eq(rosters.teamId, id)))
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'DROP' && body.rosterId) {
    const [dropped] = await db.select({ playerId: rosters.playerId, name: players.name, sport: players.sport })
      .from(rosters).innerJoin(players, eq(rosters.playerId, players.id))
      .where(and(eq(rosters.id, body.rosterId), eq(rosters.teamId, id))).limit(1)
    await db.delete(rosters).where(and(eq(rosters.id, body.rosterId), eq(rosters.teamId, id)))
    if (dropped) {
      // Hold the player on the waiver wire (claim-only) unless waivers are off.
      if (league?.waiverType !== 'FREE_AGENT') await placeOnWaivers(team.leagueId, dropped.playerId, dropped.sport, id, league?.waiverPeriodDays ?? 0)
      await logActivity(team.leagueId, 'ROSTER', `${team.name} dropped ${dropped.name} (${dropped.sport})`, id)
    }
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'ADD' && body.playerId) {
    const [pl] = await db.select().from(players).where(eq(players.id, body.playerId)).limit(1)
    if (!pl) return NextResponse.json({ error: 'Player not found' }, { status: 400 })
    // Must be a free agent in this league (not on any roster of a team in the league).
    const existing = await db
      .select({ id: rosters.id }).from(rosters)
      .innerJoin(teams, eq(rosters.teamId, teams.id))
      .where(and(eq(rosters.playerId, body.playerId), eq(teams.leagueId, team.leagueId))).limit(1)
    if (existing.length) return NextResponse.json({ error: 'Player is already rostered' }, { status: 400 })
    // Players still on the waiver wire can only be claimed, not added directly.
    if (await onWaivers(team.leagueId, body.playerId)) return NextResponse.json({ error: 'Player is on waivers — submit a waiver claim instead' }, { status: 400 })
    // Enforce the optional per-sport transaction limit (adds + waiver claims in the period).
    const txLimits = safeParse<Record<string, { max: number; period: string }>>(league?.transactionLimits, {})
    const tl = txLimits[pl.sport]
    if (tl && tl.max > 0) {
      const since = tl.period === 'DAILY' ? Date.now() - 86_400_000 : tl.period === 'WEEKLY' ? Date.now() - 7 * 86_400_000 : 0
      const rows = await db.select({ message: activity.message, createdAt: activity.createdAt }).from(activity)
        .where(and(eq(activity.teamId, id), inArray(activity.type, ['ROSTER', 'WAIVER'])))
      const used = rows.filter(r => {
        const t = r.createdAt ? new Date(r.createdAt).getTime() : 0
        return t >= since && new RegExp(`\\(${pl.sport}\\)`).test(r.message ?? '') && /\b(added|claimed)\b/i.test(r.message ?? '')
      }).length
      if (used >= tl.max) return NextResponse.json({ error: `Transaction limit reached: ${tl.max} ${pl.sport} move${tl.max > 1 ? 's' : ''} per ${tl.period.toLowerCase()}` }, { status: 400 })
    }
    // Enforce the optional per-position max-rostered cap.
    const limits = safeParse<Record<string, Record<string, { maxRostered?: number }>>>(league?.positionLimits, {})
    const cap = limits[pl.sport]?.[pl.position]?.maxRostered
    if (cap != null) {
      const atPos = await db.select({ id: rosters.id }).from(rosters)
        .innerJoin(players, eq(rosters.playerId, players.id))
        .where(and(eq(rosters.teamId, id), eq(players.sport, pl.sport), eq(players.position, pl.position)))
      // Account for a simultaneous drop of a same-position player.
      let count = atPos.length
      if (body.dropRosterId) {
        const [dropRow] = await db.select({ position: players.position }).from(rosters).innerJoin(players, eq(rosters.playerId, players.id)).where(eq(rosters.id, body.dropRosterId)).limit(1)
        if (dropRow?.position === pl.position) count -= 1
      }
      if (count >= cap) return NextResponse.json({ error: `Roster limit reached: max ${cap} at ${pl.position}` }, { status: 400 })
    }
    if (body.dropRosterId) await db.delete(rosters).where(and(eq(rosters.id, body.dropRosterId), eq(rosters.teamId, id)))
    await db.insert(rosters).values({ id: nanoid(), teamId: id, playerId: body.playerId, sport: pl.sport, slot: 'BN', acquisitionType: 'FA' }).onConflictDoNothing()
    await logActivity(team.leagueId, 'ROSTER', `${team.name} added ${pl.name} (${pl.sport})`, id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
