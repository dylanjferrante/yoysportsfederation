import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { nanoid } from 'nanoid'
import { buildDayRows } from '../src/lib/dailygen'
import { weekDateRange } from '../src/lib/defaults'
import { scorePlayer } from '../src/lib/scoring'

// Real per-day box lines (from tank01:realstats). daily[externalId][yyyymmdd] = line.
const REALDAILY: Record<string, Record<string, Record<string, Record<string, number>>> | null> = {}
for (const sport of ['NBA', 'NHL', 'MLB']) {
  try { REALDAILY[sport] = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/fixtures', `realstats-${sport}.json`), 'utf8')).daily }
  catch { REALDAILY[sport] = null }
}

// Non-destructive: derive per-game-day box lines (player_day_stats) for daily
// sports from the existing weekly player_game_stats, so the day-by-day box score
// has real data without a reset. Idempotent — clears and rebuilds each week it
// processes. Going forward the scorer writes these rows itself.

const db = new Database(path.join(process.cwd(), 'data', 'nexus.db'))
const DAILY = new Set(['NBA', 'NHL', 'MLB'])

db.exec(`CREATE TABLE IF NOT EXISTS player_day_stats (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season TEXT NOT NULL, week INTEGER NOT NULL, sport TEXT NOT NULL, date TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id), team_id TEXT REFERENCES teams(id),
  stats TEXT DEFAULT '{}', points REAL DEFAULT 0,
  UNIQUE(league_id, season, player_id, date)
)`)

const weekDates = (season: string, week: number): string[] => {
  const { start } = weekDateRange(season, week)
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}` })
}

const leagues = db.prepare(`SELECT id, scoring_settings FROM leagues`).all() as { id: string; scoring_settings: string | null }[]
const weeklyOf = db.prepare(`SELECT g.player_id, g.team_id, g.stats, p.real_team_abbr, p.external_id FROM player_game_stats g JOIN players p ON p.id = g.player_id WHERE g.league_id=? AND g.season=? AND g.week=? AND g.sport=?`)
const weeksOf = db.prepare(`SELECT DISTINCT season, week, sport FROM player_game_stats WHERE league_id=? AND sport IN ('NBA','NHL','MLB')`)
const clearWeek = db.prepare(`DELETE FROM player_day_stats WHERE league_id=? AND season=? AND week=? AND sport=?`)
const insert = db.prepare(`INSERT OR IGNORE INTO player_day_stats (id,league_id,season,week,sport,date,player_id,team_id,stats,points) VALUES (?,?,?,?,?,?,?,?,?,?)`)

let weeks = 0, rows = 0
for (const lg of leagues) {
  const scoringAll = (() => { try { return JSON.parse(lg.scoring_settings ?? '{}') } catch { return {} } })()
  const combos = weeksOf.all(lg.id) as { season: string; week: number; sport: string }[]
  for (const { season, week, sport } of combos) {
    if (!DAILY.has(sport)) continue
    const scoring = scoringAll[sport] ?? {}
    const dates = weekDates(season, week)
    const weeklyRows = weeklyOf.all(lg.id, season, week, sport) as { player_id: string; team_id: string | null; stats: string | null; real_team_abbr: string | null; external_id: string | null }[]
    const real = REALDAILY[sport]

    let dayRows: { date: string; playerId: string; teamId: string | null; stats: Record<string, number>; points: number }[]
    if (real) {
      // Real per-day lines: for each player+date the fixture has, score the real
      // stat line. No synthetic distribution — days with no game simply have no row.
      dayRows = []
      for (const r of weeklyRows) {
        const byDay = r.external_id ? real[r.external_id] : undefined
        if (!byDay) continue
        for (const date of dates) {
          const s = byDay[date.replace(/-/g, '')]
          if (!s) continue
          dayRows.push({ date, playerId: r.player_id, teamId: r.team_id, stats: s, points: +scorePlayer(s, scoring).toFixed(1) })
        }
      }
    } else {
      const weekly = weeklyRows.map(r => ({ playerId: r.player_id, teamId: r.team_id, realTeamAbbr: r.real_team_abbr, stats: (() => { try { return JSON.parse(r.stats ?? '{}') } catch { return {} } })() }))
      dayRows = buildDayRows(sport, `${lg.id}:${season}:${week}`, dates, scoring, weekly)
    }
    clearWeek.run(lg.id, season, week, sport)
    for (const d of dayRows) { insert.run(nanoid(), lg.id, season, week, sport, d.date, d.playerId, d.teamId, JSON.stringify(d.stats), d.points); rows++ }
    weeks++
  }
}
console.log(`Backfilled ${rows} day rows across ${weeks} sport-week(s).`)
