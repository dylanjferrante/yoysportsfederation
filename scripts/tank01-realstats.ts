/**
 * Tank01 real per-game box scores → committed stat fixtures.
 *
 * For each finished game already in game_schedule (loaded by tank01:schedule),
 * pulls the real box score, maps it to our scoring keys, and aggregates per player
 * into (a) fantasy-week totals and (b) per-day lines. Writes one fixture per sport
 * to src/fixtures/realstats-<sport>.json. The seed then builds REAL game logs,
 * matchup scores, standings, and playoffs from these — with NO request-time calls.
 *
 *   npm run tank01:realstats                 # all sports, full pull
 *   npm run tank01:realstats NFL             # one sport, full pull
 *   npm run tank01:realstats -- --since=20260701   # incremental: only re-pull
 *                                            # fantasy weeks that have a game on
 *                                            # or after that date, merged into the
 *                                            # existing fixture (cheap daily cron).
 *
 * Budget: ~1 request per finished game (full pull is hundreds–thousands; an
 * incremental --since pull is only the games in the affected week(s)). The
 * provider throttles + retries on 429, so this rides under the per-minute cap.
 */
import Database from 'better-sqlite3'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { weekDateRange } from '../src/lib/defaults'
import { mapBoxScoreBase, deriveWeekly } from '../src/lib/providers/boxscore-map'
import { tank01BoxScore } from '../src/lib/providers/tank01'

type Sport = 'NFL' | 'NBA' | 'NHL' | 'MLB'
const ALL: Sport[] = ['NFL', 'NBA', 'NHL', 'MLB']

// Load the API key + hosts from .env into process.env for the provider layer.
function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* no .env */ }
}
loadEnv()

const CURRENT_SEASON = process.env.TANK01_FANTASY_SEASON || '2025-26'
const MAX_WEEK = 45

// Map a yyyymmdd date to the fantasy week (1..45) of the anchored season, or null.
function fantasyWeekOf(yyyymmdd: string): number | null {
  const y = +yyyymmdd.slice(0, 4), mo = +yyyymmdd.slice(4, 6), d = +yyyymmdd.slice(6, 8)
  const date = new Date(y, mo - 1, d)
  for (let w = 1; w <= MAX_WEEK; w++) {
    const { start, end } = weekDateRange(CURRENT_SEASON, w)
    if (date >= start && date <= new Date(end.getTime() + 86_400_000)) return w
  }
  return null
}

const add = (into: Record<string, number>, from: Record<string, number>) => {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v
}

function readFixture(sport: Sport): { season: string; weekly: any; daily: any } | null {
  try { return JSON.parse(readFileSync(resolve(process.cwd(), 'src/fixtures', `realstats-${sport}.json`), 'utf8')) } catch { return null }
}

