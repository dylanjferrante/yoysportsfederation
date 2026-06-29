import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { teams, rosters, players, draftPicks, users, leagues } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { safeParse } from '@/lib/utils'

// A franchise's full cross-sport roster + tradeable picks + slot options.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)

  const [team] = await db
    .select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation, logo: teams.logo, leagueId: teams.leagueId, userId: teams.userId, ownerName: users.name })
    .from(teams).leftJoin(users, eq(teams.userId, users.id))
    .where(eq(teams.id, id)).limit(1)
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [league] = await db.select().from(leagues).where(eq(leagues.id, team.leagueId)).limit(1)

  const roster = await db
    .select({
      rosterId: rosters.id, slot: rosters.slot, sport: rosters.sport,
      id: players.id, name: players.name, position: players.position,
      realTeam: players.realTeam, status: players.status, seasonPoints: players.seasonPoints,
    })
    .from(rosters).innerJoin(players, eq(rosters.playerId, players.id))
    .where(eq(rosters.teamId, id))

  const picks = await db.select().from(draftPicks).where(and(eq(draftPicks.currentTeamId, id), eq(draftPicks.isUsed, false)))

  roster.sort((a, b) => (b.seasonPoints ?? 0) - (a.seasonPoints ?? 0))
  picks.sort((a, b) => a.year - b.year || (a.sport ?? '').localeCompare(b.sport ?? '') || a.round - b.round)

  const canManage = !!session && (session.user.id === team.userId || session.user.id === league?.commissionerId)

  return NextResponse.json({
    team, players: roster, picks,
    rosterSettings: safeParse(league?.rosterSettings, {}),
    canManage,
  })
}

// Roster actions: move a player to a slot, drop, or add a free agent.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1)
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [league] = await db.select().from(leagues).where(eq(leagues.id, team.leagueId)).limit(1)
  if (team.userId !== session.user.id && league?.commissionerId !== session.user.id)
    return NextResponse.json({ error: 'Not your franchise' }, { status: 403 })

  const body = await req.json() as { action: string; rosterId?: string; slot?: string; playerId?: string; dropRosterId?: string }

  if (body.action === 'SET_SLOT' && body.rosterId && body.slot) {
    await db.update(rosters).set({ slot: body.slot }).where(and(eq(rosters.id, body.rosterId), eq(rosters.teamId, id)))
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'DROP' && body.rosterId) {
    await db.delete(rosters).where(and(eq(rosters.id, body.rosterId), eq(rosters.teamId, id)))
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'ADD' && body.playerId) {
    const [pl] = await db.select().from(players).where(eq(players.id, body.playerId)).limit(1)
    if (!pl) return NextResponse.json({ error: 'Player not found' }, { status: 400 })
    // Must be a free agent in this league (not on any roster of a team in the league).
    const existing = await db
      .select({ id: rosters.id }).from(rosters)
      .innerJoin(teams, eq(rosters.teamId, teams.id))
      .where(and(eq(rosters.playerId, body.playerId), eq(teams.leagueId, team.leagueId))).limit(1)
    if (existing.length) return NextResponse.json({ error: 'Player is already rostered' }, { status: 400 })
    if (body.dropRosterId) await db.delete(rosters).where(and(eq(rosters.id, body.dropRosterId), eq(rosters.teamId, id)))
    await db.insert(rosters).values({ id: nanoid(), teamId: id, playerId: body.playerId, sport: pl.sport, slot: 'BN', acquisitionType: 'FA' }).onConflictDoNothing()
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
