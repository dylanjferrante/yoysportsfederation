import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { watchlist } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'

// The current user's watchlisted player ids.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ ids: [] })
  const rows = await db.select({ playerId: watchlist.playerId }).from(watchlist).where(eq(watchlist.userId, session.user.id))
  return NextResponse.json({ ids: rows.map(r => r.playerId) })
}

// Toggle a player on/off the watchlist.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { playerId } = await req.json() as { playerId?: string }
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })

  const [existing] = await db.select().from(watchlist).where(and(eq(watchlist.userId, session.user.id), eq(watchlist.playerId, playerId))).limit(1)
  if (existing) {
    await db.delete(watchlist).where(eq(watchlist.id, existing.id))
    return NextResponse.json({ watching: false })
  }
  await db.insert(watchlist).values({ id: nanoid(), userId: session.user.id, playerId }).onConflictDoNothing()
  return NextResponse.json({ watching: true })
}
