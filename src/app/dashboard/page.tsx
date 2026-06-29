import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { leagues, leagueMembers, teams, teamRecords, trades } from '@/db/schema'
import { eq, and, or, inArray } from 'drizzle-orm'
import Link from 'next/link'
import { sportMeta, safeParse, inSeasonNow } from '@/lib/utils'
import { computeFederationStandings } from '@/lib/federation'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/auth/login')
  const uid = session.user.id

  const memberships = await db
    .select({ league: leagues })
    .from(leagueMembers)
    .leftJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
    .where(eq(leagueMembers.userId, uid))
  const myLeagues = memberships.map(m => m.league).filter(Boolean) as typeof leagues.$inferSelect[]

  const myTeams = await db.select().from(teams).where(eq(teams.userId, uid))
  const myTeamIds = myTeams.map(t => t.id)

  const pendingTrades = myTeamIds.length
    ? await db.select().from(trades).where(
        and(
          or(inArray(trades.initiatorId, myTeamIds), inArray(trades.recipientId, myTeamIds)),
          eq(trades.status, 'PENDING'),
        )
      )
    : []

  // Build a federation summary per league.
  const cards = await Promise.all(myLeagues.map(async (league) => {
    const sports = safeParse<string[]>(league.sportsEnabled, [])
    const fed = safeParse<any>(league.federationScoring, { placement: [], championBonus: 0, regularSeasonBonus: 0, includedSports: sports })
    const franchises = await db.select().from(teams).where(eq(teams.leagueId, league.id))
    const records = await db.select().from(teamRecords)
      .where(and(eq(teamRecords.leagueId, league.id), eq(teamRecords.season, league.season)))
    const standings = computeFederationStandings(
      franchises.map(f => ({ id: f.id })),
      records.map(r => ({ teamId: r.teamId, sport: r.sport, finishPosition: r.finishPosition, isChampion: r.isChampion })),
      fed, fed.includedSports ?? sports,
    )
    const myTeam = franchises.find(f => f.userId === uid)
    const myRank = myTeam ? standings.findIndex(s => s.team.id === myTeam.id) + 1 : 0
    const myRow = myTeam ? standings.find(s => s.team.id === myTeam.id) : null
    const myRecords = myTeam ? records.filter(r => r.teamId === myTeam.id) : []
    return { league, sports, myTeam, myRank, fedPoints: myRow?.total ?? 0, total: standings.length, myRecords }
  }))

  const enabledUnion = [...new Set(cards.flatMap(c => c.sports))]
  const activeNow = inSeasonNow(enabledUnion)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back, {session.user?.name?.split(' ')[0]}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Your franchises across the federation{activeNow.length ? ` · in season now: ${activeNow.join(', ')}` : ''}
          </p>
        </div>
        <Link href="/leagues/new" className="btn-primary">+ Create League</Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Leagues', value: myLeagues.length },
          { label: 'Franchises', value: myTeams.length },
          { label: 'Pending Trades', value: pendingTrades.length },
          { label: 'Sports', value: enabledUnion.length },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <div className="text-3xl font-black text-slate-900">{s.value}</div>
            <div className="text-sm text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">My Franchises</h2>
            <Link href="/leagues" className="text-sm text-blue-600 hover:underline">Browse all</Link>
          </div>
          {cards.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-slate-400 mb-4">You're not in any leagues yet</p>
              <Link href="/leagues/new" className="btn-primary">Create your first league</Link>
            </div>
          ) : cards.map(({ league, sports, myTeam, myRank, fedPoints, total, myRecords }) => (
            <div key={league.id} className="card p-5">
              <div className="flex items-center gap-3 mb-3">
                {league.logoUrl
                  ? <img src={league.logoUrl} alt="" className="w-11 h-11 rounded-xl object-cover bg-slate-100" />
                  : <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xl">🏆</div>}
                <div className="flex-1 min-w-0">
                  <Link href={`/leagues/${league.id}`} className="font-semibold text-slate-900 hover:text-blue-600">{league.name}</Link>
                  <p className="text-xs text-slate-400">{myTeam?.name} · {sports.join(' · ')}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-slate-900">{fedPoints}</div>
                  <div className="text-xs text-slate-400">Fed pts · {myRank ? `#${myRank}/${total}` : '—'}</div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {myRecords.map((r: any) => (
                  <div key={r.sport} className="text-center bg-slate-50 rounded-lg py-2">
                    <div className="text-xs text-slate-400">{sportMeta(r.sport).emoji} {r.sport}</div>
                    <div className="text-sm font-semibold text-slate-800">{r.wins}-{r.losses}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Pending Trades</h2>
              <Link href="/trade" className="text-sm text-blue-600 hover:underline">View all</Link>
            </div>
            <div className="card-body py-3">
              {pendingTrades.length === 0
                ? <p className="text-sm text-slate-400 text-center py-4">No pending trades</p>
                : <div className="space-y-2">
                    {pendingTrades.slice(0, 5).map(t => (
                      <Link key={t.id} href="/trade" className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                        <span className="text-xs text-slate-600 truncate">Trade #{t.id.slice(-4)}</span>
                        <span className="badge bg-yellow-100 text-yellow-800">Pending</span>
                      </Link>
                    ))}
                  </div>}
              <Link href="/trade/new" className="btn-secondary w-full mt-3 text-sm">Propose Trade</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
