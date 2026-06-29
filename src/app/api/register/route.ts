import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({
  name:     z.string().min(2).max(50),
  email:    z.string().email(),
  password: z.string().min(6),
})

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json())
    const existing = await db.select().from(users).where(eq(users.email, body.email)).limit(1)
    if (existing.length) return NextResponse.json({ error: 'Email already registered' }, { status: 409 })

    const hash = await bcrypt.hash(body.password, 10)
    const [user] = await db.insert(users).values({ id: nanoid(), name: body.name, email: body.email, password: hash }).returning({ id: users.id, name: users.name, email: users.email })
    return NextResponse.json(user, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
