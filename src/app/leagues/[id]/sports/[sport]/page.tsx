import { db } from '@/db'
import { leagues, teams, teamRecords, matchups, leagueHistory } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { safeParse, sportLabel, sportMeta } from '@/lib/utils'

export async function generateMetadata({ params }: { params: Promise<{ id: string; sport: string }> }) {
  const { sport } = await params
  return { title: `${sport.toUpperCase()} · League` }
}

function Logo({ team, size }: { team: any; size: number }) {
  const src = team?.altLogo || team?.logo
  const primary = team?.primaryColor || '#0f172a'
  const secondary = team?.secondaryColor || '#fff'
  return src
    ? <span className="rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ width: size, height: size, background: team?.logoBg ? primary : '#f1f5f9' }}><img src={src} alt="" style={{ width: '80%', height: '80%', objectFit: 'contain' }} /></span>
    : <span className="rounded-lg flex items-center justify-center flex-shrink-0 font-bold" style={{ width: size, height: size, background: primary, color: secondary, fontSize: Math.round(size * 0.34) }}>{(team?.abbreviation || team?.name || '?').slice(0, 3).toUpperCase()}</span>
}

export default async function SportLeaguePage({ params }: { params: Promise<{ id: string; sport: string }> }) {
  const { id, sport: raw } = await params
  const sport = raw.toUpperCase()
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()
  const sportsEnabled = safeParse<string[]>(league.sportsEnabled, [])
  if (!sportsEnabled.includes(sport)) notFound()

  const sportNames = safeParse<Record<string, string>>(league.sportNames, {})
  const divisionLogos = safeParse<Record<string, string>>(league.divisionLogos, {})
  const divisionLogosAlt = safeParse<Record<string, string>>(league.divisionLogosAlt, {})
  const champColors = safeParse<Record<string, { p?: string; s?: string }>>(league.championshipColors, {})
  const champNames = safeParse<Record<string, string>>(league.championshipNames, {})
  const primary = champColors[sport]?.p || sportMeta(sport).hex
  const secondary = champColors[sport]?.s || '#ffffff'
  const logo = divisionLogos[sport] || divisionLogosAlt[sport]
  const playoffTeams = league.playoffTeams ?? 6

  const teamRows = await db.select().from(teams).where(eq(teams.leagueId, id))
  const tById = new Map(teamRows.map(t => [t.id, t]))
  const nameOf = (tid: string | null) => (tid && tById.get(tid)?.name) || '—'

  const recs = (await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, id), eq(teamRecords.season, league.season), eq(teamRecords.sport, sport))))
    .sort((a, b) => (a.finishPosition ?? 99) - (b.finishPosition ?? 99) || (b.wins ?? 0) - (a.wins ?? 0) || (b.pointsFor ?? 0) - (a.pointsFor ?? 0))
  const ms = await db.select().from(matchups).where(and(eq(matchups.leagueId, id), eq(matchups.season, league.season), eq(matchups.sport, sport)))
  const history = (await db.select().from(leagueHistory).where(and(eq(leagueHistory.leagueId, id), eq(leagueHistory.scope, sport)))).sort((a, b) => b.season.localeCompare(a.season))

  const incomplete = ms.filter(m => !m.isComplete && m.awayTeamId)
  const complete = ms.filter(m => m.isComplete && m.awayTeamId)
  const curWeek = incomplete.length ? Math.min(...incomplete.map(m => m.week)) : (complete.length ? Math.max(...complete.map(m => m.week)) : 0)
  const weekGames = ms.filter(m => m.week === curWeek && m.awayTeamId)

  const topScorer = [...recs].sort((a, b) => (b.pointsFor ?? 0) - (a.pointsFor ?? 0))[0]
  const bestRec = recs[0]
  const highWeek = complete.reduce((best, m) => Math.max(best, m.homeScore ?? 0, m.awayScore ?? 0), 0)

  const Leader = ({ label, name, value }: { label: string; name: string; value: string }) => (
    <div className="card p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
      <p className="font-bold text-slate-900 truncate">{name}</p>
      <p className="text-sm tabular-nums" style={{ color: primary }}>{value}</p>
    </div>
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Link href={`/leagues/${id}/sports`} className="btn-ghost text-slate-500">← Leagues</Link>
      </div>

      {/* Sport header tile */}
      <div className="card overflow-hidden mb-5">
        <div className="p-4 flex items-center gap-3" style={{ background: primary, color: secondary }}>
          {logo
            ? <span className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: 'rgba(255,255,255,.14)' }}><img src={logo} alt="" className="w-[80%] h-[80%] object-contain" /></span>
            : <span className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-black flex-shrink-0" style={{ background: secondary, color: primary }}>{sport.slice(0, 3)}</span>}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight truncate">{sportLabel(sport, sportNames)}</h1>
            <p className="text-sm font-medium opacity-90">{league.season} · {recs.length} clubs{champNames[sport] ? ` · ${champNames[sport]}` : ''}</p>
          </div>
        </div>
      </div>

      {/* Leaders */}
      {recs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <Leader label="Best record" name={nameOf(bestRec?.teamId)} value={`${bestRec?.wins ?? 0}-${bestRec?.losses ?? 0}${bestRec?.ties ? `-${bestRec.ties}` : ''}`} />
          <Leader label="Most points" name={nameOf(topScorer?.teamId)} value={`${(topScorer?.pointsFor ?? 0).toFixed(0)} PF`} />
          <Leader label="Top single week" name={sportLabel(sport, sportNames)} value={highWeek ? highWeek.toFixed(1) : '—'} />
        </div>
      )}

      {/* Games */}
      <div className="card mb-6 overflow-hidden">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Games</h2>
          {curWeek > 0 && <span className="text-xs text-slate-400">Week {curWeek}</span>}
        </div>
        {weekGames.length === 0
          ? <p className="px-4 py-6 text-sm text-slate-400">No games scheduled.</p>
          : (
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 divide-slate-50">
              {weekGames.map(g => {
                const home = tById.get(g.homeTeamId), away = g.awayTeamId ? tById.get(g.awayTeamId) : null
                const homeWin = g.isComplete && (g.homeScore ?? 0) >= (g.awayScore ?? 0)
                return (
                  <Link key={g.id} href={`/leagues/${id}/matchup/${g.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-slate-50 border-b border-slate-50">
                    {[{ t: away, s: g.awayScore, win: g.isComplete && !homeWin }, { t: home, s: g.homeScore, win: homeWin }].map((row, i) => (
                      <div key={i} className={`flex items-center gap-2 ${row.win ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                        <Logo team={row.t} size={22} />
                        <span className="flex-1 truncate text-sm">{row.t?.name ?? 'BYE'}</span>
                        <span className="tabular-nums text-sm">{g.isComplete ? (row.s ?? 0).toFixed(1) : '—'}</span>
                      </div>
                    ))}
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">{g.isComplete ? 'Final' : 'Upcoming'}</span>
                  </Link>
                )
              })}
            </div>
          )}
      </div>

      {/* Standings */}
      <div className="card mb-6 overflow-x-auto">
        <div className="card-header"><h2 className="font-semibold text-slate-900">Standings</h2></div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2 font-medium">#</th>
              <th className="text-left px-2 py-2 font-medium">Club</th>
              <th className="text-center px-3 py-2 font-medium">W-L</th>
              <th className="text-center px-3 py-2 font-medium">PF</th>
              <th className="text-center px-3 py-2 font-medium">PA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {recs.map((r, i) => {
              const t = tById.get(r.teamId)
              return (
                <tr key={r.teamId} className={i < playoffTeams ? 'bg-emerald-50/30' : ''}>
                  <td className="px-4 py-2 text-slate-400 font-medium">{i + 1}</td>
                  <td className="px-2 py-2">
                    <Link href={`/leagues/${id}/teams/${r.teamId}`} className="flex items-center gap-2 group">
                      <Logo team={t} size={24} />
                      <span className="font-medium text-slate-900 group-hover:text-blue-600 truncate">{t?.name ?? '—'}</span>
                    </Link>
                  </td>
                  <td className="text-center px-3 py-2 tabular-nums text-slate-700">{r.wins ?? 0}-{r.losses ?? 0}{r.ties ? `-${r.ties}` : ''}</td>
                  <td className="text-center px-3 py-2 tabular-nums text-slate-600">{(r.pointsFor ?? 0).toFixed(0)}</td>
                  <td className="text-center px-3 py-2 tabular-nums text-slate-400">{(r.pointsAgainst ?? 0).toFixed(0)}</td>
                </tr>
              )
            })}
            {recs.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-sm">No standings yet.</td></tr>}
          </tbody>
        </table>
        {recs.length > 0 && <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-50">Top {playoffTeams} make the playoffs (green).</p>}
      </div>

      {/* History */}
      <div className="card overflow-hidden">
        <div className="card-header"><h2 className="font-semibold text-slate-900">Champions</h2></div>
        {history.length === 0
          ? <p className="px-4 py-6 text-sm text-slate-400">No champions crowned yet.</p>
          : (
            <div className="divide-y divide-slate-50">
              {history.map(h => {
                const t = tById.get(h.championTeamId ?? '')
                const cp = t?.primaryColor || '#0f172a', cs = t?.secondaryColor || '#fff'
                return (
                  <div key={h.id} className="flex items-center gap-3 px-4 py-3" style={{ background: cp, color: cs }}>
                    <Logo team={t} size={32} />
                    <span className="font-bold flex-1 truncate">{nameOf(h.championTeamId)}</span>
                    <span className="font-black tabular-nums" style={{ color: cs, opacity: .92 }}>{h.season}</span>
                  </div>
                )
              })}
            </div>
          )}
      </div>
    </div>
  )
}
