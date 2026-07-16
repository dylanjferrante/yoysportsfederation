import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, leagueMembers, teams, teamRecords } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import Link from 'next/link'
import { sportMeta, safeParse } from '@/lib/utils'
import { computeFederationStandings } from '@/lib/federation'
import JoinLeague from './JoinLeague'

export const metadata = { title: 'Leagues' }

export default async function LeaguesPage() {
  const session = await getServerSession(authOptions)
  const uid = session?.user?.id

  const allLeagues = await db.select().from(leagues)
  const myMemberships = uid
    ? await db.select({ leagueId: leagueMembers.leagueId }).from(leagueMembers).where(eq(leagueMembers.userId, uid))
    : []
  const myLeagueIds = new Set(myMemberships.map(m => m.leagueId))

  // Per league: my club's federation standing + per-sport records (like the team
  // tiles on the dashboard), so each league tile shows where I stand at a glance.
  const cards = await Promise.all(allLeagues.map(async (league) => {
    const sports = safeParse<string[]>(league.sportsEnabled, [])
    const franchises = await db.select().from(teams).where(eq(teams.leagueId, league.id))
    const myTeam = uid ? franchises.find(f => f.userId === uid) : undefined
    let mine: { teamName: string; rank: number; total: number; fedPoints: number; records: any[] } | null = null
    if (myTeam) {
      const fed = safeParse<any>(league.federationScoring, { placement: [], championBonus: 0, regularSeasonBonus: 0, includedSports: sports })
      const records = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, league.id), eq(teamRecords.season, league.season)))
      const standings = computeFederationStandings(
        franchises.map(f => ({ id: f.id })),
        records.map(r => ({ teamId: r.teamId, sport: r.sport, finishPosition: r.finishPosition, isChampion: r.isChampion })),
        fed, fed.includedSports ?? sports,
      )
      const rank = standings.findIndex(s => s.team.id === myTeam.id) + 1
      const row = standings.find(s => s.team.id === myTeam.id)
      const bySport = new Map(records.filter(r => r.teamId === myTeam.id).map(r => [r.sport, r]))
      mine = { teamName: myTeam.name, rank, total: standings.length, fedPoints: row?.total ?? 0, records: sports.map(s => bySport.get(s)).filter(Boolean) }
    }
    return { league, sports, isMember: myLeagueIds.has(league.id), teamCount: franchises.length, mine }
  }))

  // My leagues first, then the rest.
  cards.sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || (b.isMember ? 1 : 0) - (a.isMember ? 1 : 0))

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leagues</h1>
          <p className="text-slate-500 text-sm mt-0.5">Cross-sport federations — one club, every sport</p>
        </div>
        {session && (
          <div className="flex items-center gap-2 flex-wrap sm:justify-end">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map(({ league, sports, isMember, teamCount, mine }) => (
            <Link key={league.id} href={`/leagues/${league.id}`} className="card p-5 hover:shadow-md transition-shadow block">
              <div className="flex items-center gap-3 mb-3">
                {league.logoUrl
                  ? <img src={league.logoUrl} alt="" className="w-11 h-11 object-contain bg-slate-100 rounded-xl flex-shrink-0" />
                  : <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xl flex-shrink-0">🏆</div>}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900 truncate">{league.name}</h3>
                  <p className="text-xs text-slate-400 truncate">{mine ? mine.teamName : `${teamCount}/${league.maxTeams} clubs`} · {league.season}</p>
                </div>
                {mine
                  ? <div className="text-right flex-shrink-0">
                      <div className="text-xl font-black text-slate-900 leading-none">{mine.fedPoints}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Fed · {mine.rank ? `#${mine.rank}/${mine.total}` : '—'}</div>
                    </div>
                  : isMember ? <span className="badge bg-blue-100 text-blue-700 flex-shrink-0">Joined</span> : null}
              </div>
              {mine && mine.records.length > 0 ? (
                <div className="grid grid-cols-4 gap-1.5">
                  {mine.records.map((r: any) => (
                    <div key={r.sport} className="text-center bg-slate-50 rounded-lg py-1.5">
                      <div className="text-[10px] text-slate-400">{sportMeta(r.sport).emoji} {r.sport}</div>
                      <div className="text-xs font-semibold text-slate-800 tabular-nums">{r.wins}-{r.losses}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {sports.map(s => (
                    <span key={s} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sportMeta(s).light}`}>{sportMeta(s).emoji} {s}</span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
