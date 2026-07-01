import { db } from '@/db'
import { leagues, teams, matchups } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { computePowerRankings } from '@/lib/power'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  return { title: `${league?.name ?? 'League'} · Power Rankings` }
}

export default async function PowerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()

  const clubs = await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation, logo: teams.logo, altLogo: teams.altLogo, primaryColor: teams.primaryColor, secondaryColor: teams.secondaryColor, logoBg: teams.logoBg })
    .from(teams).where(and(eq(teams.leagueId, id), eq(teams.archived, false)))
  const ms = await db.select({ sport: matchups.sport, week: matchups.week, homeTeamId: matchups.homeTeamId, awayTeamId: matchups.awayTeamId, homeScore: matchups.homeScore, awayScore: matchups.awayScore, isComplete: matchups.isComplete })
    .from(matchups).where(and(eq(matchups.leagueId, id), eq(matchups.season, league.season)))

  const byId = new Map(clubs.map(c => [c.id, c]))
  const rows = computePowerRankings(ms, clubs.map(c => c.id))
  const played = rows.some(r => r.wins + r.losses > 0)
  const maxScore = Math.max(1, ...rows.map(r => r.score))

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Power Rankings</h1>
        <p className="text-slate-500 text-sm">Every club ranked across all sports — win rate, recent form, and scoring. Movement is since last week.</p>
      </div>

      {!played ? (
        <div className="card p-10 text-center text-slate-400 text-sm">No completed games yet this season.</div>
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden">
          {rows.map(r => {
            const c = byId.get(r.teamId)
            if (!c) return null
            const primary = c.primaryColor || '#0f172a'
            const secondary = c.secondaryColor || '#ffffff'
            const src = c.altLogo || c.logo
            return (
              <Link key={r.teamId} href={`/leagues/${id}/teams/${r.teamId}`} className="flex items-center gap-3 px-3 sm:px-4 py-3 hover:bg-slate-50">
                <span className="w-6 text-center text-lg font-black text-slate-900 tabular-nums flex-shrink-0">{r.rank}</span>
                <span className="w-7 flex-shrink-0 text-center">
                  {r.delta > 0 ? <span className="text-emerald-600 text-xs font-bold">▲{r.delta}</span>
                    : r.delta < 0 ? <span className="text-red-500 text-xs font-bold">▼{Math.abs(r.delta)}</span>
                    : <span className="text-slate-300 text-xs">–</span>}
                </span>
                {src
                  ? <span className="w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: c.logoBg ? primary : '#f1f5f9' }}><img src={src} alt="" className="w-[82%] h-[82%] object-contain" /></span>
                  : <span className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-black flex-shrink-0" style={{ background: primary, color: secondary }}>{(c.abbreviation || c.name || '?').slice(0, 3).toUpperCase()}</span>}
                <span className="min-w-0 flex-1">
                  <span className="font-bold text-slate-900 truncate block leading-tight">{c.name}</span>
                  <span className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-400 tabular-nums">{r.wins}-{r.losses} · {r.pointsFor.toFixed(0)} PF</span>
                    <span className="hidden sm:flex items-center gap-0.5">
                      {r.form.map((f, i) => <span key={i} className={`w-3.5 h-3.5 rounded-[3px] text-[8px] font-bold flex items-center justify-center text-white ${f === 'W' ? 'bg-emerald-500' : 'bg-red-400'}`}>{f}</span>)}
                    </span>
                  </span>
                </span>
                <span className="flex-shrink-0 text-right w-24 sm:w-32">
                  <span className="block text-sm font-black tabular-nums text-slate-900">{r.score}</span>
                  <span className="block h-1.5 rounded-full bg-slate-100 overflow-hidden mt-1"><span className="block h-full bg-slate-900" style={{ width: `${(r.score / maxScore) * 100}%` }} /></span>
                </span>
              </Link>
            )
          })}
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-3">Power score = 50% overall win rate + 30% last-5 form + 20% scoring (vs. the league&apos;s top scorer), summed across every sport.</p>
    </div>
  )
}
