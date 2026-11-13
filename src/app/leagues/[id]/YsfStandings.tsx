// ySF Site Redesign — Standings (Fed Cup + the four leagues), from the Nexus database.
import { db } from '@/db'
import { teams, teamRecords, matchups } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { safeParse } from '@/lib/utils'
import { rankWithinSport } from '@/lib/federation'
import { simulateSeason } from '@/lib/odds'
import { YSF_LEAGUES } from '@/lib/ysf'
import StandingsView, { type StandingsData } from './StandingsView'

export default async function YsfStandings({ league }: { league: any }) {
  const season = league.season
  const clubs = await db.select().from(teams).where(and(eq(teams.leagueId, league.id), eq(teams.archived, false)))
  const recs = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, league.id), eq(teamRecords.season, season)))
  const ms = await db.select().from(matchups).where(and(eq(matchups.leagueId, league.id), eq(matchups.season, season)))
  const n = clubs.length
  const playoffTeams = league.playoffTeams ?? 6

  // per-league tables
  const tables: StandingsData['tables'] = {}
  const started: Record<string, boolean> = {}
  for (const L of YSF_LEAGUES) {
    const rows = recs.filter(r => r.sport === L.sport).map(r => ({ teamId: r.teamId, wins: r.wins ?? 0, losses: r.losses ?? 0, ties: r.ties ?? 0, pointsFor: r.pointsFor ?? 0, faab: r.faabRemaining ?? 0 }))
    started[L.sport] = rows.some(r => r.wins + r.losses + r.ties > 0)
    const ranked = rankWithinSport(rows)
    const lead = ranked[0]
    tables[L.sport] = ranked.map(r => ({ teamId: r.teamId, rk: r.position, rec: `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`, w: r.wins, l: r.losses,
      gb: lead ? ((lead.wins - r.wins) + (r.losses - lead.losses)) / 2 : 0, pf: r.pointsFor, faab: r.faab, fed: started[L.sport] ? n + 1 - r.position : 0, po: 0, title: 0 }))
  }

  // odds: play out every remaining regular-season matchup
  const live = YSF_LEAGUES.filter(L => started[L.sport]).map(L => L.sport)
  const fs = { placement: Array.from({ length: n }, (_, i) => n - i), championBonus: 0, regularSeasonBonus: 0, includedSports: YSF_LEAGUES.map(l => l.sport) }
  const odds = simulateSeason(YSF_LEAGUES.map(L => ({
    sport: L.sport, playoffTeams,
    teams: recs.filter(r => r.sport === L.sport).map(r => ({ teamId: r.teamId, wins: r.wins ?? 0, pointsFor: r.pointsFor ?? 0, games: (r.wins ?? 0) + (r.losses ?? 0) + (r.ties ?? 0) })),
    remaining: ms.filter(m => m.sport === L.sport && !m.isComplete && !m.isPlayoff && m.awayTeamId).map(m => ({ home: m.homeTeamId, away: m.awayTeamId! })),
  })), fs, fs.includedSports, 4000)
  for (const L of YSF_LEAGUES) for (const r of tables[L.sport]) { r.po = odds.perSport[L.sport]?.playoff[r.teamId] ?? 0; r.title = odds.perSport[L.sport]?.title[r.teamId] ?? 0 }

  // Federation Cup: placement points in every league that has started
  const cup = clubs.map(c => {
    let pts = 0, w = 0, l = 0
    const ranks: Record<string, number | null> = {}
    for (const L of YSF_LEAGUES) {
      const r = tables[L.sport].find(x => x.teamId === c.id)
      ranks[L.sport] = started[L.sport] && r ? r.rk : null
      if (started[L.sport] && r) { pts += r.fed; w += r.w; l += r.l }
    }
    return { teamId: c.id, pts, rec: `${w}-${l}`, w, ranks, cupPct: odds.federation[c.id] ?? 0, exp: odds.fedPoints[c.id] ?? 0 }
  }).sort((a, b) => b.pts - a.pts || b.w - a.w).map((r, i) => ({ ...r, rk: i + 1 }))

  const now = new Date()
  const updated = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(now)
  const lb = YSF_LEAGUES.find(l => l.sport === 'MLB')!
  const sched = safeParse<any[]>(league.sportSchedule, [])

  return (
    <StandingsView data={{
      leagueId: league.id, season, updated, live,
      clubs: Object.fromEntries(clubs.map(c => [c.id, { name: c.name, abbreviation: c.abbreviation, logo: c.logo, color: c.primaryColor }])),
      cup, tables, lbOpens: started.MLB ? null : (sched.find(s => s.sport === lb.sport) ? 'Mar 24, 2027' : null),
    }} />
  )
}
