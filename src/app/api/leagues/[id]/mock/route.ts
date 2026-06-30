import { NextResponse } from 'next/server'
import { db } from '@/db'
import { leagues, teams, rosters, players } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { safeParse } from '@/lib/utils'

// Data for the mock-draft simulator: the franchises (draft order pool), the
// available player pool ranked by ADP, and a sensible round count. Nothing is
// persisted — the mock runs entirely client-side.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sportsEnabled = safeParse<string[]>(league.sportsEnabled, ['NFL', 'NHL', 'NBA', 'MLB'])

  const teamRows = await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation, primaryColor: teams.primaryColor, secondaryColor: teams.secondaryColor, logo: teams.logo })
    .from(teams).where(eq(teams.leagueId, id))

  // Rostered players in this league are unavailable in the mock.
  const rostered = await db.select({ playerId: rosters.playerId })
    .from(rosters).innerJoin(teams, eq(rosters.teamId, teams.id)).where(eq(teams.leagueId, id))
  const taken = new Set(rostered.map(r => r.playerId))

  const pool = await db.select({ id: players.id, name: players.name, position: players.position, sport: players.sport, realTeamAbbr: players.realTeamAbbr, adp: players.adp, projectedPoints: players.projectedPoints })
    .from(players).where(inArray(players.sport, sportsEnabled))
  const available = pool
    .filter(p => !taken.has(p.id))
    .sort((a, b) => (a.adp ?? 9999) - (b.adp ?? 9999) || (b.projectedPoints ?? 0) - (a.projectedPoints ?? 0))
    .slice(0, 400)

  return NextResponse.json({
    teams: teamRows,
    available,
    sportsEnabled,
  })
}
