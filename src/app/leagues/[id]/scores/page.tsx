import { db } from '@/db'
import { leagues, teams, matchups, teamRecords } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
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
  const isCommish = league.commissionerId === session?.user?.id

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/leagues/${id}`} className="btn-ghost text-slate-500">← Back</Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Scoreboard</h1>
          <p className="text-sm text-slate-500">{league.name}</p>
        </div>
      </div>
      <ScoresView
        leagueId={id}
        matchups={all as any}
        teams={franchises}
        sportsEnabled={sportsEnabled}
        currentSeason={league.season}
        sportNames={safeParse<Record<string, string>>(league.sportNames, {})}
        schedule={safeParse<any[]>(league.sportSchedule, [])}
        records={recs as any}
        isCommish={isCommish}
      />
    </div>
  )
}
