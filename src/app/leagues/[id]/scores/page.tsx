import { db } from '@/db'
import { leagues, teams, matchups, teamRecords, playoffGames } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { safeParse, orderedSports } from '@/lib/utils'
import { advanceLeague } from '@/lib/advance'
import ScoresView from './ScoresView'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  return { title: `${league?.name ?? 'League'} · Scores` }
}

export default async function ScoresPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()
  await advanceLeague(league)

  const session = await getServerSession(authOptions)
  const franchises = await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation, logo: teams.logo, primaryColor: teams.primaryColor, secondaryColor: teams.secondaryColor, logoBg: teams.logoBg }).from(teams).where(eq(teams.leagueId, id))
  const all = await db.select().from(matchups).where(eq(matchups.leagueId, id)).limit(3000)
  const recs = await db.select({ teamId: teamRecords.teamId, sport: teamRecords.sport, wins: teamRecords.wins, losses: teamRecords.losses, ties: teamRecords.ties })
    .from(teamRecords).where(and(eq(teamRecords.leagueId, id), eq(teamRecords.season, league.season)))
  const sportsEnabled = orderedSports(safeParse<string[]>(league.sportsEnabled, []), league.seasonStart)

  // Fold playoff games onto the scoreboard timeline. A game in round R for a sport sits at
  // federation week (regular-season end + R); flag it so the view can mark it as a playoff.
  const schedule = safeParse<any[]>(league.sportSchedule, [])
  const poGames = await db.select().from(playoffGames).where(and(eq(playoffGames.leagueId, id), eq(playoffGames.season, league.season)))
  const maxRoundBySport: Record<string, number> = {}
  for (const g of poGames) maxRoundBySport[g.sport] = Math.max(maxRoundBySport[g.sport] ?? 0, g.round)
  const roundLabel = (sport: string, round: number) => {
    const fromEnd = (maxRoundBySport[sport] ?? round) - round
    return fromEnd === 0 ? 'Final' : fromEnd === 1 ? 'Semifinal' : fromEnd === 2 ? 'Quarterfinal' : `Round ${round}`
  }
  const bracketPrefix: Record<string, string> = { CONSOLATION: 'Consolation · ', LOSERS: 'Toilet Bowl · ' }
  const playoffMatchups = poGames.map(g => {
    const regEnd = schedule.find((s: any) => s.sport === g.sport)?.endWeek ?? 0
    return {
      id: g.id, sport: g.sport, season: g.season, week: regEnd + g.round,
      homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId, homeScore: g.homeScore ?? 0, awayScore: g.awayScore ?? 0,
      isComplete: g.isComplete ?? false, playoff: true,
      playoffLabel: `${bracketPrefix[g.bracket ?? 'WINNERS'] ?? ''}${roundLabel(g.sport, g.round)}`,
    }
  })
  const isCommish = league.commissionerId === session?.user?.id

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Scoreboard</h1>
      <ScoresView
        leagueId={id}
        matchups={[...all, ...playoffMatchups] as any}
        teams={franchises}
        sportsEnabled={sportsEnabled}
        currentSeason={league.season}
        sportNames={safeParse<Record<string, string>>(league.sportNames, {})}
        divisionLogos={safeParse<Record<string, string>>(league.divisionLogos, {})}
        schedule={schedule}
        records={recs as any}
        isCommish={isCommish}
      />
    </div>
  )
}
