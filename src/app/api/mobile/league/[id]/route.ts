import { NextResponse } from 'next/server'
import { db } from '@/db'
import { leagues, teams, teamRecords, users } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { safeParse, orderedSports } from '@/lib/utils'
import { bearerUserId } from '@/lib/mobileAuth'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = bearerUserId(req)
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const teamRows = await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation, logo: teams.logo, primaryColor: teams.primaryColor, secondaryColor: teams.secondaryColor, userId: teams.userId, ownerName: users.name })
    .from(teams).leftJoin(users, eq(teams.userId, users.id)).where(eq(teams.leagueId, id))
  const recs = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, id), eq(teamRecords.season, league.season)))
  const sports = orderedSports(safeParse<string[]>(league.sportsEnabled, []), league.seasonStart)

  const standings = sports.map(sport => ({
    sport,
    rows: recs.filter(r => r.sport === sport)
      .sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0) || (b.pointsFor ?? 0) - (a.pointsFor ?? 0))
      .map(r => {
        const t = teamRows.find(x => x.id === r.teamId)
        return { teamId: r.teamId, name: t?.name ?? '—', abbr: t?.abbreviation ?? '', wins: r.wins ?? 0, losses: r.losses ?? 0, ties: r.ties ?? 0, pointsFor: +(r.pointsFor ?? 0).toFixed(1) }
      }),
  }))

  const myTeam = teamRows.find(t => t.userId === uid) ?? null
  return NextResponse.json({
    league: { id: league.id, name: league.name, season: league.season, sports },
    teams: teamRows.map(t => ({ id: t.id, name: t.name, abbr: t.abbreviation, logo: t.logo, primary: t.primaryColor, secondary: t.secondaryColor, owner: t.ownerName })),
    standings,
    myTeamId: myTeam?.id ?? null,
  })
}