async function pullSport(db: Database.Database, sport: Sport, since: string | null) {
  const games = (db.prepare(
    `SELECT id, game_date FROM game_schedule WHERE sport=? AND status='Completed' ORDER BY game_date`
  ).all(sport) as { id: string; game_date: string }[])
    .map(g => ({ ...g, week: fantasyWeekOf(g.game_date) }))
    .filter((g): g is { id: string; game_date: string; week: number } => g.week != null)

  // Incremental mode: re-pull only the fantasy weeks that contain a game on/after
  // `since`, and merge them into the existing fixture (whole weeks, so totals re-sum
  // correctly). Falls back to a full pull if no prior fixture exists.
  const existing = since ? readFixture(sport) : null
  const dirtyWeeks = new Set<number>()
  let toPull = games
  if (since && existing) {
    for (const g of games) if (g.game_date >= since) dirtyWeeks.add(g.week)
    toPull = games.filter(g => dirtyWeeks.has(g.week))
    console.log(`\n${sport}: incremental since ${since} — ${dirtyWeeks.size} affected week(s), ${toPull.length} games`)
  } else {
    console.log(`\n${sport}: ${games.length} finished in-window games → pulling box scores…`)
  }

  // externalId -> week -> summed base stats ; and externalId -> yyyymmdd -> summed base
  const weekly: Record<string, Record<number, Record<string, number>>> = {}
  const daily: Record<string, Record<string, Record<string, number>>> = {}
  let done = 0, failed = 0
  for (const g of toPull) {
    const week = g.week
    let lines: { externalId: string; raw: any }[]
    try { lines = await tank01BoxScore(sport, g.id) } catch (e) { failed++; if (failed <= 5) console.error(`  ✗ ${g.id}: ${(e as Error).message}`); continue }
    for (const l of lines) {
      const base = mapBoxScoreBase(sport, l.raw)
      if (!Object.keys(base).length) continue
      add((weekly[l.externalId] ??= {})[week] ??= {}, base)
      add((daily[l.externalId] ??= {})[g.game_date] ??= {}, base)
    }
    if (++done % 100 === 0) console.log(`  …${done}/${toPull.length}`)
  }

  // Apply weekly-derived categories (bonuses / tiers / dd) on the summed totals.
  const outWeekly: Record<string, Record<number, Record<string, number>>> = {}
  for (const [ext, byWeek] of Object.entries(weekly)) {
    outWeekly[ext] = {}
    for (const [w, s] of Object.entries(byWeek)) outWeekly[ext][+w] = deriveWeekly(sport, s)
  }
  const outDaily: Record<string, Record<string, Record<string, number>>> = {}
  for (const [ext, byDay] of Object.entries(daily)) {
    outDaily[ext] = {}
    for (const [d, s] of Object.entries(byDay)) outDaily[ext][d] = deriveWeekly(sport, s)
  }

  // Incremental merge: start from the existing fixture, drop the dirty weeks (and
  // their dates), then overlay the freshly-pulled ones so weekly totals stay correct.
  if (since && existing) {
    const dirtyDates = new Set(toPull.map(g => g.game_date))
    const mergedWeekly = existing.weekly as Record<string, Record<string, Record<string, number>>>
    const mergedDaily = existing.daily as Record<string, Record<string, Record<string, number>>>
    for (const ext of Object.keys(mergedWeekly)) for (const w of Object.keys(mergedWeekly[ext])) if (dirtyWeeks.has(+w)) delete mergedWeekly[ext][w]
    for (const ext of Object.keys(mergedDaily)) for (const d of Object.keys(mergedDaily[ext])) if (dirtyDates.has(d)) delete mergedDaily[ext][d]
    for (const [ext, byWeek] of Object.entries(outWeekly)) for (const [w, s] of Object.entries(byWeek)) (mergedWeekly[ext] ??= {})[w] = s
    for (const [ext, byDay] of Object.entries(outDaily)) for (const [d, s] of Object.entries(byDay)) (mergedDaily[ext] ??= {})[d] = s
    console.log(`  merged ${done} games into existing fixture (${Object.keys(mergedWeekly).length} players)`)
    return { season: CURRENT_SEASON, weekly: mergedWeekly, daily: mergedDaily }
  }

  const players = Object.keys(outWeekly).length
  console.log(`  ${done} games pulled${failed ? `, ${failed} failed` : ''}; ${players} players with real lines`)
  return { season: CURRENT_SEASON, weekly: outWeekly, daily: outDaily }
}

async function main() {
  if (!process.env.TANK01_RAPIDAPI_KEY) { console.error('TANK01_RAPIDAPI_KEY is not set in .env'); process.exit(1) }
  const args = process.argv.slice(2)
  let since = args.find(a => a.startsWith('--since='))?.split('=')[1] ?? null
  // --days=N is a convenience for cron: re-pull weeks with a game in the last N days.
  const days = args.find(a => a.startsWith('--days='))?.split('=')[1]
  if (!since && days && /^\d+$/.test(days)) {
    const d = new Date(Date.now() - +days * 86_400_000)
    since = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  }
  const sportArg = args.find(a => !a.startsWith('--'))?.toUpperCase() as Sport | undefined
  const sports = sportArg && ALL.includes(sportArg) ? [sportArg] : ALL
  if (since && !/^\d{8}$/.test(since)) { console.error('--since must be YYYYMMDD'); process.exit(1) }
  const db = new Database(resolve(process.cwd(), 'data', 'nexus.db'), { readonly: true })
  const outDir = resolve(process.cwd(), 'src/fixtures')
  mkdirSync(outDir, { recursive: true })

  for (const sport of sports) {
    try {
      const data = await pullSport(db, sport, since)
      const file = resolve(outDir, `realstats-${sport}.json`)
      writeFileSync(file, JSON.stringify(data))
      console.log(`  → wrote ${file}`)
    } catch (e) {
      console.error(`  ✗ ${sport} failed:`, (e as Error).message)
    }
  }
  console.log('\nDone. Now run: npm run db:reset')
}

main().catch(e => { console.error(e); process.exit(1) })
