import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, leagueMembers, teams, users } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

// Dues status per franchise (amount owed + paid flag).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const rows = await db
    .select({ userId: leagueMembers.userId, role: leagueMembers.role, duesPaid: leagueMembers.duesPaid, duesPaidAt: leagueMembers.duesPaidAt, userName: users.name })
    .from(leagueMembers).leftJoin(users, eq(leagueMembers.userId, users.id))
    .where(eq(leagueMembers.leagueId, id))
  const teamRows = await db.select({ id: teams.id, name: teams.name, userId: teams.userId }).from(teams).where(eq(teams.leagueId, id))
  const teamByUser = Object.fromEntries(teamRows.map(t => [t.userId, t]))

  const members = rows.map(r => ({
    userId: r.userId, userName: r.userName, role: r.role,
    duesPaid: !!r.duesPaid, duesPaidAt: r.duesPaidAt,
    team: teamByUser[r.userId] ?? null,
  }))
  return NextResponse.json({ amount: league.duesAmount ?? 0, members })
}

// Commissioner toggles a franchise's paid status.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (league.commissionerId !== session.user.id) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })

  const { userId, paid } = await req.json() as { userId: string; paid: boolean }
  await db.update(leagueMembers)
    .set({ duesPaid: paid, duesPaidAt: paid ? new Date().toISOString() : null })
    .where(and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, userId)))
  return NextResponse.json({ ok: true })
}
