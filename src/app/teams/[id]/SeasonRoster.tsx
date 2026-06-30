import { db } from '@/db'
import { teams, leagues, teamRecords } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import Link from 'next/link'
import { seasonRosterWithStats, seasonBranding } from '@/lib/seasons'
import SeasonRosterTable from './SeasonRosterTable'

export default async function SeasonRoster({ teamId, season }: { teamId: string; season: string }) {
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1)
  if (!team) return <div className="p-8 text-slate-400">Team not found.</div>
  const [league] = await db.select().from(leagues).where(eq(leagues.id, team.leagueId)).limit(1)
  const isCurrent = league?.season === season

  const branding = (await seasonBranding(team.leagueId, season))[teamId]
  const { players, isSnapshot } = await seasonRosterWithStats(team.leagueId, teamId, season)
  const recs = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, team.leagueId), eq(teamRecords.season, season), eq(teamRecords.teamId, teamId)))

  const name = branding?.name ?? team.name
  const primary = branding?.primaryColor ?? team.primaryColor ?? '#0f172a'
  const secondary = branding?.secondaryColor ?? team.secondaryColor ?? '#ffffff'
  const logo = branding?.logo ?? team.logo
  const abbr = branding?.abbreviation ?? team.abbreviation ?? '?'

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Link href={`/leagues/${team.leagueId}/teams${isCurrent ? '' : `?season=${season}`}`} className="text-sm text-slate-500 hover:underline">← Back to {season} teams</Link>

      <div className="rounded-2xl p-5 mt-3 mb-6 flex items-center gap-4 flex-wrap" style={{ background: primary || '#0f172a', color: secondary || '#ffffff' }}>
        {logo
          ? <img src={logo} alt="" className="w-16 h-16 object-contain bg-white/10" />
          : <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black" style={{ backgroundColor: secondary, color: primary }}>{abbr.slice(0, 4).toUpperCase()}</div>}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-black">{name}</h1>
          <p className="text-sm opacity-80">📅 {season} · {players.length} players · {isSnapshot ? 'archived final roster' : 'live (not yet archived)'}</p>
        </div>
      </div>

      {recs.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-5">
          {recs.map(r => (
            <span key={r.id} className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-medium">{r.sport}: {r.wins}-{r.losses}{r.ties ? `-${r.ties}` : ''}{r.finishPosition ? ` · #${r.finishPosition}` : ''}{r.isChampion ? ' 🏆' : ''}</span>
          ))}
        </div>
      )}

      <SeasonRosterTable players={players} season={season} />
    </div>
  )
}
