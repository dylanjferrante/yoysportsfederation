import { db } from '@/db'
import { leagues, teams, teamRecords, leagueHistory, matchups } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { sportMeta, safeParse } from '@/lib/utils'
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
  const franchises = await db.select().from(teams).where(eq(teams.leagueId, id))
  const nameOf = (tid: string | null) => franchises.find(f => f.id === tid)?.name ?? '—'

  const history = await db.select().from(leagueHistory).where(eq(leagueHistory.leagueId, id))
  const records = await db.select().from(teamRecords).where(eq(teamRecords.leagueId, id))
  const allMatchups = await db.select({ sport: matchups.sport, homeTeamId: matchups.homeTeamId, awayTeamId: matchups.awayTeamId, homeScore: matchups.homeScore, awayScore: matchups.awayScore, isComplete: matchups.isComplete }).from(matchups).where(eq(matchups.leagueId, id)).limit(5000)

  const seasons = [...new Set(history.map(h => h.season))].sort().reverse()

  // All-time franchise aggregates.
  const allTime = franchises.map(f => {
    const recs = records.filter(r => r.teamId === f.id)
    const wins = recs.reduce((s, r) => s + (r.wins ?? 0), 0)
    const losses = recs.reduce((s, r) => s + (r.losses ?? 0), 0)
    const sportTitles = history.filter(h => h.championTeamId === f.id && h.scope !== 'OVERALL').length
    const fedTitles = history.filter(h => h.championTeamId === f.id && h.scope === 'OVERALL').length
    return { team: f, wins, losses, sportTitles, fedTitles }
  }).sort((a, b) => b.fedTitles - a.fedTitles || b.sportTitles - a.sportTitles || b.wins - a.wins)

  const championOf = (season: string, scope: string) =>
    history.find(h => h.season === season && h.scope === scope)?.championTeamId ?? null

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Link href={`/leagues/${id}`} className="btn-ghost text-slate-500">← Back</Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">History & Records</h1>
          <p className="text-sm text-slate-500">{league.name}</p>
        </div>
      </div>

      {/* Federation champions */}
      <div className="card mb-6">
        <div className="card-header"><h2 className="font-semibold text-slate-900">🏆 Federation Champions</h2></div>
        <div className="divide-y divide-slate-50">
          {seasons.length === 0 && <p className="px-6 py-4 text-slate-400 text-sm">No completed seasons yet.</p>}
          {seasons.map(season => (
            <div key={season} className="px-6 py-3 flex items-center justify-between">
              <span className="text-sm text-slate-500">{season}</span>
              <span className="font-semibold text-slate-900">👑 {nameOf(championOf(season, 'OVERALL'))}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Champions by sport */}
      {seasons.length > 0 && (
        <div className="card mb-6 overflow-x-auto">
          <div className="card-header"><h2 className="font-semibold text-slate-900">Champions by Sport</h2></div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-2 font-medium">Season</th>
                {sports.map(s => <th key={s} className="text-left px-3 py-2 font-medium">{sportMeta(s).emoji} {s}</th>)}
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
        <div className="card-header"><h2 className="font-semibold text-slate-900">All-Time Franchise Records</h2></div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2 font-medium">Franchise</th>
              <th className="text-center px-3 py-2 font-medium">All-Time W-L</th>
              <th className="text-center px-3 py-2 font-medium">Sport Titles</th>
              <th className="text-center px-3 py-2 font-medium">Fed Titles</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {allTime.map(({ team, wins, losses, sportTitles, fedTitles }) => (
              <tr key={team.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/teams/${team.id}`} className="font-medium text-slate-900 hover:text-blue-600">{team.name}</Link>
                </td>
                <td className="text-center px-3 py-2 text-slate-700">{wins}-{losses}</td>
                <td className="text-center px-3 py-2 text-slate-700">{sportTitles}</td>
                <td className="text-center px-3 py-2 font-semibold text-amber-600">{fedTitles || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <HeadToHead matchups={allMatchups as any} teams={franchises.map(f => ({ id: f.id, name: f.name, abbreviation: f.abbreviation }))} sportsEnabled={sports} />
      </div>
    </div>
  )
}
