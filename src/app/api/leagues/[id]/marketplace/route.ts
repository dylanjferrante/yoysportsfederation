import { NextResponse } from 'next/server'
import { db } from '@/db'
import { rosters, players, teams } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

// Trade block: every player flagged "available" across the league.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rows = await db
    .select({
      rosterId: rosters.id, sport: rosters.sport, slot: rosters.slot,
      playerId: players.id, name: players.name, position: players.position,
      realTeam: players.realTeam, projectedPoints: players.projectedPoints, status: players.status,
      teamId: teams.id, teamName: teams.name, teamAbbr: teams.abbreviation,
    })
    .from(rosters)
    .innerJoin(players, eq(rosters.playerId, players.id))
    .innerJoin(teams, eq(rosters.teamId, teams.id))
    .where(and(eq(teams.leagueId, id), eq(rosters.onBlock, true)))
  return NextResponse.json(rows)
}
