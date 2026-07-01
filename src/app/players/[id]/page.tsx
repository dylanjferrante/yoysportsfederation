import { db } from '@/db'
import { players, rosters, teams, users, leagues, matchups, playerGameStats, playerNews } from '@/db/schema'
import { eq, and, or, desc } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { sportMeta, safeParse } from '@/lib/utils'
import { gameLogColumns } from '@/lib/scoring-categories'

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
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link href="/players" className="btn-ghost text-slate-500 mb-4 inline-block">← Players</Link>

      {/* Header */}
      <div className="rounded-2xl p-6 mb-6 text-white" style={{ background: `linear-gradient(135deg, ${meta.hex} 0%, ${meta.hex}cc 100%)` }}>
        <div className="flex items-center gap-4 flex-wrap">
          {p.photoUrl
            ? <img src={p.photoUrl} alt="" className="w-16 h-16 object-cover bg-white/15" />
            : <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center text-xl font-black">{p.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</div>}
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black">{p.name}</h1>
              {p.status !== 'ACTIVE' && <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded">{p.status}</span>}
            </div>
            <p className="text-white/80 text-sm">{meta.emoji} {p.sport} · {p.position} · {p.realTeam} · eligible: {eligible.join(', ')}</p>
            {p.status !== 'ACTIVE' && p.injuryNote && <p className="text-white/90 text-sm mt-1 font-medium">🚑 {p.injuryNote}</p>}
          </div>
        </div>
      </div>

      {/* News */}
      {news.length > 0 && (
        <div className="card mb-6">
          <div className="card-header"><h2 className="font-semibold text-slate-900">Latest News</h2></div>
          <ul className="divide-y divide-slate-50">
            {news.map(n => {
              const icon = n.category === 'INJURY' ? '🚑' : n.category === 'PERFORMANCE' ? '📈' : n.category === 'TRANSACTION' ? '🔁' : '📰'
              return (
                <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="text-base leading-5">{icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900">{n.headline}</p>
                    {n.body && <p className="text-sm text-slate-500 mt-0.5">{n.body}</p>}
                    <p className="text-[11px] text-slate-400 mt-0.5">{n.createdAt ? new Date(n.createdAt + 'Z').toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</p>
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
          <div key={s.label} className="card p-4 text-center">
            <div className="text-2xl font-black text-slate-900">{s.value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Fantasy info */}
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Fantasy</h2>
          {owned ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Rostered by</span><Link href={`/teams/${owned.teamId}`} className="font-medium text-blue-600 hover:underline">{owned.teamName}</Link></div>
              <div className="flex justify-between"><span className="text-slate-500">Owner</span><span className="font-medium">{owned.owner}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Lineup slot</span><span className="font-medium">{owned.slot}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">League</span><Link href={`/leagues/${owned.leagueId}`} className="font-medium text-blue-600 hover:underline">{owned.leagueName}</Link></div>
              <div className="flex justify-between"><span className="text-slate-500">Next game</span><span className="font-medium">{upcoming ? `Wk ${upcoming.week} vs ${upcoming.opp}` : '—'}</span></div>
            </div>
          ) : <p className="text-sm text-slate-400">Free agent — not currently rostered.</p>}
        </div>

        {/* Game log — one column per stat */}
        <div className="lg:col-span-2 card overflow-x-auto">
          <div className="card-header"><h2 className="font-semibold text-slate-900">Game Log</h2></div>
          {log.length === 0 ? <p className="px-4 py-6 text-slate-400 text-sm">No game data yet.</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-100">
                  <th className="text-left px-4 py-2 font-semibold">Wk</th>
                  {cols.map(c => <th key={c.label} className="text-center px-2 py-2 font-semibold">{c.label}</th>)}
                  <th className="text-right px-4 py-2 font-semibold">Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {log.map(g => {
                  const stats = safeParse<Record<string, number>>(g.stats ?? '{}', {})
                  return (
                    <tr key={g.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-500 tabular-nums">{g.week}</td>
                      {cols.map(c => <td key={c.label} className="px-2 py-2 text-center tabular-nums text-slate-700">{+c.get(stats).toFixed(1) || 0}</td>)}
                      <td className="px-4 py-2 text-right font-bold tabular-nums" style={{ color: meta.hex }}>{(g.points ?? 0).toFixed(1)}</td>
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
