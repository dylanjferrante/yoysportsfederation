import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { trades, teams, rosters, tradeItems, tradeApprovals, players, leagues } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { logActivity, notify } from '@/lib/activity'
import { safeParse } from '@/lib/utils'
import { executeTrade } from '@/lib/trades'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { action } = await req.json() as { action: 'ACCEPT' | 'REJECT' | 'CANCEL' }

  const [trade] = await db.select().from(trades).where(eq(trades.id, id)).limit(1)
  if (!trade) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (trade.status !== 'PENDING') return NextResponse.json({ error: 'Trade is no longer pending' }, { status: 400 })

  const items = await db.select().from(tradeItems).where(eq(tradeItems.tradeId, id))

  // All franchises involved (initiator + recipient + any from/to on items).
  const teamSet = new Set<string>([trade.initiatorId])
  if (trade.recipientId) teamSet.add(trade.recipientId)
  for (const it of items) { if (it.fromTeamId) teamSet.add(it.fromTeamId); if (it.toTeamId) teamSet.add(it.toTeamId) }
  const teamRows = await db.select().from(teams).where(inArray(teams.id, [...teamSet]))
  const myTeam = teamRows.find(t => t.userId === session.user.id)
  const isInitiator = myTeam?.id === trade.initiatorId

  const finish = async (status: string) => {
    const [updated] = await db.update(trades).set({ status, processedAt: new Date().toISOString() }).where(eq(trades.id, id)).returning()
    return NextResponse.json(updated)
  }

  const initiatorTeam = teamRows.find(t => t.id === trade.initiatorId)

  if (action === 'CANCEL') {
    if (!isInitiator) return NextResponse.json({ error: 'Only the initiator can cancel' }, { status: 403 })
    return finish('CANCELLED')
  }
  if (action === 'REJECT') {
    if (!myTeam) return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
    if (initiatorTeam?.userId) await notify(initiatorTeam.userId, `${myTeam.name} rejected your trade proposal`, `/trade`, 'TRADE')
    return finish('REJECTED')
  }

  // ACCEPT — record this franchise's approval, execute once everyone has accepted.
  if (!myTeam || isInitiator) return NextResponse.json({ error: 'Only a recipient franchise can accept' }, { status: 403 })
  await db.update(tradeApprovals).set({ status: 'ACCEPTED' }).where(and(eq(tradeApprovals.tradeId, id), eq(tradeApprovals.teamId, myTeam.id)))

  const approvals = await db.select().from(tradeApprovals).where(eq(tradeApprovals.tradeId, id))
  const allAccepted = approvals.length > 0 && approvals.every(a => a.status === 'ACCEPTED')
  if (!allAccepted) return NextResponse.json({ status: 'PENDING', waiting: true })

  // Execute: route every asset from its source franchise to its destination, and log
  // a separate transaction entry for each asset (player or pick) with its details.
  const nameOf = (tid: string | null | undefined) => teamRows.find(t => t.id === tid)?.name ?? 'A franchise'

  // Resolve an item's from/to (mirrors the execution loop below).
  const routeOf = (it: typeof items[number]) => {
    let from = it.fromTeamId, to = it.toTeamId
    if (!from || !to) {
      from = it.direction === 'GIVING' ? trade.initiatorId : (trade.recipientId ?? trade.initiatorId)
      to = it.direction === 'GIVING' ? (trade.recipientId ?? trade.initiatorId) : trade.initiatorId
    }
    return { from, to }
  }

  // Pre-execution validation: hard salary cap and per-position roster limits on the
  // resulting rosters (only when the league enables them).
  const [lg] = await db.select().from(leagues).where(eq(leagues.id, trade.leagueId!)).limit(1)
  const capOn = !!lg?.salaryCapEnabled && (lg?.capMode ?? 'SOFT') === 'HARD'
  const posLimits = safeParse<Record<string, Record<string, { maxRostered?: number }>>>(lg?.positionLimits, {})
  const hasPosLimits = Object.keys(posLimits).length > 0
  if (capOn || hasPosLimits) {
    const teamIds = [...teamSet]
    const current = await db.select({ teamId: rosters.teamId, playerId: rosters.playerId, salary: rosters.salary, sport: players.sport, position: players.position })
      .from(rosters).innerJoin(players, eq(rosters.playerId, players.id)).where(inArray(rosters.teamId, teamIds))
    type RP = { playerId: string; salary: number; sport: string; position: string }
    const rosterByTeam: Record<string, RP[]> = Object.fromEntries(teamIds.map(t => [t, [] as RP[]]))
    const metaByPlayer: Record<string, RP> = {}
    for (const r of current) {
      const rp: RP = { playerId: r.playerId, salary: r.salary ?? 0, sport: r.sport, position: r.position }
      rosterByTeam[r.teamId].push(rp)
      metaByPlayer[r.playerId] = rp
    }
    // Apply each player move to the simulated rosters.
    for (const it of items) {
      if (!it.playerId) continue
      const { from, to } = routeOf(it)
      if (from && rosterByTeam[from]) rosterByTeam[from] = rosterByTeam[from].filter(p => p.playerId !== it.playerId)
      const meta = metaByPlayer[it.playerId]
      if (to && rosterByTeam[to] && meta) rosterByTeam[to].push(meta)
    }
    for (const tid of teamIds) {
      const list = rosterByTeam[tid] ?? []
      if (capOn) {
        const total = list.reduce((s, p) => s + (p.salary || 0), 0)
        if (total > (lg!.salaryCap ?? 0))
          return NextResponse.json({ error: `Trade rejected: ${nameOf(tid)} would be over the hard salary cap (${total} > ${lg!.salaryCap ?? 0})` }, { status: 400 })
      }
      if (hasPosLimits) {
        const counts: Record<string, number> = {}
        for (const p of list) {
          const cap = posLimits[p.sport]?.[p.position]?.maxRostered
          if (cap == null) continue
          const key = `${p.sport}:${p.position}`
          counts[key] = (counts[key] ?? 0) + 1
          if (counts[key] > cap)
            return NextResponse.json({ error: `Trade rejected: ${nameOf(tid)} would exceed the ${p.position} roster limit (${cap}) in ${p.sport}` }, { status: 400 })
        }
      }
    }
  }

  await executeTrade(id)
  const [done] = await db.select().from(trades).where(eq(trades.id, id)).limit(1)
  return NextResponse.json(done)
}
