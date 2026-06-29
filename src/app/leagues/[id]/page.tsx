import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, teamRecords, matchups, users, activity } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { safeParse, inSeasonNow } from '@/lib/utils'
import LeagueTabs from './LeagueTabs'
import DuesPanel from './DuesPanel'

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

  const feed = await db
    .select().from(activity)
    .where(eq(activity.leagueId, id))
    .orderBy(desc(activity.createdAt))
    .limit(12)

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
            {isCommissioner && league.inviteCode && (
              <p className="text-xs text-slate-400 mt-1">Invite code: <span className="font-mono font-bold text-slate-600 tracking-wider">{league.inviteCode}</span></p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/leagues/${id}/scores`} className="btn-secondary text-sm">Scores</Link>
          <Link href={`/leagues/${id}/transactions`} className="btn-secondary text-sm">Transactions</Link>
          <Link href={`/leagues/${id}/waivers`} className="btn-secondary text-sm">Waivers</Link>
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

      <DuesPanel leagueId={id} isCommissioner={isCommissioner} />

      {/* League activity feed */}
      <div className="card mt-8">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">League Activity</h2>
          <Link href={`/leagues/${id}/transactions`} className="text-xs font-medium text-blue-600 hover:underline">View all transactions →</Link>
        </div>
        {feed.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-400">No recent activity.</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {feed.map(a => {
              const icon = a.type === 'TRADE' ? '🔁' : a.type === 'SCORES' ? '📊' : a.type === 'WAIVER' ? '📝' : a.type === 'DRAFT' ? '🏈' : '•'
              return (
                <li key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="text-base leading-5">{icon}</span>
                  <div className="flex-1">
                    <p className="text-sm text-slate-700">{a.message}</p>
                    <p className="text-[11px] text-slate-400">{a.createdAt ? new Date(a.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
