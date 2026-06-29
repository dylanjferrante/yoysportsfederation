/**
 * In-place player sync — refreshes real player data WITHOUT wiping your league.
 *
 * Unlike `db:reset` (which rebuilds everything from scratch), this updates the
 * existing players table in place by external id — names, teams, injury status,
 * headshots, and projections — and inserts any brand-new players as free agents.
 * Rosters, trades, matchups, and settings are left untouched.
 *
 *   npm run tank01:pull        # fetch fresh data into src/fixtures (uses quota)
 *   npm run tank01:sync        # apply fixtures to the live DB (no network)
 *
 * Run pull occasionally; run sync whenever you want the DB to reflect it.
 */
import Database from 'better-sqlite3'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { nanoid } from 'nanoid'

const SPORTS = ['NFL', 'NBA', 'NHL', 'MLB']
const GAMES: Record<string, number> = { NFL: 17, NBA: 70, NHL: 70, MLB: 90 }

type PulledPlayer = {
  externalId: string; name: string; sport: string; position: string; team: string
  status: string; injuryNote: string; photoUrl: string | null; isRookie: boolean
  projectedPoints: number; stats: Record<string, number>
}

const db = new Database(resolve(process.cwd(), 'data', 'nexus.db'))
db.pragma('foreign_keys = ON')

const findByExt = db.prepare('SELECT id FROM players WHERE external_id = ? AND sport = ?')
const updatePlayer = db.prepare(`
  UPDATE players SET name=@name, position=@position, real_team=@real_team, real_team_abbr=@real_team_abbr,
    status=@status, injury_note=@injury_note, photo_url=@photo_url, is_rookie=@is_rookie,
    projected_points=@projected_points, weekly_avg=@weekly_avg, stats=@stats, updated_at=datetime('now')
  WHERE id=@id`)
const insertPlayer = db.prepare(`
  INSERT INTO players (id,external_id,name,sport,position,eligible_positions,real_team,real_team_abbr,status,injury_note,photo_url,is_rookie,season_points,weekly_avg,projected_points,stats)
  VALUES (@id,@external_id,@name,@sport,@position,@eligible_positions,@real_team,@real_team_abbr,@status,@injury_note,@photo_url,@is_rookie,@season_points,@weekly_avg,@projected_points,@stats)`)

function syncSport(sport: string): { updated: number; inserted: number } | null {
  const file = resolve(process.cwd(), 'src/fixtures', `tank01-${sport}.json`)
  if (!existsSync(file)) return null
  let rows: PulledPlayer[]
  try { rows = JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
  if (!Array.isArray(rows) || !rows.length) return null
  const games = GAMES[sport] ?? 17

  let updated = 0, inserted = 0
  const tx = db.transaction(() => {
    for (const p of rows) {
      const proj = +(p.projectedPoints || 0).toFixed(1)
      const common = {
        name: p.name, position: p.position || 'UTIL',
        real_team: p.team || '', real_team_abbr: p.team || '',
        status: p.status || 'ACTIVE', injury_note: p.injuryNote || null, photo_url: p.photoUrl ?? null,
        is_rookie: p.isRookie ? 1 : 0, projected_points: proj, weekly_avg: proj,
        stats: JSON.stringify(p.stats || {}),
      }
      const existing = findByExt.get(p.externalId, sport) as { id: string } | undefined
      if (existing) { updatePlayer.run({ ...common, id: existing.id }); updated++ }
      else {
        insertPlayer.run({
          id: `${sport.toLowerCase()}-${p.externalId}`, external_id: p.externalId, sport,
          eligible_positions: JSON.stringify([p.position || 'UTIL']),
          season_points: +(proj * games).toFixed(1), ...common,
        })
        inserted++
      }
    }
  })
  tx()
  return { updated, inserted }
}

const arg = process.argv[2]?.toUpperCase()
const sports = arg && SPORTS.includes(arg) ? [arg] : SPORTS
let any = false
for (const sport of sports) {
  const res = syncSport(sport)
  if (res) { any = true; console.log(`${sport}: updated ${res.updated}, inserted ${res.inserted}`) }
  else console.log(`${sport}: no fixture (run "npm run tank01:pull ${sport}" first)`)
}
console.log(any ? '\n✅ Sync complete — rosters, trades, and settings were left intact.' : '\nNothing to sync.')
