import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { leagues, leagueMembers, teams, matchups, trades } from '@/db/schema'
import { eq, or } from 'drizzle-orm'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/auth/login')

  const memberships = await db
    .select({ league: leagues })
    .from(leagueMembers)
    .leftJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
    .where(eq(leagueMembers.userId, session.user.id))

  const myLeagues = memberships.map(m => m.league).filter(Boolean) as typeof leagues.$inferSelect[]

  const myTeams = await db.select().from(teams).where(eq(teams.userId, session.user.id))

  const pendingTrades = await db.select().from(trades).where(
    or(...myTeams.flatMap(t => [eq(trades.initiatorId, t.id), eq(trades.recipientId, t.id)]))
  ).then(ts => ts.filter(t => t.status === 'PENDING'))

  const currentMatchups = myTeams.length
    ? await db.select().from(matchups).where(
        or(...myTeams.flatMap(t => [eq(matchups.homeTeamId, t.id), eq(matchups.awayTeamId, t.id ?? '')]))
      ).then(ms => ms.filter(m => !m.isComplete).slice(0, 5))
    : []

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back, {session.user?.name?.split(' ')[0]}</h1>
          <p className="text-slate-500 text-sm mt-0.5">Here's what's happening across your leagues</p>
        </div>
        <Link href="/leagues/new" className="btn-primary">+ Create League</Link>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Leagues',       value: myLeagues.length },
          { label: 'Teams',         value: myTeams.length },
          { label: 'Pending Trades',value: pendingTrades.length },
          { label: 'Live Matchups', value: currentMatchups.length },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <div className="text-3xl font-black text-slate-900">{s.value}</div>
            <div className="text-sm text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* My leagues */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">My Leagues</h2>
              <Link href="/leagues" className="text-sm text-blue-600 hover:underline">Browse all</Link>
            </div>
            {myLeagues.length === 0 ? (
              <div className="card-body text-center py-12">
                <p className="text-slate-400 mb-4">You're not in any leagues yet</p>
                <Link href="/leagues/new" className="btn-primary">Create your first league</Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {myLeagues.map(league => {
                  const meta = sportMeta(league.sport)
                  const myTeam = myTeams.find(t => t.leagueId === league.id)
                  return (
                    <Link key={league.id} href={`/leagues/${league.id}`}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors">
                      <div className={`w-10 h-10 rounded-xl ${meta.bg} text-white flex items-center justify-center text-xl flex-shrink-0`}>
                        {meta.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 truncate">{league.name}</p>
                        <p className="text-xs text-slate-400">{league.sport} · {league.season} · {league.status}</p>
                      </div>
                      {myTeam && (
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-700">{myTeam.name}</p>
                          <p className="text-xs text-slate-400">{myTeam.wins}–{myTeam.losses}</p>
                        </div>
                      )}
                      <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Pending trades */}
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Pending Trades</h2>
              <Link href="/trade" className="text-sm text-blue-600 hover:underline">View all</Link>
            </div>
            <div className="card-body py-3">
              {pendingTrades.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No pending trades</p>
              ) : (
                <div className="space-y-2">
                  {pendingTrades.slice(0, 4).map(t => (
                    <Link key={t.id} href="/trade" className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                      <span className="text-xs text-slate-600 truncate">Trade #{t.id.slice(-4)}</span>
                      <span className="badge bg-yellow-100 text-yellow-800">Pending</span>
                    </Link>
                  ))}
                </div>
              )}
              <Link href="/trade/new" className="btn-secondary w-full mt-3 text-sm">Propose Trade</Link>
            </div>
          </div>

          {/* Live matchups */}
          {currentMatchups.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2 className="font-semibold text-slate-900">Live Matchups</h2>
              </div>
              <div className="divide-y divide-slate-50">
                {currentMatchups.map(m => (
                  <div key={m.id} className="px-4 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-700 font-medium">{m.homeScore?.toFixed(1)}</span>
                      <span className="text-xs text-slate-400">vs</span>
                      <span className="text-slate-700 font-medium">{m.awayScore?.toFixed(1)}</span>
                    </div>
                    <p className="text-xs text-slate-400 text-center">Week {m.week}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
