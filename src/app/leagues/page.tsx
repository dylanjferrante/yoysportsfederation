import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, leagueMembers, teams } from '@/db/schema'
import { eq } from 'drizzle-orm'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

export const metadata = { title: 'Leagues' }

export default async function LeaguesPage() {
  const session = await getServerSession(authOptions)

  const allLeagues = await db.select().from(leagues)

  const myMemberships = session
    ? await db.select({ leagueId: leagueMembers.leagueId }).from(leagueMembers).where(eq(leagueMembers.userId, session.user.id))
    : []
  const myLeagueIds = new Set(myMemberships.map(m => m.leagueId))

  const grouped = { NFL: [], NBA: [], NHL: [], MLB: [] } as Record<string, typeof allLeagues>
  for (const l of allLeagues) grouped[l.sport]?.push(l)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leagues</h1>
          <p className="text-slate-500 text-sm mt-0.5">Browse and join leagues across all four sports</p>
        </div>
        {session && <Link href="/leagues/new" className="btn-primary">+ Create League</Link>}
      </div>

      {Object.entries(grouped).map(([sport, sportLeagues]) => {
        if (!sportLeagues.length) return null
        const meta = sportMeta(sport)
        return (
          <div key={sport} className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">{meta.emoji}</span>
              <h2 className="text-lg font-bold text-slate-900">{sport} Leagues</h2>
              <span className="badge bg-slate-100 text-slate-600">{sportLeagues.length}</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sportLeagues.map(league => {
                const isMember = myLeagueIds.has(league.id)
                return (
                  <Link key={league.id} href={`/leagues/${league.id}`}
                    className="card p-5 hover:shadow-md transition-shadow block">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-10 h-10 rounded-xl ${meta.bg} text-white flex items-center justify-center text-xl flex-shrink-0`}>
                        {meta.emoji}
                      </div>
                      {isMember && <span className="badge bg-blue-100 text-blue-700">Joined</span>}
                    </div>
                    <h3 className="font-semibold text-slate-900 mb-1">{league.name}</h3>
                    <p className="text-xs text-slate-400 mb-3">{league.season} · {league.draftType} Draft · {league.status}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>Up to {league.maxTeams} teams</span>
                      <span>·</span>
                      <span>{league.waiverType === 'FAAB' ? `FAAB $${league.faabBudget}` : league.waiverType}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })}

      {allLeagues.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <p className="text-lg mb-4">No leagues yet</p>
          {session && <Link href="/leagues/new" className="btn-primary">Create the first league</Link>}
        </div>
      )}
    </div>
  )
}
