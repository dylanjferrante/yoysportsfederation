import { db } from '@/db'
import { leagues, teams, teamRecords, playoffGames, leagueHistory } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { sportMeta, safeParse, sportLabel, orderedSports } from '@/lib/utils'
import { advanceLeague } from '@/lib/advance'
import { viewSeasonOf, seasonBranding } from '@/lib/seasons'
import TeamChip from '@/components/TeamChip'
import SportIcon from '@/components/SportIcon'

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

export default async function PlayoffsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ season?: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()
  const { season: viewSeason, isPast } = viewSeasonOf(league, await searchParams)
  if (!isPast) await advanceLeague(league)

  const sports = orderedSports(safeParse<string[]>(league.sportsEnabled, []), league.seasonStart)
  const sportNames = safeParse<Record<string, string>>(league.sportNames, {})
  const champNames = safeParse<Record<string, string>>(league.championshipNames, {})
  const champLogos = safeParse<Record<string, string>>(league.championshipLogos, {})
  const divisionLogos = safeParse<Record<string, string>>(league.divisionLogos, {})
  const champColors = safeParse<Record<string, { p?: string; s?: string }>>(league.championshipColors, {})
  const champGrad = (scope: string, fallback: string) => {
    const c = champColors[scope]
    return c?.p || c?.s ? `linear-gradient(135deg, ${c.p ?? c.s}, ${c.s ?? c.p})` : fallback
  }
  const champInk = (scope: string, fallback: string) => champColors[scope]?.p ?? champColors[scope]?.s ?? fallback
  const n = league.playoffTeams ?? 4
  let franchises = await db.select().from(teams).where(eq(teams.leagueId, id))
  if (isPast) {
    const b = await seasonBranding(id, viewSeason)
    franchises = franchises.map(f => b[f.id] ? { ...f, name: b[f.id].name, abbreviation: b[f.id].abbreviation, logo: b[f.id].logo, primaryColor: b[f.id].primaryColor, secondaryColor: b[f.id].secondaryColor } : f)
  }
  const records = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, id), eq(teamRecords.season, viewSeason)))
  const games = await db.select().from(playoffGames).where(and(eq(playoffGames.leagueId, id), eq(playoffGames.season, viewSeason)))
  const champions = await db.select().from(leagueHistory).where(and(eq(leagueHistory.leagueId, id), eq(leagueHistory.season, viewSeason)))
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
        {winner && done && <span className="text-amber-500"></span>}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        {league.logoUrl && <img src={league.logoUrl} alt="" className="w-10 h-10 object-contain" />}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Playoff Brackets</h1>
          <p className="text-sm text-slate-500">top {n} per sport</p>
        </div>
      </div>

      {fedChamp && (
        <div className="p-5 mb-6 text-white text-center" style={{ background: champGrad('FED', 'linear-gradient(135deg,#b45309,#f59e0b)') }}>
          {champLogos['FED'] && <img src={champLogos['FED']} alt="" className="w-16 h-16 object-contain mx-auto mb-2" />}
          <p className="text-xs uppercase tracking-widest text-white/80">{viewSeason} {champNames['FED'] || `${league.name} Champion`}</p>
          <p className="text-2xl font-black mt-1 flex items-center justify-center gap-2">{teamById[fedChamp.championTeamId ?? '']?.name ?? '—'}</p>
        </div>
      )}

      <div className="space-y-8">
        {sports.map(sport => {
          const meta = sportMeta(sport)
          const bracketGames = (b: string) => games.filter(g => g.sport === sport && (g.bracket ?? 'WINNERS') === b)
          const sportGames = bracketGames('WINNERS')
          const champ = champOf(sport)
          const size = (() => { let p = 1; while (p < n) p <<= 1; return p })()
          const maxExisting = sportGames.length ? Math.max(...sportGames.map(g => g.round)) : 0
          const totalRounds = Math.max(1, Math.round(Math.log2(size)), maxExisting, league.playoffRounds ?? 0)
          const bracket = Array.from({ length: totalRounds }, (_, ri) => {
            const rnd = ri + 1
            const existing = sportGames.filter(g => g.round === rnd).sort((a, b) => a.matchIndex - b.matchIndex)
            const placeholders = existing.length ? 0 : Math.max(1, size >> (ri + 1))
            return { rnd, ri, existing, placeholders }
          })

          return (
            <div key={sport} className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className={`w-8 h-8 rounded-lg ${meta.bg} text-white flex items-center justify-center`}><SportIcon sport={sport} logo={divisionLogos[sport]} size={20} /></span>
                <h2 className="font-semibold text-slate-900">{sportLabel(sport, sportNames)} — {champNames[sport] || 'Playoffs'}</h2>
                {champ && <span className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-amber-600">
                  {champLogos[sport] && <img src={champLogos[sport]} alt="" className="w-6 h-6 object-contain" />}
                  {teamById[champ.championTeamId ?? '']?.abbreviation} champion
                </span>}
              </div>

              {sportGames.length > 0 ? (
                <div className="flex gap-4 overflow-x-auto pb-2 items-center">
                  {bracket.map(({ rnd, ri, existing, placeholders }) => (
                    <div key={rnd} className="flex-shrink-0 w-44">
                      <p className="text-xs font-bold text-slate-400 uppercase mb-2 text-center">{roundName(ri, totalRounds)}</p>
                      <div className="space-y-3">
                        {existing.map(g => (
                          <div key={g.id} className="border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                            <Slot teamId={g.homeTeamId} seed={g.homeSeed} score={g.homeScore ?? undefined} winner={g.winnerTeamId === g.homeTeamId} done={g.isComplete ?? false} />
                            <Slot teamId={g.awayTeamId} seed={g.awaySeed} score={g.awayScore ?? undefined} winner={g.winnerTeamId === g.awayTeamId} done={g.isComplete ?? false} />
                          </div>
                        ))}
                        {Array.from({ length: placeholders }, (_, i) => (
                          <div key={`tbd-${i}`} className="border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                            <Slot teamId={null} seed={null} />
                            <Slot teamId={null} seed={null} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {(() => {
                    const champTeam = champ ? teamById[champ.championTeamId ?? ''] : null
                    return (
                      <div className="flex-1 min-w-[15rem] flex flex-col items-center justify-center gap-4 py-6">
                        <div className="flex flex-col items-center gap-1.5">
                          {champLogos[sport]
                            ? <img src={champLogos[sport]} alt="" className="w-20 h-20 object-contain" />
                            : <span className="text-5xl"></span>}
                          <p className="text-lg font-black uppercase tracking-widest" style={{ color: champInk(sport, '#f59e0b') }}>Champion</p>
                          {champNames[sport] && <p className="text-xs text-slate-400">{champNames[sport]}</p>}
                        </div>
                        <div className="border-2 rounded-2xl px-10 py-7 flex flex-col items-center gap-3 min-w-[13rem]" style={{ borderColor: champInk(sport, '#fcd34d') + '88', background: champInk(sport, '#f59e0b') + '14' }}>
                          {champTeam?.logo
                            ? <img src={champTeam.logo} alt="" className="w-32 h-32 object-contain p-2" style={champTeam.logoBg ? { background: champTeam.primaryColor ?? undefined } : undefined} />
                            : <span className="w-32 h-32 flex items-center justify-center text-4xl font-black" style={{ background: champTeam?.secondaryColor ?? '#fde68a', color: champTeam?.primaryColor ?? '#92400e' }}>{champTeam?.abbreviation ?? 'TBD'}</span>}
                          <span className="text-xl font-bold text-center" style={{ color: champInk(sport, '#92400e') }}>{champTeam?.name ?? 'TBD'}</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              ) : (
                <ProjectedSeeds sport={sport} records={records} teamById={teamById} n={n} />
              )}

              <SideBracket title="Consolation — Placement Games" games={bracketGames('CONSOLATION')} teamById={teamById} placement />
              <SideBracket title="Losers Bracket" games={bracketGames('LOSERS')} teamById={teamById} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SideBracket({ title, games, teamById, placement }: { title: string; games: any[]; teamById: Record<string, any>; placement?: boolean }) {
  if (!games.length) return null
  const rounds = [...new Set(games.map(g => g.round))].sort((a, b) => placement ? b - a : a - b)
  const total = rounds.length
  const colLabel = (ri: number) => { if (!placement) return roundName(ri, total); const place = 3 + 2 * ri; return place === 3 ? '3rd Place' : `${place}th Place` }
  const slot = (g: any, home: boolean) => {
    const teamId = home ? g.homeTeamId : g.awayTeamId
    const seed = home ? g.homeSeed : g.awaySeed
    const score = home ? g.homeScore : g.awayScore
    const winner = g.winnerTeamId === teamId
    const t = teamId ? teamById[teamId] : null
    return (
      <div className={`flex items-center gap-1.5 px-2 py-1.5 text-sm ${winner ? 'font-bold' : g.isComplete && !winner ? 'opacity-60' : ''}`}>
        <span className="text-[10px] font-bold text-slate-400 w-4">{seed ?? ''}</span>
        <span className="flex-1 min-w-0">{t ? <TeamChip team={t} size="sm" useAbbr link={false} /> : <span className="text-slate-400 text-xs">{teamId === null && g.isComplete ? 'BYE' : 'TBD'}</span>}</span>
        {score != null && g.isComplete && <span className="tabular-nums text-xs">{(score as number).toFixed(0)}</span>}
        {winner && g.isComplete && <span className="text-slate-400"></span>}
      </div>
    )
  }
  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">{title}</p>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {rounds.map((rnd, ri) => (
          <div key={rnd} className="flex-shrink-0 w-44">
            <p className="text-[11px] font-bold text-slate-400 uppercase mb-2 text-center">{colLabel(ri)}</p>
            <div className="space-y-3">
              {games.filter(g => g.round === rnd).sort((a, b) => a.matchIndex - b.matchIndex).map(g => (
                <div key={g.id} className="border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                  {slot(g, true)}
                  {slot(g, false)}
                </div>
              ))}
            </div>
          </div>
        ))}
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
      <p className="text-xs text-slate-400 mb-3">Projected seeding from current standings</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
