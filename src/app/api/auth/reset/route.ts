import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/db'
import { users, passwordResets } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({ token: z.string().min(1), password: z.string().min(6) })

export async function POST(req: Request) {
  try {
    const { token, password } = schema.parse(await req.json())
    const [reset] = await db.select().from(passwordResets).where(eq(passwordResets.token, token)).limit(1)
    if (!reset || reset.usedAt || Date.parse(reset.expiresAt) < Date.now()) {
      return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 })
    }
    const hash = await bcrypt.hash(password, 10)
    await db.update(users).set({ password: hash }).where(eq(users.id, reset.userId))
    await db.update(passwordResets).set({ usedAt: new Date().toISOString() }).where(eq(passwordResets.id, reset.id))
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
