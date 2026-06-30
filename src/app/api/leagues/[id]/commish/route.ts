import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, leagueMembers, users, matchups, trades, tradeItems, teams, realStatLines, players, commissionerActions } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { safeParse } from '@/lib/utils'
import { isCommissioner } from '@/lib/permissions'
import { logCommissionerAction, logActivity, notify } from '@/lib/activity'
import { executeTrade } from '@/lib/trades'
import { rescoreWeeks, advanceLeague, renewSeason } from '@/lib/advance'
import { snapshotSeasonBranding, snapshotSeasonRosters } from '@/lib/seasons'

// ── Commissioner tools ───────────────────────────────────────────────────────
// Manual stat corrections, score overrides, force/veto trades, co-commissioner
// management, invite rotation, and announcements — every action audited to
// commissioner_actions. Honors co-commissioners (isCommissioner), except granting
// the co-commissioner role itself, which only the PRIMARY commissioner may do.

async function loadLeague(id: string) {
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  return league
}

// GET: audit log + member roster (for the commissioner panel). With
// ?statPlayerId&statSport&statWeek, returns just that player's stored stat line
// (so the stat-correction editor can prefill it).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const league = await loadLeague(id)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await isCommissioner(id, session.user.id))) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })

  const sp = new URL(req.url).searchParams
  if (sp.get('statPlayerId')) {
    const [row] = await db.select({ stats: realStatLines.stats }).from(realStatLines)
      .where(and(eq(realStatLines.playerId, sp.get('statPlayerId')!), eq(realStatLines.sport, sp.get('statSport') ?? ''), eq(realStatLines.season, league.season), eq(realStatLines.week, Number(sp.get('statWeek') ?? 0)))).limit(1)
    return NextResponse.json({ stats: safeParse<Record<string, number>>(row?.stats, {}) })
  }

  const actions = await db.select({ id: commissionerActions.id, action: commissionerActions.action, details: commissionerActions.details, createdAt: commissionerActions.createdAt, byName: users.name })
    .from(commissionerActions).leftJoin(users, eq(commissionerActions.userId, users.id))
    .where(eq(commissionerActions.leagueId, id)).orderBy(desc(commissionerActions.createdAt)).limit(50)
  const members = await db.select({ userId: leagueMembers.userId, role: leagueMembers.role, name: users.name, email: users.email })
    .from(leagueMembers).leftJoin(users, eq(leagueMembers.userId, users.id)).where(eq(leagueMembers.leagueId, id))

  // Teams (id → name) for labelling matchups and trades.
  const teamRows = await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation }).from(teams).where(eq(teams.leagueId, id))

  // Pending trades, with a short asset summary for the force/veto list.
  const pendingRows = await db.select().from(trades).where(and(eq(trades.leagueId, id), eq(trades.status, 'PENDING')))
  const itemsByTrade: Record<string, { playerId: string | null; pickId: string | null }[]> = {}
  for (const t of pendingRows) itemsByTrade[t.id] = await db.select({ playerId: tradeItems.playerId, pickId: tradeItems.pickId }).from(tradeItems).where(eq(tradeItems.tradeId, t.id))
  const nameOf = (tid: string | null) => teamRows.find(t => t.id === tid)?.name ?? '—'
  const pendingTrades = pendingRows.map(t => ({
    id: t.id,
    initiator: nameOf(t.initiatorId),
    recipient: nameOf(t.recipientId),
    assets: (itemsByTrade[t.id] ?? []).filter(i => i.playerId || i.pickId).length,
    createdAt: t.createdAt,
  }))

  // All matchups (compact) — the score-override picker filters client-side by sport/week.
  const matchupRows = await db.select({ id: matchups.id, sport: matchups.sport, week: matchups.week, homeTeamId: matchups.homeTeamId, awayTeamId: matchups.awayTeamId, homeScore: matchups.homeScore, awayScore: matchups.awayScore, isComplete: matchups.isComplete })
    .from(matchups).where(and(eq(matchups.leagueId, id), eq(matchups.season, league.season))).limit(3000)

  return NextResponse.json({
    isPrimaryCommissioner: league.commissionerId === session.user.id,
    inviteCode: league.inviteCode,
    season: league.season,
    sportsEnabled: safeParse<string[]>(league.sportsEnabled, []),
    teams: teamRows,
    members, actions, pendingTrades,
    matchups: matchupRows,
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const league = await loadLeague(id)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await isCommissioner(id, session.user.id))) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })

  const uid = session.user.id
  const body = await req.json() as Record<string, any>
  const action = String(body.action ?? '')
  const log = (details: Record<string, unknown>) => logCommissionerAction(id, uid, action, details)

  switch (action) {
    // Fix a player's real stat line for a fantasy week, then re-score it.
    case 'STAT_CORRECTION': {
      const { playerId, sport, season, week } = body
      const stats = (body.stats && typeof body.stats === 'object') ? body.stats : null
      if (!playerId || !sport || !season || !week || !stats)
        return NextResponse.json({ error: 'playerId, sport, season, week, and stats are required' }, { status: 400 })
      const [pl] = await db.select({ id: players.id, name: players.name }).from(players).where(eq(players.id, playerId)).limit(1)
      if (!pl) return NextResponse.json({ error: 'Player not found' }, { status: 404 })
      const json = JSON.stringify(stats)
      const [existing] = await db.select({ id: realStatLines.id }).from(realStatLines)
        .where(and(eq(realStatLines.playerId, playerId), eq(realStatLines.sport, sport), eq(realStatLines.season, season), eq(realStatLines.week, Number(week)))).limit(1)
      if (existing) await db.update(realStatLines).set({ stats: json, updatedAt: new Date().toISOString() }).where(eq(realStatLines.id, existing.id))
      else await db.insert(realStatLines).values({ id: nanoid(), playerId, sport, season, week: Number(week), stats: json })
      await rescoreWeeks(league, [{ sport, week: Number(week) }])
      await advanceLeague(league, true)
      await log({ playerId, name: pl.name, sport, season, week: Number(week) })
      await logActivity(id, 'COMMISH', `Commissioner corrected ${pl.name}'s stats (${sport} wk ${week})`)
      return NextResponse.json({ ok: true })
    }

    // Manually set a matchup's score/result.
    case 'SCORE_OVERRIDE': {
      const { matchupId } = body
      const [m] = await db.select().from(matchups).where(and(eq(matchups.id, matchupId), eq(matchups.leagueId, id))).limit(1)
      if (!m) return NextResponse.json({ error: 'Matchup not found' }, { status: 404 })
      const patch: Record<string, unknown> = {}
      if ('homeScore' in body) patch.homeScore = Number(body.homeScore)
      if ('awayScore' in body) patch.awayScore = Number(body.awayScore)
      if ('isComplete' in body) patch.isComplete = !!body.isComplete
      if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
      await db.update(matchups).set(patch).where(eq(matchups.id, matchupId))
      await log({ matchupId, ...patch })
      return NextResponse.json({ ok: true })
    }

    // Force a pending trade through without waiting on approvals.
    case 'FORCE_TRADE': {
      const [t] = await db.select().from(trades).where(and(eq(trades.id, body.tradeId), eq(trades.leagueId, id))).limit(1)
      if (!t) return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
      if (t.status !== 'PENDING') return NextResponse.json({ error: 'Trade is no longer pending' }, { status: 400 })
      const ok = await executeTrade(t.id)
      if (!ok) return NextResponse.json({ error: 'Trade could not be executed' }, { status: 400 })
      await log({ tradeId: t.id })
      await logActivity(id, 'TRADE', `Commissioner forced a trade through`)
      return NextResponse.json({ ok: true })
    }

    // Veto (cancel) a pending trade.
    case 'VETO_TRADE': {
      const [t] = await db.select().from(trades).where(and(eq(trades.id, body.tradeId), eq(trades.leagueId, id))).limit(1)
      if (!t) return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
      if (t.status !== 'PENDING') return NextResponse.json({ error: 'Only pending trades can be vetoed' }, { status: 400 })
      await db.update(trades).set({ status: 'VETOED', processedAt: new Date().toISOString() }).where(eq(trades.id, t.id))
      await log({ tradeId: t.id })
      await logActivity(id, 'TRADE', `Commissioner vetoed a trade`)
      return NextResponse.json({ ok: true })
    }

    // Grant/revoke the co-commissioner role (PRIMARY commissioner only).
    case 'SET_CO_COMMISSIONER': {
      if (league.commissionerId !== uid) return NextResponse.json({ error: 'Only the primary commissioner can assign co-commissioners' }, { status: 403 })
      const { userId, grant } = body
      if (userId === league.commissionerId) return NextResponse.json({ error: 'The primary commissioner already has full control' }, { status: 400 })
      const [mem] = await db.select({ id: leagueMembers.id }).from(leagueMembers).where(and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, userId))).limit(1)
      if (!mem) return NextResponse.json({ error: 'Not a league member' }, { status: 404 })
      await db.update(leagueMembers).set({ role: grant ? 'CO_COMMISSIONER' : 'MEMBER' }).where(eq(leagueMembers.id, mem.id))
      await log({ userId, grant: !!grant })
      if (grant) await notify(userId, `You were made a co-commissioner of ${league.name}`, `/leagues/${id}`, 'LEAGUE')
      return NextResponse.json({ ok: true })
    }

    // Rotate the invite code (revokes the old one).
    case 'ROTATE_INVITE': {
      const inviteCode = nanoid(8).toUpperCase()
      await db.update(leagues).set({ inviteCode }).where(eq(leagues.id, id))
      await log({})
      return NextResponse.json({ ok: true, inviteCode })
    }

    // Archive the current season's branding (freeze its logos for history).
    case 'ARCHIVE_SEASON': {
      // Commissioner override: explicitly freeze every sport's rosters as they
      // stand now (force past any per-sport championship freeze).
      const n = await snapshotSeasonBranding(id, league.season)
      const r = await snapshotSeasonRosters(id, league.season, true)
      await log({ season: league.season, teams: n, rosterSpots: r })
      await logActivity(id, 'SEASON', `Commissioner archived the ${league.season} season (branding + rosters)`)
      return NextResponse.json({ ok: true, season: league.season, teams: n, rosterSpots: r })
    }

    // Finish the current season and start the next one (snapshots branding first).
    case 'RENEW_SEASON': {
      const from = league.season
      const res = await renewSeason(league)
      if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 })
      await log({ from, to: res.season })
      await logActivity(id, 'SEASON', `📅 ${from} archived — the ${res.season} season has begun!`)
      const members = await db.select({ userId: leagueMembers.userId }).from(leagueMembers).where(eq(leagueMembers.leagueId, id))
      await notify(members.map(m => m.userId), `A new season has started: ${res.season}`, `/leagues/${id}`, 'LEAGUE')
      return NextResponse.json({ ok: true, season: res.season })
    }

    // Post a league-wide announcement (activity feed + notify every member).
    case 'ANNOUNCE': {
      const message = String(body.message ?? '').trim().slice(0, 1000)
      if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 })
      await logActivity(id, 'ANNOUNCEMENT', `📣 ${message}`)
      const members = await db.select({ userId: leagueMembers.userId }).from(leagueMembers).where(eq(leagueMembers.leagueId, id))
      await notify(members.map(m => m.userId), `📣 ${league.name}: ${message}`, `/leagues/${id}`, 'LEAGUE')
      await log({ message })
      return NextResponse.json({ ok: true })
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
