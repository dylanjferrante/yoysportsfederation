import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { trades, tradeItems, tradeApprovals, teams, players, draftPicks, leagues, matchups } from '@/db/schema'
import { eq, or, and, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { logActivity, notify } from '@/lib/activity'
import { safeParse } from '@/lib/utils'
import { resolveTradeDeadlineWeek } from '@/lib/defaults'

const tradeItemSchema = z.object({
  direction: z.enum(['GIVING', 'RECEIVING']).optional(),
  fromTeamId: z.string().optional(),
  toTeamId: z.string().optional(),
  playerId: z.string().optional(),
  pickId: z.string().optional(),
})

const createSchema = z.object({
  recipientTeamId: z.string().optional(),
  leagueId: z.string().optional(),
  note: z.string().max(500).optional(),
  items: z.array(tradeItemSchema).min(1),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userTeams = await db.select({ id: teams.id }).from(teams).where(eq(teams.userId, session.user.id))
  const teamIds = userTeams.map(t => t.id)
  if (!teamIds.length) return NextResponse.json([])

  const allTrades = await db.select().from(trades).where(
    or(...teamIds.flatMap(tid => [eq(trades.initiatorId, tid), eq(trades.recipientId, tid)]))
  )

  // Resolve franchise names per league once.
  const enriched = await Promise.all(allTrades.map(async (trade) => {
    const items = await db.select().from(tradeItems).where(eq(tradeItems.tradeId, trade.id))
    const approvals = await db.select().from(tradeApprovals).where(eq(tradeApprovals.tradeId, trade.id))
    const leagueTeams = trade.leagueId ? await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation }).from(teams).where(eq(teams.leagueId, trade.leagueId)) : []
    const tName = (tid: string | null) => leagueTeams.find(t => t.id === tid)
    const enrichedItems = await Promise.all(items.map(async (item) => {
      let player = null, pick = null
      if (item.playerId) { const [p] = await db.select().from(players).where(eq(players.id, item.playerId)).limit(1); player = p }
      if (item.pickId) { const [pk] = await db.select().from(draftPicks).where(eq(draftPicks.id, item.pickId)).limit(1); pick = pk }
      return { ...item, player, pick, fromTeam: tName(item.fromTeamId), toTeam: tName(item.toTeamId) }
    }))
    const [initiatorTeam] = await db.select().from(teams).where(eq(teams.id, trade.initiatorId)).limit(1)
    const recipientTeam = trade.recipientId ? (await db.select().from(teams).where(eq(teams.id, trade.recipientId)).limit(1))[0] : null
    return { ...trade, items: enrichedItems, initiatorTeam, recipientTeam, approvals }
  }))

  return NextResponse.json(enriched.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')))
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = createSchema.parse(await req.json())

    // Resolve the league + the initiator's franchise in it.
    let leagueId = body.leagueId
    if (!leagueId && body.recipientTeamId) {
      const [rt] = await db.select().from(teams).where(eq(teams.id, body.recipientTeamId)).limit(1)
      leagueId = rt?.leagueId
    }
    const myTeams = await db.select().from(teams).where(eq(teams.userId, session.user.id))
    const mine = leagueId ? myTeams.find(t => t.leagueId === leagueId) : myTeams[0]
    if (!mine) return NextResponse.json({ error: 'You have no franchise in this league' }, { status: 400 })
    leagueId = mine.leagueId

    // Resolve every item's from/to franchise (2-team uses direction; N-team carries both).
    const resolved = body.items.map(it => {
      let from = it.fromTeamId, to = it.toTeamId
      if (!from || !to) {
        if (it.direction === 'RECEIVING') { from = body.recipientTeamId; to = mine.id }
        else { from = mine.id; to = body.recipientTeamId }
      }
      return { ...it, fromTeamId: from, toTeamId: to }
    })

    const participants = new Set<string>()
    for (const it of resolved) { if (it.fromTeamId) participants.add(it.fromTeamId); if (it.toTeamId) participants.add(it.toTeamId) }
    if (body.recipientTeamId) participants.add(body.recipientTeamId)
    participants.delete(mine.id)
    if (participants.size === 0) return NextResponse.json({ error: 'No trade partner' }, { status: 400 })

    const partnerRows = await db.select().from(teams).where(inArray(teams.id, [...participants]))

    // Enforce per-sport trade deadlines. Block if any sport in the deal is past its deadline.
    const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId)).limit(1)
    const deadlines = safeParse<Record<string, { mode: string; week?: number }>>(league?.tradeDeadlines, {})
    const schedule = safeParse<any[]>(league?.sportSchedule, [])
    const dealPlayerIds = resolved.map(it => it.playerId).filter(Boolean) as string[]
    const dealPickIds = resolved.map(it => it.pickId).filter(Boolean) as string[]
    const dealSports = new Set<string>()
    if (dealPlayerIds.length) (await db.select({ s: players.sport }).from(players).where(inArray(players.id, dealPlayerIds))).forEach(r => r.s && dealSports.add(r.s))
    if (dealPickIds.length) (await db.select({ s: draftPicks.sport }).from(draftPicks).where(inArray(draftPicks.id, dealPickIds))).forEach(r => r.s && dealSports.add(r.s))

    if (dealSports.size) {
      const allM = await db.select({ sport: matchups.sport, week: matchups.week, isComplete: matchups.isComplete })
        .from(matchups).where(and(eq(matchups.leagueId, leagueId), eq(matchups.season, league?.season ?? '')))
      const cur: Record<string, number> = {}
      for (const sp of dealSports) {
        const mine = allM.filter(m => m.sport === sp)
        const inc = mine.filter(m => !m.isComplete).map(m => m.week)
        const maxWk = mine.length ? Math.max(...mine.map(m => m.week)) : 0
        cur[sp] = inc.length ? Math.min(...inc) : maxWk + 1
      }
      for (const sp of dealSports) {
        const dl = resolveTradeDeadlineWeek(deadlines[sp] as any, sp, schedule, league?.playoffRounds ?? 2)
        if ((cur[sp] ?? 1) > dl) return NextResponse.json({ error: `The ${sp} trade deadline has passed.` }, { status: 400 })
      }
    }

    const tradeId = nanoid()
    const [trade] = await db.insert(trades).values({
      id: tradeId,
      leagueId,
      initiatorId: mine.id,
      recipientId: body.recipientTeamId ?? partnerRows[0]?.id ?? null,
      note: body.note,
      status: 'PENDING',
    }).returning()

    await db.insert(tradeItems).values(resolved.map(it => ({
      id: nanoid(), tradeId, fromTeamId: it.fromTeamId ?? null, toTeamId: it.toTeamId ?? null,
      direction: it.direction ?? null, playerId: it.playerId ?? null, pickId: it.pickId ?? null,
    })))

    await db.insert(tradeApprovals).values(partnerRows.map(t => ({
      id: nanoid(), tradeId, teamId: t.id, userId: t.userId, status: 'PENDING',
    })))

    // Activity feed + notify each partner franchise's owner.
    const partnerNames = partnerRows.map(t => t.name).join(', ')
    await logActivity(leagueId, 'TRADE', `${mine.name} proposed a trade to ${partnerNames}`, mine.id)
    await notify(partnerRows.map(t => t.userId).filter(Boolean) as string[], `${mine.name} sent you a trade proposal`, `/trade`, 'TRADE')

    return NextResponse.json(trade, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors }, { status: 400 })
    console.error(e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
