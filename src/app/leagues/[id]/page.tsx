import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, teamRecords, matchups, users } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { safeParse, inSeasonNow } from '@/lib/utils'
import LeagueTabs from './LeagueTabs'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  return { title: league?.name ?? 'League' }
}

export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const { id } = await params

  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()

  const franchises = await db
    .select({ team: teams, userName: users.name })
    .from(teams)
    .leftJoin(users, eq(teams.userId, users.id))
    .where(eq(teams.leagueId, id))

  const records = await db
    .select().from(teamRecords)
    .where(and(eq(teamRecords.leagueId, id), eq(teamRecords.season, league.season)))

  const allMatchups = await db
    .select().from(matchups)
    .where(eq(matchups.leagueId, id))
    .limit(1000)

  const sportsEnabled = safeParse<string[]>(league.sportsEnabled, [])
  const schedule = safeParse<any[]>(league.sportSchedule, [])
  const federationScoring = safeParse<any>(league.federationScoring, { placement: [], championBonus: 0, regularSeasonBonus: 0, includedSports: sportsEnabled })
  const rosterSettings = safeParse<Record<string, Record<string, number>>>(league.rosterSettings, {})
  const isCommissioner = league.commissionerId === session?.user?.id
  const activeNow = inSeasonNow(sportsEnabled)

  const teamsLite = franchises.map(f => ({
    id: f.team.id, name: f.team.name, abbreviation: f.team.abbreviation, logo: f.team.logo, owner: f.userName,
  }))

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          {league.logoUrl
            ? <img src={league.logoUrl} alt="" className="w-16 h-16 rounded-2xl object-cover bg-slate-100 flex-shrink-0" />
            : <div className="w-16 h-16 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-3xl flex-shrink-0">🏆</div>}
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{league.name}</h1>
              <span className="badge bg-slate-100 text-slate-600">{league.status}</span>
            </div>
            <p className="text-slate-500 text-sm">
              {sportsEnabled.join(' · ')} · {league.season} · {teamsLite.length} franchises
            </p>
            {activeNow.length > 0 && (
              <p className="text-xs text-green-600 font-medium mt-1">● In season now: {activeNow.join(', ')}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/leagues/${id}/scores`} className="btn-secondary text-sm">Scores</Link>
          <Link href={`/leagues/${id}/playoffs`} className="btn-secondary text-sm">Playoffs</Link>
          <Link href={`/leagues/${id}/draft`} className="btn-secondary text-sm">Draft</Link>
          <Link href={`/leagues/${id}/history`} className="btn-secondary text-sm">History</Link>
          {isCommissioner && <Link href={`/leagues/${id}/settings`} className="btn-primary text-sm">⚙️ Settings</Link>}
        </div>
      </div>

      <LeagueTabs
        leagueId={id}
        sportsEnabled={sportsEnabled}
        teams={teamsLite}
        records={records as any}
        matchups={allMatchups as any}
        federationScoring={federationScoring}
        rosterSettings={rosterSettings}
        currentUserId={session?.user?.id}
      />
    </div>
  )
}
