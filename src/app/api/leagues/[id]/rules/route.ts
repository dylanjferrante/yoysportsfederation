import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { isCommissioner } from '@/lib/permissions'
import { logCommissionerAction } from '@/lib/activity'

// League rules / constitution. Anyone signed in can read; only a commissioner
// (or co-commissioner) can edit.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const { id } = await params
  const [league] = await db.select({ rules: leagues.rules, name: leagues.name }).from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const canEdit = await isCommissioner(id, session?.user?.id)
  return NextResponse.json({ rules: league.rules ?? '', canEdit })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  if (!(await isCommissioner(id, session.user.id))) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
  const { rules } = await req.json() as { rules?: string }
  await db.update(leagues).set({ rules: String(rules ?? '').slice(0, 50000) }).where(eq(leagues.id, id))
  await logCommissionerAction(id, session.user.id, 'EDIT_RULES', {})
  return NextResponse.json({ ok: true })
}
