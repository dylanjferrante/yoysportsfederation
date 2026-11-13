import { db } from '@/db'
import { players, rosters, teams, users, leagues, matchups, playerGameStats, playerNews } from '@/db/schema'
import { eq, and, or, desc } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { sportMeta, safeParse } from '@/lib/utils'
import { gameLogColumns } from '@/lib/scoring-categories'
import { YSF_LEAGUES, YSF_ART, U } from '@/lib/ysf'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [p] = await db.select().from(players).where(eq(players.id, id)).limit(1)
  return { title: p?.name ?? 'Player' }
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [p] = await db.select().from(players).where(eq(players.id, id)).limit(1)
  if (!p) notFound()
  const meta = sportMeta(p.sport)
  const L = YSF_LEAGUES.find(l => l.sport === p.sport)
  const color = L?.color ?? meta.hex

  // Fantasy ownership
  const [owned] = await db
    .select({ teamId: teams.id, teamName: teams.name, abbr: teams.abbreviation, owner: users.name, leagueId: leagues.id, leagueName: leagues.name, slot: rosters.slot, season: leagues.season })
    .from(rosters)
    .innerJoin(teams, eq(rosters.teamId, teams.id))
    .innerJoin(leagues, eq(teams.leagueId, leagues.id))
    .leftJoin(users, eq(teams.userId, users.id))
    .where(eq(rosters.playerId, id)).limit(1)

  // Upcoming fantasy matchup for the owning team in this sport
  let upcoming: { week: number; opp: string } | null = null
  if (owned) {
    const games = await db.select().from(matchups)
      .where(and(eq(matchups.leagueId, owned.leagueId), eq(matchups.sport, p.sport), eq(matchups.isComplete, false), or(eq(matchups.homeTeamId, owned.teamId), eq(matchups.awayTeamId, owned.teamId))))
    games.sort((a, b) => a.week - b.week)
    const g = games[0]
    if (g) {
      const oppId = g.homeTeamId === owned.teamId ? g.awayTeamId : g.homeTeamId
      const [opp] = oppId ? await db.select({ a: teams.abbreviation }).from(teams).where(eq(teams.id, oppId)).limit(1) : [{ a: 'BYE' }]
      upcoming = { week: g.week, opp: opp?.a ?? 'BYE' }
    }
  }

  // Game log
  const log = await db.select().from(playerGameStats).where(eq(playerGameStats.playerId, id)).orderBy(desc(playerGameStats.week)).limit(20)

  // News
  const news = await db.select().from(playerNews).where(eq(playerNews.playerId, id)).orderBy(desc(playerNews.createdAt)).limit(10)

  const eligible = safeParse<string[]>(p.eligiblePositions, [p.position])
  const cols = gameLogColumns(p.sport, p.position)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 w-full min-w-0">
      {/* Header: the player's league colour, symbol and code */}
      <section className="rounded p-5 sm:p-7 mb-6 text-white flex flex-wrap items-center gap-5" style={{ background: color }}>
        {p.photoUrl
          ? <img src={p.photoUrl} alt="" className="w-20 h-20 sm:w-28 sm:h-28 object-cover bg-white/15 rounded flex-none" />
          : L ? <img src={YSF_ART.leagueSymbol(L.key, 'color')} alt="" className="w-20 h-20 sm:w-28 sm:h-28 object-contain flex-none" /> : null}
        <div className="min-w-0 flex-1 basis-[240px]">
          <div className="ui text-[12px] sm:text-[13px] tracking-[.16em] opacity-90"><span className="ysf-case">{L?.code ?? p.sport}</span></div>
          <h1 className="disp text-[34px] sm:text-[56px] font-extrabold leading-[.9] mt-1 break-words">{p.name.toUpperCase()}</h1>
          <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2 mt-4">
            {[['TEAM', p.realTeam || 'FA'], ['POS', (p.position ?? '').replace(/\bDEF\b/, 'D/ST')], ['ELIGIBLE', eligible.join(' ').replace(/\bDEF\b/, 'D/ST')], ...(p.status !== 'ACTIVE' ? [['STATUS', p.status ?? '']] : [])].map(([k, v]) => (
              <div key={k} className="bg-white text-black rounded px-3 py-2 sm:min-w-[84px] text-center"><div className="ui text-[10px] font-bold tracking-[.1em]">{k}</div><div className="disp text-[18px] sm:text-[20px] font-extrabold leading-none mt-1">{v}</div></div>
            ))}
          </div>
          {p.status !== 'ACTIVE' && p.injuryNote && <p className="text-sm mt-3 font-semibold">{p.injuryNote}</p>}
        </div>
      </section>

      {/* News */}
      {news.length > 0 && (
        <div className="card mb-6">
          <div className="card-header"><h2>LATEST NEWS</h2></div>
          <ul className="divide-y divide-ink-50">
            {news.map(n => {
              return (
                <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-black">{n.headline}</p>
                    {n.body && <p className="text-sm text-ink-500 mt-0.5">{n.body}</p>}
                    <p className="text-[11px] text-ink-400 mt-0.5">{n.createdAt ? new Date(n.createdAt + 'Z').toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Season Pts', value: (p.seasonPoints ?? 0).toFixed(1) },
          { label: 'Projected', value: (p.projectedPoints ?? 0).toFixed(1) },
          { label: 'Per Game', value: (p.weeklyAvg ?? 0).toFixed(1) },
          { label: 'Status', value: p.status === 'ACTIVE' ? 'Active' : (p.status ?? '—') },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className="ui text-[11px] font-bold text-ink-500">{s.label.toUpperCase()}</div>
            <div className="disp text-[26px] font-extrabold leading-tight">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fantasy info */}
        <div className="card p-5">
          <h2 className="disp text-[17px] font-bold tracking-[.06em] mb-3">CLUB</h2>
          {owned ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink-500">Rostered by</span><Link href={`/leagues/${owned.leagueId}/teams/${owned.teamId}`} className="font-semibold hover:underline">{owned.teamName}</Link></div>
              <div className="flex justify-between"><span className="text-ink-500">Owner</span><span className="font-medium">{owned.owner}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">Lineup slot</span><span className="font-medium">{owned.slot}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">League</span><Link href={`/leagues/${owned.leagueId}`} className="font-semibold hover:underline">{owned.leagueName}</Link></div>
              <div className="flex justify-between"><span className="text-ink-500">Next opponent</span><span className="font-medium">{upcoming ? `${upcoming.opp}` : '—'}</span></div>
            </div>
          ) : <p className="text-sm text-ink-400">Free agent</p>}
        </div>

        {/* Game log — one column per stat */}
        <div className="lg:col-span-2 card overflow-x-auto">
          <div className="card-header"><h2>GAME LOG</h2></div>
          {log.length === 0 ? <p className="px-4 py-6 text-ink-400 text-sm">No game data yet.</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="ui text-[11px] text-ink-500 border-b border-ink-100">
                  <th className="text-left px-4 py-2 font-semibold">Wk</th>
                  {cols.map(c => <th key={c.label} className="text-center px-2 py-2 font-semibold">{c.label}</th>)}
                  <th className="text-right px-4 py-2 font-semibold">Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {log.map(g => {
                  const stats = safeParse<Record<string, number>>(g.stats ?? '{}', {})
                  return (
                    <tr key={g.id} className="hover:bg-ink-50">
                      <td className="px-4 py-2 text-ink-500 tabular-nums">{g.week}</td>
                      {cols.map(c => <td key={c.label} className="px-2 py-2 text-center tabular-nums text-black">{+c.get(stats).toFixed(1) || 0}</td>)}
                      <td className="px-4 py-2 text-right font-bold tabular-nums" style={{ color }}>{(g.points ?? 0).toFixed(1)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
