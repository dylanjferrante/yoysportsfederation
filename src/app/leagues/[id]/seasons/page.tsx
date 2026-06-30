import { db } from '@/db'
import { leagues, teamRecords, leagueHistory } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { safeParse } from '@/lib/utils'
import { seasonBranding } from '@/lib/seasons'
import { computeFederationStandings, defaultFederationScoring, type FederationScoring } from '@/lib/federation'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select({ name: leagues.name }).from(leagues).where(eq(leagues.id, id)).limit(1)
  return { title: `${league?.name ?? 'League'} · Seasons` }
}

function TeamLogo({ logo, name, abbr, color, bg }: { logo: string | null; name: string; abbr: string; color: string | null; bg: number }) {
  if (logo) return <img src={logo} alt={name} className={`w-10 h-10 rounded-lg object-contain ${bg ? 'p-0.5' : ''}`} style={bg ? { background: color ?? '#0f172a' } : undefined} />
  return <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: color ?? '#0f172a' }}>{(abbr || name || '?').slice(0, 3).toUpperCase()}</div>
}

export default async function SeasonsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ season?: string }> }) {
  const { id } = await params
  const sp = await searchParams
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()

  const records = await db.select().from(teamRecords).where(eq(teamRecords.leagueId, id))
  const history = await db.select().from(leagueHistory).where(eq(leagueHistory.leagueId, id))
  const seasons = [...new Set([league.season, ...records.map(r => r.season), ...history.map(h => h.season)])].sort().reverse()
  const season = sp.season && seasons.includes(sp.season) ? sp.season : league.season
  const isCurrent = season === league.season

  const branding = await seasonBranding(id, season)
  const seasonRecords = records.filter(r => r.season === season)
  const seasonTitles = history.filter(h => h.season === season)
  const fedChampId = seasonTitles.find(h => h.scope === 'OVERALL')?.championTeamId ?? null

  const byTeam: Record<string, { w: number; l: number; titles: string[] }> = {}
  for (const r of seasonRecords) {
    const e = (byTeam[r.teamId] ??= { w: 0, l: 0, titles: [] })
    e.w += r.wins ?? 0; e.l += r.losses ?? 0
  }
  for (const t of seasonTitles) {
    if (!t.championTeamId || t.scope === 'OVERALL') continue
    ;(byTeam[t.championTeamId] ??= { w: 0, l: 0, titles: [] }).titles.push(t.scope)
  }

  const sportsEnabled = safeParse<string[]>(league.sportsEnabled, [])
  const fs = safeParse<FederationScoring | null>(league.federationScoring, null) ?? defaultFederationScoring(league.maxTeams ?? 12, sportsEnabled)
  const fedIncluded = fs.includedSports?.length ? fs.includedSports : sportsEnabled
  const fedStandings = computeFederationStandings(
    Object.keys(branding).map(tid => ({ id: tid })),
    seasonRecords.map(r => ({ teamId: r.teamId, sport: r.sport, finishPosition: r.finishPosition, isChampion: !!r.isChampion })),
    fs, fedIncluded,
  )
  const fedPts: Record<string, number> = Object.fromEntries(fedStandings.map(s => [s.team.id, s.total]))

  const teamIds = Object.keys(byTeam).length ? Object.keys(byTeam) : Object.keys(branding)
  teamIds.sort((a, b) => (a === fedChampId ? -1 : b === fedChampId ? 1 : 0) || (fedPts[b] ?? 0) - (fedPts[a] ?? 0) || (byTeam[b]?.w ?? 0) - (byTeam[a]?.w ?? 0))

  return (
    <div className="max-w-4xl mx-auto pb-16">
      <h1 className="text-xl font-bold text-slate-900 mb-1">📅 Seasons</h1>
      <p className="text-sm text-slate-500 mb-4">Browse past seasons. Logos and names shown are the ones used <b>during that season</b>.</p>

      <div className="flex gap-1 flex-wrap mb-5">
        {seasons.map(s => (
          <Link key={s} href={`/leagues/${id}/seasons?season=${s}`} scroll={false}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${s === season ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {s}{s === league.season ? ' · current' : ''}
          </Link>
        ))}
      </div>

      {!isCurrent && (
        <div className="mb-4">
          <Link href={`/leagues/${id}?season=${season}`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-900 text-white">
            Open the full {season} league view →
          </Link>
          <span className="text-xs text-slate-400 ml-2">browse that season's standings, scores & playoffs</span>
        </div>
      )}

      {fedChampId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4 flex items-center gap-3">
          <span className="text-2xl">🏆</span>
          <TeamLogo logo={branding[fedChampId]?.logo ?? null} name={branding[fedChampId]?.name ?? ''} abbr={branding[fedChampId]?.abbreviation ?? ''} color={branding[fedChampId]?.primaryColor ?? null} bg={branding[fedChampId]?.logoBg ?? 0} />
          <div>
            <div className="text-xs text-amber-700 font-medium uppercase tracking-wide">{season} Federation Champion</div>
            <div className="font-bold text-slate-900">{branding[fedChampId]?.name ?? '—'}</div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {teamIds.map(tid => {
          const b = branding[tid]
          const rec = byTeam[tid]
          if (!b) return null
          return (
            <div key={tid} className="flex items-center gap-3 p-3">
              <TeamLogo logo={b.logo} name={b.name} abbr={b.abbreviation} color={b.primaryColor} bg={b.logoBg} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800 flex items-center gap-2">{b.name}{tid === fedChampId && <span className="text-amber-500">🏆</span>}</div>
                {rec && (rec.w + rec.l > 0) ? <div className="text-xs text-slate-400">{rec.w}-{rec.l}</div> : <div className="text-xs text-slate-300">—</div>}
              </div>
              <div className="flex items-center gap-3 justify-end">
                <div className="flex gap-1 flex-wrap justify-end">
                  {rec?.titles.map(s => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">🏆 {s}</span>)}
                </div>
                <div className="text-right w-14 flex-shrink-0">
                  <div className="font-bold text-slate-900 tabular-nums leading-none">{(fedPts[tid] ?? 0).toFixed(0)}</div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">Fed pts</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {isCurrent && <p className="text-xs text-slate-400 mt-3">This is the active season. The commissioner can archive it and start the next from the Commish panel.</p>}
    </div>
  )
}
