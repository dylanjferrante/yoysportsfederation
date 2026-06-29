import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagueMessages, leagueMembers, users, teams } from '@/db/schema'
import { eq, and, desc, isNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'

// Recent messages for a league (newest last), enriched with author + franchise.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ messages: [] })
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const limit = Math.min(100, Number(searchParams.get('limit')) || 50)
  const matchupId = searchParams.get('matchupId')
  // A matchupId scopes the thread to that matchup's trash talk; otherwise this
  // is the league-wide board (messages with no matchup attached).
  const scope = matchupId
    ? eq(leagueMessages.matchupId, matchupId)
    : isNull(leagueMessages.matchupId)

  const rows = await db
    .select({ id: leagueMessages.id, body: leagueMessages.body, createdAt: leagueMessages.createdAt, userId: leagueMessages.userId, userName: users.name })
    .from(leagueMessages).leftJoin(users, eq(leagueMessages.userId, users.id))
    .where(and(eq(leagueMessages.leagueId, id), scope))
    .orderBy(desc(leagueMessages.createdAt)).limit(limit)

  const teamRows = await db.select({ name: teams.name, abbreviation: teams.abbreviation, userId: teams.userId }).from(teams).where(eq(teams.leagueId, id))
  const teamByUser = Object.fromEntries(teamRows.map(t => [t.userId, t]))

  const messages = rows.reverse().map(m => ({
    id: m.id, body: m.body, createdAt: m.createdAt, userId: m.userId,
    author: m.userName, team: teamByUser[m.userId ?? '']?.name ?? null,
    mine: m.userId === session.user.id,
  }))
  return NextResponse.json({ messages })
}

// Post a message (members only).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { body, matchupId } = await req.json() as { body?: string; matchupId?: string }
  const text = (body ?? '').trim()
  if (!text) return NextResponse.json({ error: 'Empty message' }, { status: 400 })
  if (text.length > 1000) return NextResponse.json({ error: 'Too long' }, { status: 400 })

  const [member] = await db.select().from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, session.user.id))).limit(1)
  if (!member) return NextResponse.json({ error: 'Only league members can post' }, { status: 403 })

  await db.insert(leagueMessages).values({ id: nanoid(), leagueId: id, userId: session.user.id, body: text, matchupId: matchupId ?? null })
  return NextResponse.json({ ok: true }, { status: 201 })
}
