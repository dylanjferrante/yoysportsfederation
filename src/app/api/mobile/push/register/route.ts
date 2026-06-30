import { NextResponse } from 'next/server'
import { db } from '@/db'
import { deviceTokens } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { bearerUserId } from '@/lib/mobileAuth'

// Register (or re-point) this device's Expo push token to the signed-in user.
export async function POST(req: Request) {
  const uid = bearerUserId(req)
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { token, platform } = await req.json().catch(() => ({})) as { token?: string; platform?: string }
  if (!token || !/^ExponentPushToken\[/.test(token)) return NextResponse.json({ error: 'Invalid token' }, { status: 400 })

  // One row per token; if the device re-registers (or a different user logs in
  // on it), update the owner.
  const [existing] = await db.select({ id: deviceTokens.id }).from(deviceTokens).where(eq(deviceTokens.token, token)).limit(1)
  if (existing) await db.update(deviceTokens).set({ userId: uid, platform: platform ?? null }).where(eq(deviceTokens.id, existing.id))
  else await db.insert(deviceTokens).values({ id: nanoid(), userId: uid, token, platform: platform ?? null })
  return NextResponse.json({ ok: true })
}

// Unregister on logout.
export async function DELETE(req: Request) {
  if (!bearerUserId(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { token } = await req.json().catch(() => ({})) as { token?: string }
  if (token) await db.delete(deviceTokens).where(eq(deviceTokens.token, token))
  return NextResponse.json({ ok: true })
}
