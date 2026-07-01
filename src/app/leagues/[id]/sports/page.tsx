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

  const teamRows = await db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.leagueId, id))
  const nameOf = (tid: string | null) => (tid && teamRows.find(t => t.id === tid)?.name) || '—'
  const recs = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, id), eq(teamRecords.season, league.season)))
  const history = await db.select().from(leagueHistory).where(eq(leagueHistory.leagueId, id))

  const leaderOf = (sp: string) => recs.filter(r => r.sport === sp)
    .sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0) || (b.pointsFor ?? 0) - (a.pointsFor ?? 0))[0]
  const lastChamp = (sp: string) => history.filter(h => h.scope === sp).sort((a, b) => b.season.localeCompare(a.season))[0]

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Leagues</h1>
      <p className="text-sm text-slate-500 mb-6">Each sport runs as its own league inside the federation. Open one for its standings, games, history and leaders.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sports.map(s => {
          const primary = champColors[s]?.p || sportMeta(s).hex
          const secondary = champColors[s]?.s || '#ffffff'
          const logo = divisionLogos[s] || divisionLogosAlt[s]
          const leader = leaderOf(s)
          const champ = lastChamp(s)
          return (
            <Link key={s} href={`/leagues/${id}/sports/${s}`} className="card overflow-hidden hover:shadow-md transition">
              <div className="p-4 flex items-center gap-3" style={{ background: primary, color: secondary }}>
                {logo
                  ? <span className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: 'rgba(255,255,255,.14)' }}><img src={logo} alt="" className="w-[80%] h-[80%] object-contain" /></span>
                  : <span className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black flex-shrink-0" style={{ background: secondary, color: primary }}>{s.slice(0, 3)}</span>}
                <div className="min-w-0">
                  <p className="font-bold text-lg leading-tight truncate">{sportLabel(s, sportNames)}</p>
                  <p className="text-xs font-medium opacity-90 truncate">{leader ? `${nameOf(leader.teamId)} leads` : 'Season league'}</p>
                </div>
              </div>
              <div className="px-4 py-2 text-xs text-slate-500 flex items-center gap-3 bg-slate-50/60">
                <span>{recs.filter(r => r.sport === s).length} clubs</span>
                {champ && <span className="ml-auto">Last champion: <span className="font-semibold text-slate-700">{nameOf(champ.championTeamId)}</span></span>}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
