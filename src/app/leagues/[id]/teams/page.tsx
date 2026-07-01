import { db } from '@/db'
import { leagues, teams, teamRecords, users, leagueHistory } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { safeParse, sportAbbrLabel, orderedSports } from '@/lib/utils'
import { viewSeasonOf, seasonBranding } from '@/lib/seasons'
import SportChip from '@/components/SportChip'

export const metadata = { title: 'Clubs' }

type Rec = { teamId: string; sport: string; wins: number; losses: number; ties: number; pointsFor: number; finishPosition: number | null }

export default async function TeamsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ season?: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()
  const { season: viewSeason, isPast } = viewSeasonOf(league, await searchParams)
  const branding = isPast ? await seasonBranding(id, viewSeason) : null

  const franchises = (await db.select({ team: teams, userName: users.name }).from(teams)
    .leftJoin(users, eq(teams.userId, users.id)).where(and(eq(teams.leagueId, id), isPast ? undefined : eq(teams.archived, false))))
    .sort((a, b) => a.team.name.localeCompare(b.team.name, undefined, { sensitivity: 'base' }))
  const recs = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, id), eq(teamRecords.season, viewSeason)))
  const allRecords = await db.select().from(teamRecords).where(eq(teamRecords.leagueId, id))
  const history = await db.select().from(leagueHistory).where(eq(leagueHistory.leagueId, id))

  const sportsEnabled = orderedSports(safeParse<string[]>(league.sportsEnabled, []), league.seasonStart)
  const sportAbbr = safeParse<Record<string, string>>(league.sportAbbr, {})
  const divisionLogos = safeParse<Record<string, string>>(league.divisionLogos, {})
  const championshipColors = safeParse<Record<string, { p?: string; s?: string }>>(league.championshipColors, {})

  const stats: Record<string, { w: number; l: number; t: number; fedTitles: number; sportTitles: number }> = {}
  for (const f of franchises) stats[f.team.id] = { w: 0, l: 0, t: 0, fedTitles: 0, sportTitles: 0 }
  for (const r of allRecords) { const s = stats[r.teamId]; if (!s) continue; s.w += r.wins ?? 0; s.l += r.losses ?? 0; s.t += r.ties ?? 0 }
  for (const h of history) { const s = h.championTeamId ? stats[h.championTeamId] : null; if (!s) continue; if (h.scope === 'OVERALL') s.fedTitles++; else s.sportTitles++ }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Clubs</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {franchises.map(({ team: tRaw, userName }) => {
          const b = branding?.[tRaw.id]
          const t = b ? { ...tRaw, name: b.name, abbreviation: b.abbreviation, logo: b.logo, primaryColor: b.primaryColor, secondaryColor: b.secondaryColor } : tRaw
          const stat = stats[t.id]
          const primary = t.primaryColor || '#0f172a'
          const secondary = t.secondaryColor || '#ffffff'
          const recBySport = Object.fromEntries(recs.filter(r => r.teamId === t.id).map(r => [r.sport, r]))
          return (
            <Link key={t.id} href={`/teams/${t.id}${isPast ? `?season=${viewSeason}` : ''}`} className="card overflow-hidden hover:shadow-md transition">
              <div className="p-3 flex items-center gap-3" style={{ background: primary, color: secondary }}>
                {t.logo
                  ? <img src={t.logo} alt="" className="w-12 h-12 object-contain flex-shrink-0 rounded-md p-1.5" style={{ background: t.logoBg ? primary : 'rgba(255,255,255,.12)' }} />
                  : <span className="w-12 h-12 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: secondary, color: primary }}>{(t.abbreviation || t.name || '?').slice(0, 4).toUpperCase()}</span>}
                <div className="min-w-0">
                  {t.wordmark && t.wordmark.startsWith('http')
                    ? <img src={t.wordmark} alt={t.name} className="h-9 w-auto max-w-[220px] object-contain object-left" />
                    : <p className="font-bold leading-tight truncate">{t.wordmark || t.name}</p>}
                  <p className="text-xs font-bold opacity-95 truncate">{userName ?? '—'} · {t.abbreviation}</p>
                </div>
              </div>
              <div className="px-3 py-2 flex items-center gap-3 text-xs border-b border-slate-100 bg-slate-50/60">
                <span title="Federation championships">{stat.fedTitles} Fed</span>
                <span title="Sport championships">{stat.sportTitles} Sport</span>
                <span className="ml-auto text-slate-500">All-time {stat.w}-{stat.l}{stat.t ? `-${stat.t}` : ''}</span>
              </div>
              <div className="px-3 py-2 space-y-1">
                {sportsEnabled.map(s => {
                  const r = recBySport[s] as Rec | undefined
                  return (
                    <div key={s} className="flex items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold w-16"><SportChip sport={s} logos={divisionLogos} colors={championshipColors} chip={18} size={12} />{sportAbbrLabel(s, sportAbbr)}</span>
                      {r ? (
                        <>
                          <span className="text-slate-700 w-16">{r.wins}-{r.losses}{r.ties ? `-${r.ties}` : ''}</span>
                          <span className="text-slate-400 w-20">{(r.pointsFor ?? 0).toFixed(0)} pts</span>
                          <span className="text-slate-500 ml-auto">{r.finishPosition ? `#${r.finishPosition}` : '—'}</span>
                        </>
                      ) : <span className="text-slate-300">—</span>}
                    </div>
                  )
                })}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
