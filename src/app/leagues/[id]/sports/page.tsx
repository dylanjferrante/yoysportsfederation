import { db } from '@/db'
import { leagues, teams, teamRecords, leagueHistory } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { safeParse, orderedSports, sportLabel, sportMeta } from '@/lib/utils'
import { YSF_LEAGUE_ID, YSF_LEAGUES, YSF_ART, U } from '@/lib/ysf'

export const metadata = { title: 'Leagues' }

export default async function SportsHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()

  const sports = orderedSports(safeParse<string[]>(league.sportsEnabled, []), league.seasonStart)
  const sportNames = safeParse<Record<string, string>>(league.sportNames, {})
  const divisionLogos = safeParse<Record<string, string>>(league.divisionLogos, {})
  const divisionLogosAlt = safeParse<Record<string, string>>(league.divisionLogosAlt, {})
  const champColors = safeParse<Record<string, { p?: string; s?: string }>>(league.championshipColors, {})

  const teamRows = await db.select({ id: teams.id, name: teams.name, abbr: teams.abbreviation, logo: teams.logo, altLogo: teams.altLogo, primary: teams.primaryColor }).from(teams).where(eq(teams.leagueId, id))
  const teamById = new Map(teamRows.map(t => [t.id, t]))
  const recs = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, id), eq(teamRecords.season, league.season)))
  const history = await db.select().from(leagueHistory).where(eq(leagueHistory.leagueId, id))

  // Full standings for a sport: every club, ordered by wins then points-for.
  const standingsOf = (sp: string) => recs.filter(r => r.sport === sp)
    .sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0) || (b.pointsFor ?? 0) - (a.pointsFor ?? 0))
  const lastChamp = (sp: string) => history.filter(h => h.scope === sp).sort((a, b) => b.season.localeCompare(a.season))[0]

  if (id === YSF_LEAGUE_ID) {
    const fmtPF = (x: number) => x.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    return (
      <div className="flex flex-col gap-5 pb-8 w-full min-w-0">
        <div className="border-b-2 border-black pb-3.5">
          <div className="eyebrow">{U(`ySF · ${(league.season ?? '').replace('-', '–')}`)}</div>
          <h1 className="disp text-[40px] sm:text-[64px] font-extrabold leading-[.85] mt-1.5">LEAGUES</h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {YSF_LEAGUES.filter(L => sports.includes(L.sport)).map(L => {
            const standings = standingsOf(L.sport)
            const champ = lastChamp(L.sport), ch = champ ? teamById.get(champ.championTeamId ?? '') : null
            return (
              <section key={L.sport} className="card overflow-hidden">
                <Link href={`/leagues/${id}/sports/${L.sport}`} className="flex items-center gap-3 px-4 py-3 text-white hover:opacity-95" style={{ background: L.color }}>
                  <img src={YSF_ART.leagueSymbol(L.key, 'color')} alt="" className="w-11 h-11 object-contain flex-none" />
                  <div className="min-w-0 flex-1">
                    <div className="disp text-[24px] font-extrabold leading-none"><span className="ysf-case">{L.code}</span></div>
                    <div className="ui text-[11px] opacity-90 mt-1 truncate">{U(L.name)}{ch ? <> · {U('Champion')} {ch.abbr}</> : null}</div>
                  </div>
                  <span className="ui text-[12px] font-bold flex-none">OPEN →</span>
                </Link>
                <div className="overflow-x-auto">
                  <table className="w-full text-[14px]">
                    <thead>
                      <tr className="ui text-[11px] text-ink-500 border-b border-ink-100">
                        <th className="text-left font-bold px-3 py-2 w-10">RK</th>
                        <th className="text-left font-bold py-2">CLUB</th>
                        <th className="text-right font-bold px-2 py-2">W</th>
                        <th className="text-right font-bold px-2 py-2">L</th>
                        {standings.some(r => r.ties) && <th className="text-right font-bold px-2 py-2">T</th>}
                        <th className="text-right font-bold px-3 py-2">PF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((r, i) => {
                        const t = teamById.get(r.teamId)
                        return (
                          <tr key={r.teamId} className="border-b border-ink-50 last:border-0">
                            <td className="px-3 py-2 tabular-nums text-ink-500">{i + 1}</td>
                            <td className="py-2">
                              <Link href={`/leagues/${id}/teams/${r.teamId}`} className="flex items-center gap-2 min-w-0 hover:underline">
                                {t?.logo && <img src={t.logo} alt="" className="w-6 h-6 object-contain flex-none" />}
                                <span className="font-semibold truncate">{t?.name ?? '—'}</span>
                              </Link>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums font-bold">{r.wins ?? 0}</td>
                            <td className="px-2 py-2 text-right tabular-nums font-bold">{r.losses ?? 0}</td>
                            {standings.some(x => x.ties) && <td className="px-2 py-2 text-right tabular-nums">{r.ties ?? 0}</td>}
                            <td className="px-3 py-2 text-right tabular-nums">{fmtPF(r.pointsFor ?? 0)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Leagues</h1>
      <p className="text-sm text-slate-500 mb-6">Each sport runs as its own league inside the federation — full standings below; open one for games, history and leaders.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sports.map(s => {
          const primary = champColors[s]?.p || sportMeta(s).hex
          const secondary = champColors[s]?.s || '#ffffff'
          const logo = divisionLogos[s] || divisionLogosAlt[s]
          const standings = standingsOf(s)
          const champ = lastChamp(s)
          return (
            <div key={s} className="card overflow-hidden">
              <Link href={`/leagues/${id}/sports/${s}`} className="p-4 flex items-center gap-3 hover:opacity-95 transition" style={{ background: primary, color: '#fff' }}>
                {logo
                  ? <span className="w-11 h-11 inline-flex items-center justify-center flex-shrink-0"><img src={logo} alt="" className="w-full h-full object-contain" /></span>
                  : <span className="w-11 h-11 rounded-xl flex items-center justify-center text-lg font-black flex-shrink-0" style={{ background: secondary, color: primary }}>{s.slice(0, 3)}</span>}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-lg leading-tight truncate"><span className="ysf-case">{sportLabel(s, sportNames)}</span></p>
                  <p className="text-xs font-medium opacity-90 truncate">{standings.length} clubs{champ ? ` · last champ ${teamById.get(champ.championTeamId ?? '')?.abbr ?? '—'}` : ''}</p>
                </div>
                <span className="text-xs font-semibold opacity-90 flex-shrink-0">Open →</span>
              </Link>

              {/* Full standings: every club's record in this sport. */}
              <div className="grid grid-cols-[1.5rem_1fr_auto_auto] items-center gap-x-2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <span className="text-right">#</span><span>Club</span><span className="text-right pr-1">PF</span><span className="text-right">W-L</span>
              </div>
              <div className="divide-y divide-slate-50">
                {standings.map((r, i) => {
                  const t = teamById.get(r.teamId)
                  return (
                    <div key={r.teamId} className="grid grid-cols-[1.5rem_1fr_auto_auto] items-center gap-x-2 px-3 py-1.5 text-sm">
                      <span className="text-right text-xs text-slate-400 tabular-nums">{i + 1}</span>
                      <span className="flex items-center gap-2 min-w-0">
                        {t?.altLogo || t?.logo
                          ? <img src={t.logo || t.altLogo!} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
                          : <span className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0" style={{ background: t?.primary ?? '#0f172a' }}>{(t?.abbr || t?.name || '?').slice(0, 2).toUpperCase()}</span>}
                        <span className="truncate text-slate-800">{t?.name ?? '—'}</span>
                      </span>
                      <span className="text-right text-xs text-slate-400 tabular-nums pr-1">{Math.round(r.pointsFor ?? 0)}</span>
                      <span className="text-right font-semibold text-slate-900 tabular-nums">{r.wins ?? 0}-{r.losses ?? 0}{r.ties ? `-${r.ties}` : ''}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
