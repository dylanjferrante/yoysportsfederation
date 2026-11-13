// ySF Site Redesign — Moves: every signing, claim and release, and every trade.
import { loadClubs, loadMoves } from '@/lib/ysf-data'
import { safeParse } from '@/lib/utils'
import { YSF_LEAGUES } from '@/lib/ysf'
import MovesView from './MovesView'

export default async function YsfMoves({ league }: { league: any }) {
  const C = await loadClubs(league.id)
  const { moves, trades } = await loadMoves(league.id, league.season)
  const seasons = [...new Set([league.season, ...moves.map(m => m.season), ...trades.map(t => t.season)])].sort().reverse()
  const sportAbbr = safeParse<Record<string, string>>(league.sportAbbr, {})
  return <MovesView leagueId={league.id} moves={moves} trades={trades} seasons={seasons}
    clubs={Object.fromEntries(Object.values(C).map(c => [c.id, { name: c.name, abbreviation: c.abbreviation, logo: c.logo, altLogo: c.altLogo, color: c.color, ink: c.ink }]))}
    codes={Object.fromEntries(YSF_LEAGUES.map(l => [l.sport, sportAbbr[l.sport] || l.code]))} />
}
