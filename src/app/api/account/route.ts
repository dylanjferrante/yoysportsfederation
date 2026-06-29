import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq, and, ne } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(2).max(50).optional(),
  email: z.string().email().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6).optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [u] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, session.user.id)).limit(1)
  return NextResponse.json(u ?? {})
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = schema.parse(await req.json())
    const [me] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)
    if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const update: Record<string, unknown> = {}
    if (body.name && body.name !== me.name) update.name = body.name
    if (body.email && body.email !== me.email) {
      const clash = await db.select({ id: users.id }).from(users).where(and(eq(users.email, body.email), ne(users.id, me.id))).limit(1)
      if (clash.length) return NextResponse.json({ error: 'That email is already in use' }, { status: 409 })
      update.email = body.email
    }
    if (body.newPassword) {
      if (!body.currentPassword || !(await bcrypt.compare(body.currentPassword, me.password))) {
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
      }
      update.password = await bcrypt.hash(body.newPassword, 10)
    }
    if (Object.keys(update).length) await db.update(users).set(update).where(eq(users.id, me.id))
    return NextResponse.json({ ok: true, nameChanged: 'name' in update, emailChanged: 'email' in update })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
