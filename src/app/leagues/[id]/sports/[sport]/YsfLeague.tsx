// ySF Site Redesign — one league (ySFFL / ySFHL / ySFBA / ySFLB): standings, matchups,
// playoff picture, every club's roster and the league's moves.
import { db } from '@/db'
import { matchups, rosters, players } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { loadStandings, loadMoves, periodLabel } from '@/lib/ysf-data'
import { safeParse } from '@/lib/utils'
import { YSF_LEAGUES } from '@/lib/ysf'
import { trophyName } from '@/lib/ysf-trophies'
import LeagueView, { type LeagueViewData } from './LeagueView'

const ORDER: Record<string, string[]> = {
  NFL: ['QB', 'RB', 'WR', 'TE', 'RB/WR/TE', 'K', 'DEF'], NHL: ['C', 'LW', 'RW', 'D', 'UTIL', 'G'],
  NBA: ['PG', 'SG', 'SF', 'PF', 'C', 'UTIL'], MLB: ['C', '1B', '2B', '3B', 'SS', 'OF', 'UTIL', 'SP', 'RP'],
}
const LABEL: Record<string, string> = { 'RB/WR/TE': 'FLEX', DEF: 'D/ST' }

export default async function YsfLeague({ league, sport }: { league: any; sport: string }) {
  const L = YSF_LEAGUES.find(l => l.sport === sport)!
  const s = await loadStandings(league)
  const sportAbbr = safeParse<Record<string, string>>(league.sportAbbr, {})
  const codes = Object.fromEntries(YSF_LEAGUES.map(l => [l.sport, sportAbbr[l.sport] || l.code]))
  const C = Object.fromEntries(Object.values(s.clubs).map(c => [c.id, { name: c.name, abbreviation: c.abbreviation, logo: c.logo, altLogo: c.altLogo, color: c.color }]))

  // matchups by week
  const ms = (await db.select().from(matchups).where(and(eq(matchups.leagueId, league.id), eq(matchups.season, league.season), eq(matchups.sport, sport))))
  const weeks = [...new Set(ms.map(m => m.week))].sort((a, b) => a - b)
  const incomplete = ms.filter(m => !m.isComplete).map(m => m.week)
  const cur = incomplete.length ? Math.min(...incomplete) : weeks[weeks.length - 1]
  const byWeek = weeks.map(w => ({ week: w, label: periodLabel(league, sport, w), playoff: ms.some(m => m.week === w && m.isPlayoff),
    games: ms.filter(m => m.week === w).map(m => ({ id: m.id, home: m.homeTeamId, away: m.awayTeamId, hs: m.homeScore ?? 0, as: m.awayScore ?? 0, done: !!m.isComplete })) }))

  // rosters for every club in this league
  const ro = await db.select({ teamId: rosters.teamId, slot: rosters.slot, name: players.name, position: players.position, eligible: players.eligiblePositions, team: players.realTeamAbbr })
    .from(rosters).innerJoin(players, eq(rosters.playerId, players.id)).where(eq(rosters.sport, sport))
  const rosterBy: LeagueViewData['rosters'] = {}
  for (const id of Object.keys(C)) {
    const mine = ro.filter(r => r.teamId === id)
    const pos = (r: typeof mine[number]) => { const e = safeParse<string[]>(r.eligible, []); return (e.length > 1 ? e : [r.position]).join('/').replace(/\bDEF\b/g, 'D/ST') }
    const row = (r: typeof mine[number], slot: string) => ({ slot, name: r.name, meta: `(${codes[sport]}-${r.team || 'FA'}, ${pos(r)})` })
    const o = ORDER[sport] ?? []
    rosterBy[id] = [
      { label: 'STARTERS', rows: mine.filter(r => !['BN', 'IR', 'TAXI'].includes(r.slot)).sort((a, b) => (o.indexOf(a.slot) + 99) % 99 - (o.indexOf(b.slot) + 99) % 99).map(r => row(r, LABEL[r.slot] ?? r.slot)) },
      { label: 'BENCH', rows: mine.filter(r => r.slot === 'BN').map(r => row(r, 'BN')) },
      { label: 'INJURED RESERVE', rows: mine.filter(r => r.slot === 'IR').map(r => row(r, 'IR')) },
      { label: 'TAXI SQUAD', rows: mine.filter(r => r.slot === 'TAXI').map(r => row(r, 'TAXI')) },
    ].filter(g => g.rows.length)
  }

  const { moves: allMoves } = await loadMoves(league.id, league.season)
  const moves = allMoves.filter(m => m.season === league.season)
  return (
    <LeagueView data={{
      leagueId: league.id, sport, code: codes[sport], name: L.name, live: (s.live as string[]).includes(sport), codes, clubs: C,
      table: s.tables[sport], weeks: byWeek, cur, curLabel: periodLabel(league, sport, cur),
      champ: trophyName(sport, league.season), playoffTeams: league.playoffTeams ?? 6,
      rosters: rosterBy, moves: moves.filter(m => m.sport === sport),
    }} />
  )
}
