import { db } from '@/db'
import { leagues, teams, teamRecords, leagueHistory, matchups } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { safeParse, sportAbbrLabel } from '@/lib/utils'
import { computeFederationStandings } from '@/lib/federation'
import SportChip from '@/components/SportChip'
import HeadToHead from './HeadToHead'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  return { title: `${league?.name ?? 'League'} · History` }
}

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()

  const sports = safeParse<string[]>(league.sportsEnabled, [])
  const champLogos = safeParse<Record<string, string>>(league.championshipLogos, {})
  const champNames = safeParse<Record<string, string>>(league.championshipNames, {})
  const sportAbbr = safeParse<Record<string, string>>(league.sportAbbr, {})
  const divisionLogos = safeParse<Record<string, string>>(league.divisionLogos, {})
  const champColors = safeParse<Record<string, { p?: string; s?: string }>>(league.championshipColors, {})
  const franchises = await db.select().from(teams).where(eq(teams.leagueId, id))
  const nameOf = (tid: string | null) => franchises.find(f => f.id === tid)?.name ?? '—'

  const history = await db.select().from(leagueHistory).where(eq(leagueHistory.leagueId, id))
  const records = await db.select().from(teamRecords).where(eq(teamRecords.leagueId, id))
  const allMatchups = await db.select({ sport: matchups.sport, season: matchups.season, week: matchups.week, homeTeamId: matchups.homeTeamId, awayTeamId: matchups.awayTeamId, homeScore: matchups.homeScore, awayScore: matchups.awayScore, isComplete: matchups.isComplete }).from(matchups).where(eq(matchups.leagueId, id)).limit(5000)

  const seasons = [...new Set(history.map(h => h.season))].sort().reverse()

  // All-time federation points: federation standings recomputed for every season and summed.
  const fedScoring = safeParse<any>(league.federationScoring, { placement: [], championBonus: 0, regularSeasonBonus: 0, includedSports: sports })
  const fedPointsByTeam: Record<string, number> = {}
  const recordSeasons = [...new Set(records.map(r => r.season))]
  for (const season of recordSeasons) {
    const standings = computeFederationStandings(
      franchises.map(f => ({ id: f.id })),
      records.filter(r => r.season === season).map(r => ({ teamId: r.teamId, sport: r.sport, finishPosition: r.finishPosition, isChampion: r.isChampion })),
      fedScoring, fedScoring.includedSports ?? sports,
    )
    for (const row of standings) fedPointsByTeam[row.team.id] = (fedPointsByTeam[row.team.id] ?? 0) + (row.total ?? 0)
  }

  // All-time franchise aggregates.
  const allTime = franchises.map(f => {
    const recs = records.filter(r => r.teamId === f.id)
    const wins = recs.reduce((s, r) => s + (r.wins ?? 0), 0)
    const losses = recs.reduce((s, r) => s + (r.losses ?? 0), 0)
    const sportTitles = history.filter(h => h.championTeamId === f.id && h.scope !== 'OVERALL').length
    const fedTitles = history.filter(h => h.championTeamId === f.id && h.scope === 'OVERALL').length
    return { team: f, wins, losses, sportTitles, fedTitles, fedPoints: fedPointsByTeam[f.id] ?? 0 }
  }).sort((a, b) => b.fedPoints - a.fedPoints || b.fedTitles - a.fedTitles || b.wins - a.wins)

  const championOf = (season: string, scope: string) =>
    history.find(h => h.season === season && h.scope === scope)?.championTeamId ?? null

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-8">History & Records</h1>

      {/* Federation champions — each tile carries the champion club's branding. */}
      <div className="card mb-6 overflow-hidden">
        <div className="card-header flex items-center gap-2">
          {champLogos['FED'] ? <img src={champLogos['FED']} alt="" className="w-7 h-7 object-contain" /> : null}
          <h2 className="font-semibold text-slate-900">{champNames['FED'] || `${league.name} Champions`}</h2>
        </div>
        {seasons.length === 0
          ? <p className="px-6 py-4 text-slate-400 text-sm">No completed seasons yet.</p>
          : (
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,.08)' }}>
              {seasons.map(season => {
                const champId = championOf(season, 'OVERALL')
                const t = franchises.find(f => f.id === champId)
                const primary = t?.primaryColor || '#0f172a'
                const secondary = t?.secondaryColor || '#ffffff'
                const src = t?.altLogo || t?.logo
                return (
                  <div key={season} className="flex items-center gap-3 px-4 py-3" style={{ background: primary, color: secondary }}>
                    {src
                      ? <span className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: t?.logoBg ? primary : 'rgba(255,255,255,.14)' }}><img src={src} alt="" className="w-[80%] h-[80%] object-contain" /></span>
                      : <span className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-black flex-shrink-0" style={{ background: secondary, color: primary }}>{(t?.abbreviation || t?.name || '?').slice(0, 3).toUpperCase()}</span>}
                    <div className="min-w-0 flex-1">
                      {t?.wordmark && t.wordmark.startsWith('http')
                        ? <img src={t.wordmark} alt={t?.name ?? ''} className="h-7 w-auto max-w-[220px] object-contain object-left" />
                        : <span className="font-bold truncate">{t?.wordmark || t?.name || '—'}</span>}
                    </div>
                    <span className="font-black tabular-nums flex-shrink-0" style={{ color: secondary, opacity: .92 }}>{season}</span>
                  </div>
                )
              })}
            </div>
          )}
      </div>

      {/* Champions by sport */}
      {seasons.length > 0 && (
        <div className="card mb-6 overflow-x-auto">
          <div className="card-header"><h2 className="font-semibold text-slate-900">Champions by Sport</h2></div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-2 font-medium">Season</th>
                {sports.map(s => <th key={s} className="text-left px-3 py-2 font-medium"><span className="inline-flex items-center gap-1.5"><SportChip sport={s} logos={divisionLogos} colors={champColors} chip={18} size={12} />{sportAbbrLabel(s, sportAbbr)}</span></th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {seasons.map(season => (
                <tr key={season} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-500">{season}</td>
                  {sports.map(s => <td key={s} className="px-3 py-2 font-medium text-slate-800">{nameOf(championOf(season, s))}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* All-time records */}
      <div className="card overflow-x-auto">
        <div className="card-header"><h2 className="font-semibold text-slate-900">All-Time Club Records</h2></div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2 font-medium">Club</th>
              <th className="text-center px-3 py-2 font-medium">All-Time W-L</th>
              <th className="text-center px-3 py-2 font-medium">Sport Titles</th>
              <th className="text-center px-3 py-2 font-medium">Fed Titles</th>
              <th className="text-center px-3 py-2 font-medium">All-Time Fed Pts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {allTime.map(({ team, wins, losses, sportTitles, fedTitles, fedPoints }) => (
              <tr key={team.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/leagues/${id}/teams/${team.id}`} className="font-medium text-slate-900 hover:text-blue-600">{team.name}</Link>
                </td>
                <td className="text-center px-3 py-2 text-slate-700">{wins}-{losses}</td>
                <td className="text-center px-3 py-2 text-slate-700">{sportTitles}</td>
                <td className="text-center px-3 py-2 font-semibold text-amber-600">{fedTitles || '—'}</td>
                <td className="text-center px-3 py-2 font-bold text-slate-900 tabular-nums">{fedPoints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <HeadToHead matchups={allMatchups as any} teams={franchises.map(f => ({ id: f.id, name: f.name, abbreviation: f.abbreviation }))} sportsEnabled={sports} schedule={safeParse<any[]>(league.sportSchedule, [])} />
      </div>
    </div>
  )
}
