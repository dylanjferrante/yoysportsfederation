import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { EVENTS, CHANNELS, parsePrefs, defaultPrefs, NotifyPrefs } from '@/lib/notifications'
import { pushConfigured } from '@/lib/transports/push'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [u] = await db.select({ notifyPrefs: users.notifyPrefs }).from(users).where(eq(users.id, session.user.id)).limit(1)
  return NextResponse.json({
    prefs: parsePrefs(u?.notifyPrefs),
    events: EVENTS,
    channels: CHANNELS,
    emailConfigured: !!process.env.SMTP_URL,
    pushConfigured: pushConfigured(),
  })
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { prefs?: NotifyPrefs }
  // Re-normalize through parsePrefs to drop anything malformed.
  const clean = parsePrefs(JSON.stringify(body.prefs ?? defaultPrefs()))
  await db.update(users).set({ notifyPrefs: JSON.stringify(clean) }).where(eq(users.id, session.user.id))
  return NextResponse.json({ ok: true })
}
