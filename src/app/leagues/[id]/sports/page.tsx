import { db } from '@/db'
import { leagues, teams, teamRecords, leagueHistory } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { safeParse, orderedSports, sportLabel, sportMeta } from '@/lib/utils'

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
              <Link href={`/leagues/${id}/sports/${s}`} className="p-4 flex items-center gap-3 hover:opacity-95 transition" style={{ background: primary, color: secondary }}>
                {logo
                  ? <span className="w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: 'rgba(255,255,255,.14)' }}><img src={logo} alt="" className="w-[80%] h-[80%] object-contain" /></span>
                  : <span className="w-11 h-11 rounded-xl flex items-center justify-center text-lg font-black flex-shrink-0" style={{ background: secondary, color: primary }}>{s.slice(0, 3)}</span>}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-lg leading-tight truncate">{sportLabel(s, sportNames)}</p>
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
                          ? <img src={t.altLogo || t.logo!} alt="" className="w-5 h-5 rounded object-contain flex-shrink-0" style={{ background: t.primary ?? '#f1f5f9' }} />
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
