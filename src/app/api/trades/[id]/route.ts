import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { trades, teams, rosters, tradeItems, draftPicks } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { action } = await req.json() as { action: 'ACCEPT' | 'REJECT' | 'CANCEL' | 'VETO' }

  const [trade] = await db.select().from(trades).where(eq(trades.id, id)).limit(1)
  if (!trade) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (trade.status !== 'PENDING') return NextResponse.json({ error: 'Trade is no longer pending' }, { status: 400 })

  const [initiatorTeam] = await db.select().from(teams).where(eq(teams.id, trade.initiatorId)).limit(1)
  const [recipientTeam] = await db.select().from(teams).where(eq(teams.id, trade.recipientId)).limit(1)

  const isInitiator = initiatorTeam?.userId === session.user.id
  const isRecipient = recipientTeam?.userId === session.user.id

  if (action === 'CANCEL' && !isInitiator) return NextResponse.json({ error: 'Only initiator can cancel' }, { status: 403 })
  if ((action === 'ACCEPT' || action === 'REJECT') && !isRecipient) return NextResponse.json({ error: 'Only recipient can accept/reject' }, { status: 403 })

  if (action === 'ACCEPT') {
    // Execute the trade: move players/picks between teams
    const items = await db.select().from(tradeItems).where(eq(tradeItems.tradeId, trade.id))
    for (const item of items) {
      if (item.playerId) {
        const fromTeamId = item.direction === 'GIVING' ? trade.initiatorId : trade.recipientId
        const toTeamId   = item.direction === 'GIVING' ? trade.recipientId : trade.initiatorId
        // Remove from old roster and add to new
        await db.delete(rosters).where(eq(rosters.playerId, item.playerId))
        await db.insert(rosters).values({ id: nanoid(), teamId: toTeamId, playerId: item.playerId, slot: 'BN', acquisitionType: 'TRADE' }).onConflictDoNothing()
      }
      if (item.pickId) {
        const toTeamId = item.direction === 'GIVING' ? trade.recipientId : trade.initiatorId
        await db.update(draftPicks).set({ currentTeamId: toTeamId }).where(eq(draftPicks.id, item.pickId))
      }
    }
  }

  const [updated] = await db.update(trades)
    .set({ status: action === 'ACCEPT' ? 'ACCEPTED' : action === 'REJECT' ? 'REJECTED' : action === 'CANCEL' ? 'CANCELLED' : 'VETOED' })
    .where(eq(trades.id, id))
    .returning()

  return NextResponse.json(updated)
}
