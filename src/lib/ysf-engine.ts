// The ySF scoring engine: every 2026-27 matchup scored by the app itself.
//   lineups   — the starters on each date (daily leagues) or in each week (ySFFL), as recorded in
//               fantrax_player_periods (Fantrax history, then the daily capture)
//   stats     — per-game lines: the NHL's official feed for hockey, Tank01 for football and basketball
//   rules     — the league's ySF scoring settings
// Writes matchup scores (keeping ysffantasy.com's official figures in official_home/away_score),
// each player's engine points and stats, and the clubs' W-L / PF / PA. Idempotent.
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { loadGameLines, toFantraxStats, type Sport, type GameLine } from '@/lib/ysf-gamelines'
import { siteFeed } from '@/lib/ysf-data'

const SPORTS: Sport[] = ['NFL', 'NHL', 'NBA']
const KEY: Record<string, string> = { NFL: 'ysf_fl', NHL: 'ysf_hl', NBA: 'ysf_ba', MLB: 'ysf_lb' }
const etToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())

export function ensureEngineSchema() {
  for (const stmt of [
    `ALTER TABLE matchups ADD COLUMN official_home_score REAL`, `ALTER TABLE matchups ADD COLUMN official_away_score REAL`,
    `ALTER TABLE fantrax_player_periods ADD COLUMN engine_pts REAL`, `ALTER TABLE fantrax_player_periods ADD COLUMN engine_stats TEXT`,
  ]) { try { db.run(sql.raw(stmt)) } catch { /* exists */ } }
  db.run(sql`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)`)
}
export function scoreSource(): 'engine' | 'official' {
  try { return (db.all<{ value: string }>(sql`SELECT value FROM app_settings WHERE key = 'score_source'`)[0]?.value as any) === 'engine' ? 'engine' : 'official' } catch { return 'official' }
}
export function setScoreSource(v: 'engine' | 'official') {
  ensureEngineSchema()
  db.run(sql`INSERT INTO app_settings (key, value) VALUES ('score_source', ${v}) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
}

type Row = { rowid: number; period: number; date: string | null; matchup_period: number | null; team_id: string | null; status: string; slot: string; name: string; pro_team: string | null; fx_player_id: string; nhl: string | null; tank: string | null }
export type EngineResult = { sport: string; period: number; home: string; away: string; engine: [number, number]; official: [number, number]; complete: boolean }

export async function runEngine(league: any, opts: { write?: boolean } = {}): Promise<EngineResult[]> {
  ensureEngineSchema()
  const season = league.season as string
  const today = etToday()
  const scoringAll = JSON.parse(league.scoringSettings ?? league.scoring_settings ?? '{}')
  const sched = JSON.parse(league.sportSchedule ?? league.sport_schedule ?? '[]') as { sport: string; startWeek: number }[]
  const results: EngineResult[] = []

  for (const sport of SPORTS) {
    const feed = await siteFeed<any>(`league_${KEY[sport]}.json`)
    const periods = Object.entries<any>(feed?.schedule_meta?.periods ?? {}).map(([p, v]) => ({ p: +p, start: v.start as string, end: v.end as string }))
    if (!periods.length) continue
    const first = periods.reduce((a, b) => (a.start < b.start ? a : b)).start
    const last = [...periods].filter(p => p.start <= today).map(p => p.end).sort().pop() ?? today
    const scoring = scoringAll[sport] ?? {}
    const lines = loadGameLines(sport, first, last < today ? last : today, scoring, true)
    const byId = new Map<string, GameLine[]>()
    for (const g of lines) { const k = g.dstTeam ? `dst:${g.dstTeam}` : g.tankId; byId.set(k, [...(byId.get(k) ?? []), g]) }
    const rows = db.all<Row>(sql`SELECT f.rowid, f.period, f.date, f.matchup_period, f.team_id, f.status, f.slot, f.name, f.pro_team, f.fx_player_id, m.nhl_id nhl, NULLIF(m.tank_id, '') tank
      FROM fantrax_player_periods f LEFT JOIN player_id_map m ON m.sport = f.sport AND m.fx_id = f.fx_player_id
      WHERE f.season = ${season} AND f.sport = ${sport} AND f.matchup_period IS NOT NULL`)
    const DST_CITY: Record<string, string> = { 'Arizona': 'ARI', 'Atlanta': 'ATL', 'Baltimore': 'BAL', 'Buffalo': 'BUF', 'Carolina': 'CAR', 'Chicago': 'CHI', 'Cincinnati': 'CIN', 'Cleveland': 'CLE', 'Dallas': 'DAL', 'Denver': 'DEN', 'Detroit': 'DET', 'Green Bay': 'GB', 'Houston': 'HOU', 'Indianapolis': 'IND', 'Jacksonville': 'JAX', 'Kansas City': 'KC', 'LA Chargers': 'LAC', 'LA Rams': 'LAR', 'Las Vegas': 'LV', 'Miami': 'MIA', 'Minnesota': 'MIN', 'New England': 'NE', 'New Orleans': 'NO', 'NY Giants': 'NYG', 'NY Jets': 'NYJ', 'Philadelphia': 'PHI', 'Pittsburgh': 'PIT', 'San Francisco': 'SF', 'Seattle': 'SEA', 'Tampa Bay': 'TB', 'Tennessee': 'TEN', 'Washington': 'WSH' }
    const gamesOf = (r: Row) => {
      const key = sport === 'NHL' && r.nhl ? `nhl:${r.nhl}` : r.fx_player_id.includes('#') ? `dst:${DST_CITY[r.name.replace(/ D\/ST$/, '')] ?? ''}` : r.tank ?? ''
      const p = periods.find(x => x.p === r.matchup_period)
      const from = sport === 'NFL' ? p?.start ?? '' : r.date ?? '', to = sport === 'NFL' ? p?.end ?? '' : r.date ?? ''
      return (byId.get(key) ?? []).filter(g => g.date >= from && g.date <= to)
    }
    const club: Record<string, number> = {}
    const upd: { rowid: number; pts: number | null; stats: string | null }[] = []
    for (const r of rows) {
      const gs = gamesOf(r)
      const pts = gs.length ? +gs.reduce((a, g) => a + g.pts, 0).toFixed(2) : null
      const st: Record<string, number> = {}
      for (const g of gs) for (const [k, v] of Object.entries(g.stats)) st[k] = (st[k] ?? 0) + v
      upd.push({ rowid: r.rowid, pts, stats: gs.length ? JSON.stringify({ ...toFantraxStats(sport, st), GP: String(gs.length) }) : null })
      if (r.status === '1' && r.team_id && pts) club[`${r.matchup_period}|${r.team_id}`] = (club[`${r.matchup_period}|${r.team_id}`] ?? 0) + pts
    }
    const startWeek = sched.find(s => s.sport === sport)?.startWeek ?? 1
    const ms = db.all<any>(sql`SELECT id, week, home_team_id h, away_team_id a, home_score hs, away_score as_, official_home_score ohs, official_away_score oas, is_complete done, is_playoff po
      FROM matchups WHERE league_id = ${league.id} AND season = ${season} AND sport = ${sport} AND away_team_id IS NOT NULL`)
    for (const m of ms) {
      const per = m.week - startWeek + 1
      const p = periods.find(x => x.p === per)
      if (!p || p.start > today) continue
      const h = +(club[`${per}|${m.h}`] ?? 0).toFixed(2), a = +(club[`${per}|${m.a}`] ?? 0).toFixed(2)
      const complete = p.end < today
      results.push({ sport, period: per, home: m.h, away: m.a, engine: [h, a], official: [m.ohs ?? m.hs, m.oas ?? m.as_], complete })
      if (opts.write) db.run(sql`UPDATE matchups SET official_home_score = COALESCE(official_home_score, home_score), official_away_score = COALESCE(official_away_score, away_score),
        home_score = ${h}, away_score = ${a}, is_complete = ${complete ? 1 : 0} WHERE id = ${m.id}`)
    }
    if (opts.write) {
      db.transaction(tx => { for (const u of upd) tx.run(sql`UPDATE fantrax_player_periods SET engine_pts = ${u.pts}, engine_stats = ${u.stats} WHERE rowid = ${u.rowid}`) })
      recomputeRecords(league.id, season, sport)
    }
  }
  return results
}

// Club W-L-T, points for and against from the completed regular-season matchups
export function recomputeRecords(leagueId: string, season: string, sport: string) {
  const ms = db.all<any>(sql`SELECT home_team_id h, away_team_id a, home_score hs, away_score as_ FROM matchups
    WHERE league_id = ${leagueId} AND season = ${season} AND sport = ${sport} AND is_complete = 1 AND is_playoff = 0 AND away_team_id IS NOT NULL`)
  const r: Record<string, { w: number; l: number; t: number; pf: number; pa: number }> = {}
  const b = (id: string) => (r[id] ??= { w: 0, l: 0, t: 0, pf: 0, pa: 0 })
  for (const m of ms) {
    const h = b(m.h), a = b(m.a)
    h.pf += m.hs; h.pa += m.as_; a.pf += m.as_; a.pa += m.hs
    if (m.hs > m.as_) { h.w++; a.l++ } else if (m.hs < m.as_) { a.w++; h.l++ } else { h.t++; a.t++ }
  }
  for (const [id, x] of Object.entries(r))
    db.run(sql`UPDATE team_records SET wins = ${x.w}, losses = ${x.l}, ties = ${x.t}, points_for = ${+x.pf.toFixed(2)}, points_against = ${+x.pa.toFixed(2)}
      WHERE team_id = ${id} AND league_id = ${leagueId} AND season = ${season} AND sport = ${sport}`)
}
