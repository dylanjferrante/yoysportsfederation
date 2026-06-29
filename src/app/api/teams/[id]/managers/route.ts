import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { teams, leagues, users, teamManagers } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { logActivity } from '@/lib/activity'

// Co-managers of a franchise. Only the franchise owner or the league
// commissioner may add or remove them.
async function ownerOrCommish(teamId: string, userId: string) {
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1)
  if (!team) return { team: null, league: null, allowed: false }
  const [league] = await db.select().from(leagues).where(eq(leagues.id, team.leagueId)).limit(1)
  const allowed = team.userId === userId || league?.commissionerId === userId
  return { team, league, allowed }
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rows = await db
    .select({ userId: teamManagers.userId, name: users.name, email: users.email, createdAt: teamManagers.createdAt })
    .from(teamManagers).leftJoin(users, eq(teamManagers.userId, users.id))
    .where(eq(teamManagers.teamId, id))
  return NextResponse.json(rows)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { team, allowed } = await ownerOrCommish(id, session.user.id)
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!allowed) return NextResponse.json({ error: 'Only the owner or commissioner can manage co-managers' }, { status: 403 })

  const body = await req.json() as { email?: string }
  const email = (body.email ?? '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!user) return NextResponse.json({ error: 'No account with that email' }, { status: 400 })
  if (user.id === team.userId) return NextResponse.json({ error: 'That user already owns this franchise' }, { status: 400 })

  await db.insert(teamManagers).values({ id: nanoid(), teamId: id, userId: user.id }).onConflictDoNothing()
  await logActivity(team.leagueId, 'ROSTER', `${user.name ?? email} was added as a co-manager of ${team.name}`, id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { team, allowed } = await ownerOrCommish(id, session.user.id)
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!allowed) return NextResponse.json({ error: 'Only the owner or commissioner can manage co-managers' }, { status: 403 })

  const body = await req.json() as { userId?: string }
  if (!body.userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
  await db.delete(teamManagers).where(and(eq(teamManagers.teamId, id), eq(teamManagers.userId, body.userId)))
  return NextResponse.json({ ok: true })
}
