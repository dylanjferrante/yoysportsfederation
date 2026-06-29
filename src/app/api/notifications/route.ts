import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { notifications } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ items: [], unread: 0 })
  const items = await db.select().from(notifications).where(eq(notifications.userId, session.user.id)).orderBy(desc(notifications.createdAt)).limit(20)
  const unread = items.filter(n => !n.isRead).length
  return NextResponse.json({ items, unread })
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.userId, session.user.id), eq(notifications.isRead, false)))
  return NextResponse.json({ ok: true })
}
