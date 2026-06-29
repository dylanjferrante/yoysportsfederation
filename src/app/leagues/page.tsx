import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, leagueMembers, teams } from '@/db/schema'
import { eq } from 'drizzle-orm'
import Link from 'next/link'
import { sportMeta, safeParse } from '@/lib/utils'
import JoinLeague from './JoinLeague'

export const metadata = { title: 'Leagues' }

export default async function LeaguesPage() {
  const session = await getServerSession(authOptions)

  const allLeagues = await db.select().from(leagues)

  const myMemberships = session
    ? await db.select({ leagueId: leagueMembers.leagueId }).from(leagueMembers).where(eq(leagueMembers.userId, session.user.id))
    : []
  const myLeagueIds = new Set(myMemberships.map(m => m.leagueId))

  const counts = await db.select({ leagueId: teams.leagueId }).from(teams)
  const teamCount = counts.reduce((acc, t) => { acc[t.leagueId] = (acc[t.leagueId] ?? 0) + 1; return acc }, {} as Record<string, number>)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leagues</h1>
          <p className="text-slate-500 text-sm mt-0.5">Cross-sport federations — one franchise, every sport</p>
        </div>
        {session && (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <JoinLeague />
            <Link href="/leagues/new" className="btn-primary">+ Create League</Link>
          </div>
        )}
      </div>

      {allLeagues.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-lg mb-4">No leagues yet</p>
          {session && <Link href="/leagues/new" className="btn-primary">Create the first league</Link>}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {allLeagues.map(league => {
            const sports = safeParse<string[]>(league.sportsEnabled, [])
            const isMember = myLeagueIds.has(league.id)
            return (
              <Link key={league.id} href={`/leagues/${league.id}`} className="card p-5 hover:shadow-md transition-shadow block">
                <div className="flex items-start justify-between mb-3">
                  {league.logoUrl
                    ? <img src={league.logoUrl} alt="" className="w-12 h-12 rounded-xl object-cover bg-slate-100" />
                    : <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center text-2xl">🏆</div>}
                  {isMember && <span className="badge bg-blue-100 text-blue-700">Joined</span>}
                </div>
                <h3 className="font-semibold text-slate-900 mb-1">{league.name}</h3>
                <p className="text-xs text-slate-400 mb-3">{league.season} · {teamCount[league.id] ?? 0}/{league.maxTeams} franchises · {league.status}</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {sports.map(s => (
                    <span key={s} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sportMeta(s).light}`}>{sportMeta(s).emoji} {s}</span>
                  ))}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
