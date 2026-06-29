import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { teams, rosters, players, draftPicks, users } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

// A franchise's full cross-sport roster + its tradeable draft picks.
// Backs both the team page and the trade builder.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [team] = await db
    .select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation, logo: teams.logo, leagueId: teams.leagueId, ownerName: users.name })
    .from(teams).leftJoin(users, eq(teams.userId, users.id))
    .where(eq(teams.id, id)).limit(1)
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const roster = await db
    .select({
      rosterId: rosters.id, slot: rosters.slot, sport: rosters.sport,
      id: players.id, name: players.name, position: players.position,
      realTeam: players.realTeam, status: players.status, seasonPoints: players.seasonPoints,
    })
    .from(rosters)
    .innerJoin(players, eq(rosters.playerId, players.id))
    .where(eq(rosters.teamId, id))

  const picks = await db
    .select()
    .from(draftPicks)
    .where(and(eq(draftPicks.currentTeamId, id), eq(draftPicks.isUsed, false)))

  roster.sort((a, b) => (b.seasonPoints ?? 0) - (a.seasonPoints ?? 0))
  picks.sort((a, b) => a.year - b.year || (a.sport ?? '').localeCompare(b.sport ?? '') || a.round - b.round)

  return NextResponse.json({ team, players: roster, picks })
}
