import { db } from '@/db'
import { leagues, teams, teamRecords, playoffGames, leagueHistory } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { sportMeta, safeParse, sportLabel } from '@/lib/utils'
import { advanceLeague } from '@/lib/advance'
import TeamChip from '@/components/TeamChip'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  return { title: `${league?.name ?? 'League'} · Playoffs` }
}

function seedOrder(n: number): number[] {
  let r = [1, 2]
  while (r.length < n) { const len = r.length * 2 + 1; const next: number[] = []; for (const s of r) { next.push(s); next.push(len - s) } r = next }
  return r
}
const roundName = (ri: number, total: number) => {
  const fromEnd = total - 1 - ri
  return fromEnd === 0 ? 'Final' : fromEnd === 1 ? 'Semifinals' : fromEnd === 2 ? 'Quarterfinals' : `Round ${ri + 1}`
}

export default async function PlayoffsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()
  await advanceLeague(league)

  const sports = safeParse<string[]>(league.sportsEnabled, [])
  const sportNames = safeParse<Record<string, string>>(league.sportNames, {})
  const champNames = safeParse<Record<string, string>>(league.championshipNames, {})
  const champLogos = safeParse<Record<string, string>>(league.championshipLogos, {})
  const n = league.playoffTeams ?? 4
  const franchises = await db.select().from(teams).where(eq(teams.leagueId, id))
  const records = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, id), eq(teamRecords.season, league.season)))
  const games = await db.select().from(playoffGames).where(and(eq(playoffGames.leagueId, id), eq(playoffGames.season, league.season)))
  const champions = await db.select().from(leagueHistory).where(and(eq(leagueHistory.leagueId, id), eq(leagueHistory.season, league.season)))
  const teamById = Object.fromEntries(franchises.map(f => [f.id, f]))
  const champOf = (scope: string) => champions.find(c => c.scope === scope)
  const fedChamp = champOf('OVERALL')

  function Slot({ teamId, seed, score, winner, done }: { teamId: string | null; seed: number | null; score?: number; winner?: boolean; done?: boolean }) {
    const t = teamId ? teamById[teamId] : null
    return (
      <div className={`flex items-center gap-1.5 px-2 py-1.5 text-sm ${winner ? 'font-bold' : done && !winner ? 'opacity-60' : ''}`}>
        <span className="text-[10px] font-bold text-slate-400 w-4">{seed ?? ''}</span>
        <span className="flex-1 min-w-0">{t ? <TeamChip team={t} size="sm" useAbbr link={false} /> : <span className="text-slate-400 text-xs">{teamId === null && done ? 'BYE' : 'TBD'}</span>}</span>
        {score != null && done && <span className="tabular-nums text-xs">{score.toFixed(0)}</span>}
        {winner && done && <span className="text-amber-500">▸</span>}
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/leagues/${id}`} className="btn-ghost text-slate-500">← Back</Link>
        {league.logoUrl && <img src={league.logoUrl} alt="" className="w-10 h-10 object-contain" />}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Playoff Brackets</h1>
          <p className="text-sm text-slate-500">{league.name} · top {n} per sport · resolves automatically</p>
        </div>
      </div>

      {/* Federation champion banner */}
      {fedChamp && (
        <div className="p-5 mb-6 text-white text-center" style={{ background: 'linear-gradient(135deg,#b45309,#f59e0b)' }}>
          {champLogos['FED'] && <img src={champLogos['FED']} alt="" className="w-16 h-16 object-contain mx-auto mb-2" />}
          <p className="text-xs uppercase tracking-widest text-white/80">{league.season} {champNames['FED'] || `${league.name} Champion`}</p>
          <p className="text-2xl font-black mt-1 flex items-center justify-center gap-2">🏆 {teamById[fedChamp.championTeamId ?? '']?.name ?? '—'}</p>
        </div>
      )}

      <div className="space-y-8">
        {sports.map(sport => {
          const meta = sportMeta(sport)
          const sportGames = games.filter(g => g.sport === sport)
          const champ = champOf(sport)
          const rounds = [...new Set(sportGames.map(g => g.round))].sort((a, b) => a - b)

          return (
            <div key={sport} className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className={`w-8 h-8 rounded-lg ${meta.bg} text-white flex items-center justify-center`}>{meta.emoji}</span>
                <h2 className="font-semibold text-slate-900">{sportLabel(sport, sportNames)} {champNames[sport] || 'Playoffs'}</h2>
                {champ && <span className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-amber-600">
                  {champLogos[sport] && <img src={champLogos[sport]} alt="" className="w-6 h-6 object-contain" />}
                  🏆 {teamById[champ.championTeamId ?? '']?.abbreviation} champion
                </span>}
              </div>

              {sportGames.length > 0 ? (
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {rounds.map((rnd, ri) => {
                    const rg = sportGames.filter(g => g.round === rnd).sort((a, b) => a.matchIndex - b.matchIndex)
                    return (
                      <div key={rnd} className="flex-shrink-0 w-44">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-2">{roundName(ri, rounds.length)}</p>
                        <div className="space-y-3">
                          {rg.map(g => (
                            <div key={g.id} className="border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                              <Slot teamId={g.homeTeamId} seed={g.homeSeed} score={g.homeScore ?? undefined} winner={g.winnerTeamId === g.homeTeamId} done={g.isComplete ?? false} />
                              <Slot teamId={g.awayTeamId} seed={g.awaySeed} score={g.awayScore ?? undefined} winner={g.winnerTeamId === g.awayTeamId} done={g.isComplete ?? false} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  <div className="flex-shrink-0 w-32 flex flex-col justify-center">
                    <p className="text-xs font-bold text-amber-500 uppercase mb-2">Champion</p>
                    <div className="border-2 border-amber-200 bg-amber-50 rounded-lg px-3 py-4 text-center text-sm text-amber-700">
                      🏆 {champ ? teamById[champ.championTeamId ?? '']?.abbreviation : 'TBD'}
                    </div>
                  </div>
                </div>
              ) : (
                // Pre-playoffs: show the projected seeds from current standings.
                <ProjectedSeeds sport={sport} records={records} teamById={teamById} n={n} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProjectedSeeds({ sport, records, teamById, n }: any) {
  const ranked = records.filter((r: any) => r.sport === sport)
    .sort((a: any, b: any) => (a.finishPosition ?? 99) - (b.finishPosition ?? 99) || (b.wins ?? 0) - (a.wins ?? 0))
    .slice(0, n)
  if (!ranked.length) return <p className="text-sm text-slate-400">No standings yet.</p>
  const order = seedOrder((() => { let p = 1; while (p < ranked.length) p <<= 1; return p })())
  return (
    <>
      <p className="text-xs text-slate-400 mb-3">Projected seeding — brackets fill in automatically when the regular season ends.</p>
      <div className="grid sm:grid-cols-2 gap-2">
        {order.map((seed, i) => {
          const r = ranked[seed - 1]
          const t = r ? teamById[r.teamId] : null
          return (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm">
              <span className="text-[10px] font-bold text-slate-400 w-4">{seed}</span>
              <span className="font-medium text-slate-800 flex-1 truncate">{t?.name ?? 'BYE'}</span>
              {r && <span className="text-xs text-slate-400 tabular-nums">{r.wins}-{r.losses}</span>}
            </div>
          )
        })}
      </div>
    </>
  )
}
