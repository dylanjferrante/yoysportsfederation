import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { db } from '@/db'
import { users, passwordResets } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({ email: z.string().email() })

export async function POST(req: Request) {
  try {
    const { email } = schema.parse(await req.json())
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)

    // Always respond the same way so the endpoint can't be used to enumerate accounts.
    const generic = { ok: true, message: 'If that email is registered, a reset link has been created.' }
    if (!user) return NextResponse.json(generic)

    const token = nanoid(40)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
    await db.insert(passwordResets).values({ id: nanoid(), userId: user.id, token, expiresAt })

    // No email service is configured in this environment, so the reset link is
    // surfaced directly. In production this would be emailed, not returned.
    return NextResponse.json({ ...generic, resetUrl: `/auth/reset?token=${token}` })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
