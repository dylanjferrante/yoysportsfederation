import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { trades, teams, rosters, tradeItems, tradeApprovals, draftPicks, players } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { logActivity, notify } from '@/lib/activity'

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
    await logActivity(trade.leagueId!, 'TRADE', `${initiatorTeam?.name ?? 'A franchise'} cancelled a trade`, trade.initiatorId)
    return finish('CANCELLED')
  }
  if (action === 'REJECT') {
    if (!myTeam) return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
    await logActivity(trade.leagueId!, 'TRADE', `${myTeam.name} rejected a trade from ${initiatorTeam?.name ?? 'a franchise'}`, myTeam.id)
    if (initiatorTeam?.userId) await notify(initiatorTeam.userId, `${myTeam.name} rejected your trade proposal`, `/trade`)
    return finish('REJECTED')
  }

  // ACCEPT — record this franchise's approval, execute once everyone has accepted.
  if (!myTeam || isInitiator) return NextResponse.json({ error: 'Only a recipient franchise can accept' }, { status: 403 })
  await db.update(tradeApprovals).set({ status: 'ACCEPTED' }).where(and(eq(tradeApprovals.tradeId, id), eq(tradeApprovals.teamId, myTeam.id)))

  const approvals = await db.select().from(tradeApprovals).where(eq(tradeApprovals.tradeId, id))
  const allAccepted = approvals.length > 0 && approvals.every(a => a.status === 'ACCEPTED')
  if (!allAccepted) return NextResponse.json({ status: 'PENDING', waiting: true })

  // Execute: route every asset from its source franchise to its destination.
  for (const it of items) {
    let from = it.fromTeamId, to = it.toTeamId
    if (!from || !to) {
      from = it.direction === 'GIVING' ? trade.initiatorId : (trade.recipientId ?? trade.initiatorId)
      to = it.direction === 'GIVING' ? (trade.recipientId ?? trade.initiatorId) : trade.initiatorId
    }
    if (it.playerId && to) {
      const [pl] = await db.select({ sport: players.sport }).from(players).where(eq(players.id, it.playerId)).limit(1)
      await db.delete(rosters).where(eq(rosters.playerId, it.playerId))
      await db.insert(rosters).values({ id: nanoid(), teamId: to, playerId: it.playerId, sport: pl?.sport ?? 'NFL', slot: 'BN', acquisitionType: 'TRADE' }).onConflictDoNothing()
    }
    if (it.pickId && to) {
      await db.update(draftPicks).set({ currentTeamId: to }).where(eq(draftPicks.id, it.pickId))
    }
  }
  const partyNames = teamRows.map(t => t.name).join(' / ')
  await logActivity(trade.leagueId!, 'TRADE', `Trade completed: ${partyNames}`, trade.initiatorId)
  await notify(teamRows.map(t => t.userId).filter(Boolean) as string[], `Your trade is complete: ${partyNames}`, `/trade`)
  return finish('ACCEPTED')
}
