import { db } from '@/db'
import { teams, leagues, teamRecords } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import Link from 'next/link'
import { seasonRoster, seasonBranding } from '@/lib/seasons'
import { orderedSports, safeParse } from '@/lib/utils'

// Read-only historical roster for a franchise in a past season (server component).
export default async function SeasonRoster({ teamId, season }: { teamId: string; season: string }) {
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1)
  if (!team) return <div className="p-8 text-slate-400">Team not found.</div>
  const [league] = await db.select().from(leagues).where(eq(leagues.id, team.leagueId)).limit(1)
  const isCurrent = league?.season === season

  const branding = (await seasonBranding(team.leagueId, season))[teamId]
  const { players, isSnapshot } = await seasonRoster(team.leagueId, teamId, season)
  const recs = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, team.leagueId), eq(teamRecords.season, season), eq(teamRecords.teamId, teamId)))

  const sports = orderedSports(safeParse<string[]>(league?.sportsEnabled, []), league?.seasonStart)
  const bySport: Record<string, typeof players> = {}
  for (const p of players) (bySport[p.sport] ??= []).push(p)

  const name = branding?.name ?? team.name
  const primary = branding?.primaryColor ?? team.primaryColor ?? '#0f172a'
  const secondary = branding?.secondaryColor ?? team.secondaryColor ?? '#ffffff'
  const logo = branding?.logo ?? team.logo
  const abbr = branding?.abbreviation ?? team.abbreviation ?? '?'

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <Link href={`/leagues/${team.leagueId}/teams${isCurrent ? '' : `?season=${season}`}`} className="text-sm text-slate-500 hover:underline">← Back to {season} teams</Link>

      <div className="rounded-xl mt-3 mb-4 p-4 flex items-center gap-3" style={{ background: primary, color: secondary }}>
        {logo
          ? <img src={logo} alt="" className="w-14 h-14 object-contain bg-white/10 rounded-lg" />
          : <span className="w-14 h-14 rounded-lg flex items-center justify-center font-bold" style={{ background: secondary, color: primary }}>{abbr.slice(0, 3).toUpperCase()}</span>}
        <div>
          <div className="font-bold text-lg">{name}</div>
          <div className="text-xs opacity-80">📅 {season} roster {isSnapshot ? '· archived final roster' : '· live (not yet archived)'}</div>
        </div>
      </div>

      {recs.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {recs.map(r => (
            <span key={r.id} className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-600">{r.sport}: {r.wins}-{r.losses}{r.ties ? `-${r.ties}` : ''}{r.isChampion ? ' 🏆' : ''}</span>
          ))}
        </div>
      )}

      {sports.filter(s => bySport[s]?.length).map(s => (
        <div key={s} className="rounded-xl border border-slate-200 bg-white mb-3 overflow-hidden">
          <div className="px-4 py-2 font-semibold text-slate-700 border-b border-slate-100 bg-slate-50/60">{s} <span className="text-xs font-normal text-slate-400">· {bySport[s].length} players</span></div>
          <div className="divide-y divide-slate-50">
            {bySport[s].sort((a, b) => a.slot.localeCompare(b.slot)).map((p, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-14 text-xs font-medium text-slate-400">{p.slot}</span>
                <span className="flex-1 text-slate-800 truncate">{p.name}</span>
                <span className="text-xs text-slate-400">{p.position}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {!players.length && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400 text-sm">No roster recorded for this season.</div>}
    </div>
  )
}
