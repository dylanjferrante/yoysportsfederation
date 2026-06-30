import { NextResponse } from 'next/server'
import { db } from '@/db'
import { leagues, teams, teamRecords, matchups } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { safeParse } from '@/lib/utils'
import { defaultFederationScoring, FederationScoring } from '@/lib/federation'
import { simulateSeason, SportInput } from '@/lib/odds'

// Rest-of-season odds: playoff %, per-sport title %, and federation-title odds.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const season = league.season
  const sportsEnabled = safeParse<string[]>(league.sportsEnabled, ['NFL', 'NHL', 'NBA', 'MLB'])
  const fs = safeParse<FederationScoring>(league.federationScoring, defaultFederationScoring(league.maxTeams ?? 12, sportsEnabled))
  const includedSports = fs.includedSports ?? sportsEnabled

  const teamRows = await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation, logo: teams.logo, primaryColor: teams.primaryColor }).from(teams).where(eq(teams.leagueId, id))

  const recs = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, id), eq(teamRecords.season, season)))
  const games = await db.select().from(matchups)
    .where(and(eq(matchups.leagueId, id), eq(matchups.isComplete, false)))

  const sports: SportInput[] = []
  for (const sport of sportsEnabled) {
    const sportRecs = recs.filter(r => r.sport === sport)
    if (sportRecs.length === 0) continue
    const remaining = games
      .filter(g => g.sport === sport && (g.season ?? season) === season && !g.isPlayoff && g.homeTeamId && g.awayTeamId)
      .map(g => ({ home: g.homeTeamId!, away: g.awayTeamId! }))
    sports.push({
      sport,
      playoffTeams: league.playoffTeams ?? 6,
      teams: sportRecs.map(r => ({
        teamId: r.teamId,
        wins: r.wins ?? 0,
        pointsFor: r.pointsFor ?? 0,
        games: (r.wins ?? 0) + (r.losses ?? 0) + (r.ties ?? 0),
      })),
      remaining,
    })
  }

  if (sports.length === 0) return NextResponse.json({ teams: teamRows, sports: [], odds: null })

  const odds = simulateSeason(sports, fs, includedSports, 3000)
  return NextResponse.json({
    teams: teamRows,
    sports: sports.map(s => s.sport),
    includedSports,
    odds,
  })
}
