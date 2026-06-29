import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { trades, tradeItems, teams, players, draftPicks } from '@/db/schema'
import { eq, or } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'

const tradeItemSchema = z.object({
  direction: z.enum(['GIVING', 'RECEIVING']),
  playerId: z.string().optional(),
  pickId: z.string().optional(),
})

const createSchema = z.object({
  recipientTeamId: z.string(),
  note: z.string().max(500).optional(),
  items: z.array(tradeItemSchema).min(1),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get all teams this user owns
  const userTeams = await db.select({ id: teams.id }).from(teams).where(eq(teams.userId, session.user.id))
  const teamIds = userTeams.map(t => t.id)
  if (!teamIds.length) return NextResponse.json([])

  // Get all trades involving these teams
  const allTrades = await db.select().from(trades).where(
    or(...teamIds.flatMap(tid => [eq(trades.initiatorId, tid), eq(trades.recipientId, tid)]))
  )

  // Attach items, player/pick details
  const enriched = await Promise.all(allTrades.map(async (trade) => {
    const items = await db.select().from(tradeItems).where(eq(tradeItems.tradeId, trade.id))
    const enrichedItems = await Promise.all(items.map(async (item) => {
      let player = null, pick = null
      if (item.playerId) {
        const [p] = await db.select().from(players).where(eq(players.id, item.playerId)).limit(1)
        player = p
      }
      if (item.pickId) {
        const [pk] = await db.select().from(draftPicks).where(eq(draftPicks.id, item.pickId)).limit(1)
        pick = pk
      }
      return { ...item, player, pick }
    }))

    const [initiatorTeam] = await db.select().from(teams).where(eq(teams.id, trade.initiatorId)).limit(1)
    const [recipientTeam] = await db.select().from(teams).where(eq(teams.id, trade.recipientId)).limit(1)

    return { ...trade, items: enrichedItems, initiatorTeam, recipientTeam }
  }))

  return NextResponse.json(enriched.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')))
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = createSchema.parse(await req.json())

    // Find one of the user's teams
    const [initiatorTeam] = await db.select().from(teams).where(eq(teams.userId, session.user.id)).limit(1)
    if (!initiatorTeam) return NextResponse.json({ error: 'No team found' }, { status: 400 })

    const tradeId = nanoid()
    const [trade] = await db.insert(trades).values({
      id: tradeId,
      initiatorId: initiatorTeam.id,
      recipientId: body.recipientTeamId,
      note: body.note,
      status: 'PENDING',
    }).returning()

    await db.insert(tradeItems).values(
      body.items.map(item => ({
        id: nanoid(),
        tradeId,
        direction: item.direction,
        playerId: item.playerId ?? null,
        pickId: item.pickId ?? null,
      }))
    )

    return NextResponse.json(trade, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors }, { status: 400 })
    console.error(e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
