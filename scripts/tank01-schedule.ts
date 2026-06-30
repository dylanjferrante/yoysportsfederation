/**
 * Tank01 real game schedules → committed data fixtures.
 *
 * Pulls each team's full-season schedule (get<Sport>TeamSchedule) and writes the
 * deduped games to src/fixtures/schedule-<sport>.json. The seed loads these into
 * the game_schedule table so the app shows REAL opponents / byes / game times
 * instead of a synthetic round-robin — with NO request-time API calls.
 *
 *   npm run tank01:schedule          # all four sports
 *   npm run tank01:schedule NFL      # one sport
 *
 * Budget: ~1 call (team list) + ~30 (one per team) per sport = well under the
 * 1,000/sport/month cap, and only run occasionally (schedules rarely change).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

type Sport = 'NFL' | 'NBA' | 'NHL' | 'MLB'
const ALL: Sport[] = ['NFL', 'NBA', 'NHL', 'MLB']

const HOSTS: Record<Sport, string> = {
  NFL: 'tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com',
  NBA: 'tank01-fantasy-stats.p.rapidapi.com',
  NHL: 'tank01-nhl-live-in-game-real-time-statistics-nhl.p.rapidapi.com',
  MLB: 'tank01-mlb-live-in-game-real-time-statistics.p.rapidapi.com',
}

function loadEnv(): Record<string, string> {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    const out: Record<string, string> = {}
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
    return out
  } catch { return {} }
}

const env = { ...loadEnv(), ...process.env }
const KEY = env.TANK01_RAPIDAPI_KEY

async function call(sport: Sport, path: string): Promise<any> {
  const host = env[`TANK01_HOST_${sport}`] || HOSTS[sport]
  const res = await fetch(`https://${host}/${path}`, {
    headers: { 'x-rapidapi-key': KEY!, 'x-rapidapi-host': host, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`${sport} ${path} → ${res.status} ${res.statusText}`)
  const json = await res.json()
  return json && typeof json === 'object' && 'body' in json ? json.body : json
}

type Game = { gameId: string; sport: Sport; gameDate: string; homeAbbr: string; awayAbbr: string; gameTimeEpoch: string | null; status: string | null; seasonType: string | null }

// Pull these real seasons so a cross-sport fantasy season (e.g. "2025-26", which
// spans NFL/NBA/NHL 2025 in the fall through MLB 2026 in the summer) is fully
// covered. get<Sport>TeamSchedule defaults to the CURRENT season, which rolls
// over mid-year — so we request explicit seasons and merge (deduped by gameID).
const SEASONS = (process.env.TANK01_SCHEDULE_SEASONS || '2025,2026').split(',').map(s => s.trim()).filter(Boolean)

async function pullSport(sport: Sport): Promise<Game[]> {
  const teamsBody = await call(sport, `get${sport}Teams`)
  const teams: any[] = Array.isArray(teamsBody) ? teamsBody : Object.values(teamsBody ?? {})
  const abbrs = [...new Set(teams.map(t => String(t.teamAbv ?? t.abbreviation ?? '')).filter(Boolean))]
  console.log(`\n${sport}: ${abbrs.length} teams × seasons [${SEASONS.join(', ')}] → fetching schedules (${abbrs.length * SEASONS.length} requests)…`)

  const byId = new Map<string, Game>()
  for (const season of SEASONS) for (const abv of abbrs) {
    let rows: any[] = []
    try {
      const body = await call(sport, `get${sport}TeamSchedule?teamAbv=${abv}&season=${season}`)
      rows = Array.isArray(body?.schedule) ? body.schedule : Array.isArray(body) ? body : Object.values(body?.schedule ?? body ?? {})
    } catch (e) {
      console.error(`  ✗ ${abv} (${season}): ${(e as Error).message}`)
      continue
    }
    for (const g of rows) {
      const gameId = String(g.gameID ?? g.gameId ?? '')
      const homeAbbr = String(g.home ?? '')
      const awayAbbr = String(g.away ?? '')
      const gameDate = String(g.gameDate ?? '')
      if (!gameId || !gameDate || !homeAbbr || !awayAbbr || byId.has(gameId)) continue
      byId.set(gameId, {
        gameId, sport, gameDate, homeAbbr, awayAbbr,
        gameTimeEpoch: g.gameTime_epoch != null ? String(g.gameTime_epoch) : null,
        status: g.gameStatus != null ? String(g.gameStatus) : null,
        seasonType: (g.seasonType ?? g.gameType) != null ? String(g.seasonType ?? g.gameType) : null,
      })
    }
  }
  const games = [...byId.values()].sort((a, b) => a.gameDate.localeCompare(b.gameDate))
  console.log(`  ${games.length} unique games (${games.filter(g => /regular/i.test(g.seasonType ?? '')).length} regular season)`)
  return games
}

async function main() {
  if (!KEY) { console.error('TANK01_RAPIDAPI_KEY is not set in .env'); process.exit(1) }
  const arg = process.argv[2]?.toUpperCase() as Sport | undefined
  const sports = arg && ALL.includes(arg) ? [arg] : ALL
  const outDir = resolve(process.cwd(), 'src/fixtures')
  mkdirSync(outDir, { recursive: true })

  for (const sport of sports) {
    try {
      const games = await pullSport(sport)
      const file = resolve(outDir, `schedule-${sport}.json`)
      writeFileSync(file, JSON.stringify(games))
      console.log(`  → wrote ${file}`)
    } catch (e) {
      console.error(`  ✗ ${sport} failed:`, (e as Error).message)
    }
  }
  console.log('\nDone. Now run: npm run db:reset')
}

main().catch(e => { console.error(e); process.exit(1) })
