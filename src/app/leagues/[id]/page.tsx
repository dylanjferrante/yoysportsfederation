import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, matchups, draftPicks, users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sportMeta } from '@/lib/utils'

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

  const leagueTeams = await db
    .select({ team: teams, user: users })
    .from(teams)
    .leftJoin(users, eq(teams.userId, users.id))
    .where(eq(teams.leagueId, id))

  // Sort by wins desc, then points_for desc
  leagueTeams.sort((a, b) => {
    if ((b.team.wins ?? 0) !== (a.team.wins ?? 0)) return (b.team.wins ?? 0) - (a.team.wins ?? 0)
    return (b.team.pointsFor ?? 0) - (a.team.pointsFor ?? 0)
  })

  const currentMatchups = await db
    .select().from(matchups)
    .where(eq(matchups.leagueId, id))
    .orderBy(matchups.week)
    .limit(50)

  const isCommissioner = league.commissionerId === session?.user?.id
  const meta = sportMeta(league.sport)

  const activeMatchups = currentMatchups.filter(m => !m.isComplete)
  const completedMatchups = currentMatchups.filter(m => m.isComplete).slice(0, 5)

  const rosterSettings = JSON.parse(league.rosterSettings ?? '{}')

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl ${meta.bg} text-white flex items-center justify-center text-3xl flex-shrink-0`}>
            {meta.emoji}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-slate-900">{league.name}</h1>
              <span className="badge bg-slate-100 text-slate-600">{league.status}</span>
            </div>
            <p className="text-slate-500 text-sm">{league.sport} · {league.season} · {league.draftType} Draft</p>
          </div>
        </div>
        {isCommissioner && (
          <Link href={`/leagues/${id}/settings`} className="btn-secondary flex-shrink-0">
            ⚙️ Settings
          </Link>
        )}
      </div>

      {/* Info bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Teams',      value: leagueTeams.length },
          { label: 'Max Teams',  value: league.maxTeams },
          { label: 'Waivers',    value: league.waiverType },
          { label: 'Trade Review',value: league.tradeReview },
        ].map(s => (
          <div key={s.label} className="card p-3 text-center">
            <div className="font-bold text-slate-900">{s.value}</div>
            <div className="text-xs text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Standings */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold text-slate-900">Standings</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-slate-400 border-b border-slate-100">
                    <th className="text-left px-6 py-2 font-medium">#</th>
                    <th className="text-left px-2 py-2 font-medium">Team</th>
                    <th className="text-center px-2 py-2 font-medium">W</th>
                    <th className="text-center px-2 py-2 font-medium">L</th>
                    <th className="text-center px-2 py-2 font-medium">PF</th>
                    <th className="text-center px-2 py-2 font-medium">PA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {leagueTeams.map(({ team, user }, i) => {
                    const isMe = user?.id === session?.user?.id
                    return (
                      <tr key={team.id} className={`text-sm hover:bg-slate-50 transition-colors ${isMe ? 'bg-blue-50/50' : ''}`}>
                        <td className="px-6 py-3 text-slate-400 font-medium">{i + 1}</td>
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                              {team.abbreviation}
                            </div>
                            <div>
                              <p className={`font-medium ${isMe ? 'text-blue-700' : 'text-slate-900'}`}>{team.name}</p>
                              <p className="text-xs text-slate-400">{user?.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="text-center px-2 py-3 font-semibold text-slate-900">{team.wins}</td>
                        <td className="text-center px-2 py-3 text-slate-500">{team.losses}</td>
                        <td className="text-center px-2 py-3 text-slate-700">{team.pointsFor?.toFixed(1)}</td>
                        <td className="text-center px-2 py-3 text-slate-400">{team.pointsAgainst?.toFixed(1)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Current matchups */}
          {activeMatchups.length > 0 && (
            <div className="card mt-4">
              <div className="card-header">
                <h2 className="font-semibold text-slate-900">Current Matchups</h2>
              </div>
              <div className="divide-y divide-slate-50">
                {activeMatchups.map(m => {
                  const home = leagueTeams.find(t => t.team.id === m.homeTeamId)
                  const away = leagueTeams.find(t => t.team.id === m.awayTeamId)
                  return (
                    <div key={m.id} className="px-6 py-4">
                      <p className="text-xs text-slate-400 mb-2">Week {m.week}</p>
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-slate-900">{home?.team.name ?? '—'}</div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-slate-900">{m.homeScore?.toFixed(1)} – {m.awayScore?.toFixed(1)}</div>
                          <div className="text-xs text-slate-400">Live</div>
                        </div>
                        <div className="text-sm font-medium text-slate-900 text-right">{away?.team.name ?? 'BYE'}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* League info */}
          <div className="card">
            <div className="card-header"><h2 className="font-semibold text-slate-900">League Info</h2></div>
            <div className="card-body space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Draft Type</span><span className="font-medium">{league.draftType}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Waivers</span><span className="font-medium">{league.waiverType}</span></div>
              {league.waiverType === 'FAAB' && <div className="flex justify-between"><span className="text-slate-500">FAAB Budget</span><span className="font-medium">${league.faabBudget}</span></div>}
              <div className="flex justify-between"><span className="text-slate-500">Trade Review</span><span className="font-medium">{league.tradeReview}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Playoff Teams</span><span className="font-medium">{league.playoffTeams}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Reg. Season</span><span className="font-medium">{league.regularSeasonWeeks} wks</span></div>
              {league.inviteCode && isCommissioner && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-xs text-slate-400 mb-1">Invite Code</p>
                  <code className="text-sm font-mono bg-slate-100 px-2 py-1 rounded">{league.inviteCode}</code>
                </div>
              )}
            </div>
          </div>

          {/* Roster slots */}
          <div className="card">
            <div className="card-header"><h2 className="font-semibold text-slate-900">Roster Slots</h2></div>
            <div className="card-body space-y-1 text-sm">
              {Object.entries(rosterSettings).map(([pos, count]) => (
                <div key={pos} className="flex justify-between">
                  <span className="text-slate-500">{pos}</span>
                  <span className="font-medium">{String(count)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
