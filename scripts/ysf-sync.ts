/**
 * Keep the ySF league's real-world data current (Tank01):
 *   1. game_schedule — every NBA/NHL game of the 2026-27 season (the NFL 2026 schedule is
 *      already loaded); statuses for this week refreshed so lineups lock at tip-off / puck drop.
 *   2. player_season_stats — season-to-date stats and fantasy points for every player who has
 *      played, scored with the league's own (ySF) scoring. Display only: matchup scoring is
 *      untouched, so Fantrax results stay the source of truth until the switch-over.
 *
 *   npm run ysf:sync                 # schedules + stats
 *   npm run ysf:sync -- --stats      # stats only (no schedule pull)
 *
 * Box scores are cached on disk (data/tank01-cache, git-ignored), so a re-run only fetches
 * games that finished since the last run. Read-only against Tank01; writes only to the
 * local database.
 */
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { nanoid } from 'nanoid'

const ROOT = process.cwd()
for (const line of (fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

type Sport = 'NFL' | 'NBA' | 'NHL' | 'MLB'
const LEAGUE_ID = process.env.YSF_LEAGUE_ID || 'ysf'
const HOST: Record<Sport, string> = {
  NFL: process.env.TANK01_HOST_NFL || 'tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com',
  NBA: process.env.TANK01_HOST_NBA || 'tank01-fantasy-stats.p.rapidapi.com',
  NHL: process.env.TANK01_HOST_NHL || 'tank01-nhl-live-in-game-real-time-statistics-nhl.p.rapidapi.com',
  MLB: process.env.TANK01_HOST_MLB || 'tank01-mlb-live-in-game-real-time-statistics.p.rapidapi.com',
}
// Tank01's season label for each sport's 2026-27 campaign, and when it started.
const SEASON_KEY: Partial<Record<Sport, string>> = { NBA: '2027', NHL: '2027' }
const SEASON_START: Partial<Record<Sport, string>> = { NFL: '20260909', NBA: '20261020', NHL: '20260929' }

const CACHE = path.join(ROOT, 'data', 'tank01-cache')
let calls = 0
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
async function api(sport: Sport, p: string): Promise<any> {
  const key = process.env.TANK01_RAPIDAPI_KEY
  if (!key) throw new Error('TANK01_RAPIDAPI_KEY is not set')
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(150)
    const r = await fetch(`https://${HOST[sport]}/${p}`, { headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': HOST[sport] } })
    calls++
    if (r.status === 429) { await sleep(2000 * (attempt + 1)); continue }
    if (!r.ok) throw new Error(`Tank01 ${sport} ${p} → ${r.status}`)
    const j: any = await r.json()
    return j && typeof j === 'object' && 'body' in j ? j.body : j
  }
  throw new Error(`Tank01 ${sport} ${p}: rate limited`)
}
async function boxScore(sport: Sport, gameId: string): Promise<any> {
  const f = path.join(CACHE, sport, gameId.replace(/[^A-Za-z0-9_@]/g, '_') + '.json')
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'))
  const body = await api(sport, `get${sport}BoxScore?gameID=${encodeURIComponent(gameId)}`)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  if (/final|completed/i.test(String(body?.gameStatus ?? ''))) fs.writeFileSync(f, JSON.stringify(body))
  return body
}
// Same per-player extraction the live-stats layer uses (FG distances for kickers, D/ST blocks).
function entries(sport: Sport, body: any): { externalId: string; raw: any }[] {
  const ps = body?.playerStats ?? {}
  const out = Object.entries<any>(ps).map(([pid, raw]) => ({ externalId: String(raw?.playerID ?? pid), raw }))
  if (sport === 'NFL') {
    const fg: Record<string, number[]> = {}
    for (const play of body?.scoringPlays ?? []) {
      if (String(play?.scoreType) !== 'FG') continue
      const m = /(\d+)\s*Yd/i.exec(String(play?.score ?? '')); const kid = String((play?.playerIDs ?? [])[0] ?? '')
      if (m && kid) (fg[kid] ??= []).push(+m[1])
    }
    for (const e of out) if (fg[e.externalId]) e.raw = { ...e.raw, __fgMade: fg[e.externalId] }
    for (const side of ['away', 'home']) { const d = body?.DST?.[side]; if (d?.teamID) out.push({ externalId: `DST_${d.teamID}`, raw: { __dst: d } }) }
  }
  return out
}
const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

async function main() {
  const { mapBoxScoreBase, deriveWeekly } = await import('../src/lib/providers/boxscore-map')
  const { scorePlayer } = await import('../src/lib/scoring')
  const db = new Database(path.join(ROOT, 'data', 'nexus.db'))
  db.exec(`CREATE TABLE IF NOT EXISTS player_season_stats (id TEXT PRIMARY KEY, league_id TEXT NOT NULL, season TEXT NOT NULL, sport TEXT NOT NULL, player_id TEXT NOT NULL,
    gp INTEGER DEFAULT 0, points REAL DEFAULT 0, stats TEXT DEFAULT '{}', injury TEXT, updated_at TEXT DEFAULT (datetime('now')));
    CREATE UNIQUE INDEX IF NOT EXISTS player_season_stats_uniq ON player_season_stats(league_id, season, player_id);`)
  const league = db.prepare(`SELECT season, scoring_settings FROM leagues WHERE id=?`).get(LEAGUE_ID) as any
  if (!league) throw new Error(`League ${LEAGUE_ID} not found — run npm run ysf:import first`)
  const scoring = JSON.parse(league.scoring_settings || '{}')
  const statsOnly = process.argv.includes('--stats')
  const today = ymd(new Date())

  // ── 1. schedules ──
  const upsertGame = db.prepare(`INSERT INTO game_schedule (id, sport, game_date, home_abbr, away_abbr, game_time_epoch, status, season_type) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET game_date=excluded.game_date, home_abbr=excluded.home_abbr, away_abbr=excluded.away_abbr,
    game_time_epoch=COALESCE(excluded.game_time_epoch, game_schedule.game_time_epoch), status=COALESCE(excluded.status, game_schedule.status), season_type=excluded.season_type`)
  if (!statsOnly) {
    for (const sport of ['NBA', 'NHL'] as Sport[]) {
      const teamsBody = await api(sport, `get${sport}Teams`)
      const abvs: string[] = (Array.isArray(teamsBody) ? teamsBody : Object.values(teamsBody ?? {})).map((t: any) => t.teamAbv).filter(Boolean)
      let n = 0
      for (const abv of abvs) {
        const body = await api(sport, `get${sport}TeamSchedule?teamAbv=${abv}&season=${SEASON_KEY[sport]}`)
        const rows: any[] = Array.isArray(body?.schedule) ? body.schedule : Array.isArray(body) ? body : Object.values(body?.schedule ?? {})
        db.transaction(() => { for (const g of rows) {
          if (!g.gameID || !g.gameDate) continue
          upsertGame.run(String(g.gameID), sport, String(g.gameDate), String(g.home ?? ''), String(g.away ?? ''), g.gameTime_epoch != null ? String(g.gameTime_epoch) : null, g.gameStatus != null ? String(g.gameStatus) : null, g.seasonType ?? null); n++
        } })()
      }
      console.log(`${sport} schedule: ${n} team-games across ${abvs.length} teams`)
    }
  }
  // this week's statuses (so today's games lock when they start)
  for (const sport of ['NFL', 'NBA', 'NHL'] as Sport[]) {
    for (let k = -1; k <= 1; k++) {
      const d = ymd(new Date(Date.now() + k * 86_400_000))
      const body = await api(sport, `get${sport}ScoresOnly?gameDate=${d}`)
      const rows: any[] = Array.isArray(body) ? body : Object.values(body ?? {})
      const st = db.prepare(`UPDATE game_schedule SET status=?, game_time_epoch=COALESCE(?, game_time_epoch) WHERE id=?`)
      for (const g of rows) if (g.gameID) st.run(String(g.gameStatus ?? ''), g.gameTime_epoch != null ? String(g.gameTime_epoch) : null, String(g.gameID))
    }
  }

  // ── 2. season-to-date stats ──
  const byExt = new Map<string, string[]>()
  for (const r of db.prepare(`SELECT id, external_id FROM players WHERE external_id IS NOT NULL AND external_id != ''`).all() as any[]) {
    byExt.set(r.external_id, [...(byExt.get(r.external_id) ?? []), r.id])
  }
  const upsertStat = db.prepare(`INSERT INTO player_season_stats (id, league_id, season, sport, player_id, gp, points, stats, updated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(league_id, season, player_id) DO UPDATE SET gp=excluded.gp, points=excluded.points, stats=excluded.stats, updated_at=excluded.updated_at`)
  for (const sport of ['NFL', 'NBA', 'NHL'] as Sport[]) {
    const games = db.prepare(`SELECT id FROM game_schedule WHERE sport=? AND game_date>=? AND game_date<=? AND (season_type IS NULL OR season_type NOT LIKE '%Pre%')`).all(sport, SEASON_START[sport], today) as any[]
    const agg = new Map<string, { gp: number; pts: number; s: Record<string, number> }>()
    let used = 0, live = 0
    for (const { id } of games) {
      let body: any
      try { body = await boxScore(sport, id) } catch (e) { console.warn(String(e)); continue }
      if (!/final|completed/i.test(String(body?.gameStatus ?? ''))) { live++; continue }
      used++
      for (const e of entries(sport, body)) {
        const base = mapBoxScoreBase(sport, e.raw)
        if (!Object.keys(base).length) continue
        const a = agg.get(e.externalId) ?? { gp: 0, pts: 0, s: {} }
        a.gp++; a.pts += scorePlayer(deriveWeekly(sport, { ...base }), scoring[sport] ?? {})
        for (const [k, v] of Object.entries(base)) if (typeof v === 'number' && !k.startsWith('__') && !k.startsWith('fgDist')) a.s[k] = (a.s[k] ?? 0) + v
        agg.set(e.externalId, a)
      }
    }
    let wrote = 0
    db.transaction(() => { for (const [ext, a] of agg) for (const pid of byExt.get(ext) ?? []) {
      upsertStat.run(nanoid(), LEAGUE_ID, league.season, sport, pid, a.gp, +a.pts.toFixed(1), JSON.stringify(a.s)); wrote++
    } })()
    console.log(`${sport}: ${used} final games (${live} not final yet), ${wrote} players with stats`)
  }
  console.log(`Tank01 calls this run: ${calls}`)
}
main().catch(e => { console.error(e); process.exit(1) })
