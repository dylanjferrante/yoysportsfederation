import Database from 'better-sqlite3'
import path from 'path'
import { nanoid } from 'nanoid'

// Non-destructive: reconstruct a WINNERS playoff bracket for any past season
// that has a recorded champion (league_history) but no playoff_games rows —
// e.g. the seeded example league's prior seasons, or an imported history. The
// bracket is seeded by each sport's final standings (finish_position) and played
// out so the recorded champion advances to and wins the final. Existing playoff
// data is never touched.

const db = new Database(path.join(process.cwd(), 'data', 'nexus.db'))

function seedOrder(n: number): number[] {
  let r = [1, 2]
  while (r.length < n) { const len = r.length * 2 + 1; const next: number[] = []; for (const s of r) { next.push(s); next.push(len - s) } r = next }
  return r
}
const pow2 = (n: number) => { let p = 1; while (p < n) p <<= 1; return p }
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h }

type LeagueRow = { id: string; season: string; playoff_teams: number | null; sports_enabled: string | null }
type Rec = { team_id: string; finish_position: number | null; wins: number | null }

const leagues = db.prepare(`SELECT id, season, playoff_teams, sports_enabled FROM leagues`).all() as LeagueRow[]
const insert = db.prepare(`INSERT INTO playoff_games (id,league_id,season,sport,round,match_index,bracket,home_seed,away_seed,home_team_id,away_team_id,home_score,away_score,winner_team_id,is_complete) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
const hasGames = db.prepare(`SELECT 1 FROM playoff_games WHERE league_id=? AND season=? AND sport=? LIMIT 1`)
const champOf = db.prepare(`SELECT champion_team_id FROM league_history WHERE league_id=? AND season=? AND scope=? LIMIT 1`)
const recsOf = db.prepare(`SELECT team_id, finish_position, wins FROM team_records WHERE league_id=? AND season=? AND sport=?`)
const seasonsOf = db.prepare(`SELECT DISTINCT season FROM league_history WHERE league_id=?`)

let created = 0, brackets = 0
for (const lg of leagues) {
  const sports: string[] = (() => { try { return JSON.parse(lg.sports_enabled ?? '[]') } catch { return [] } })()
  const n = Math.max(2, lg.playoff_teams ?? 4)
  const seasons = (seasonsOf.all(lg.id) as { season: string }[]).map(r => r.season).filter(s => s !== lg.season)
  for (const season of seasons) {
    for (const sport of sports) {
      if (hasGames.get(lg.id, season, sport)) continue
      const champId = (champOf.get(lg.id, season, sport) as { champion_team_id: string | null } | undefined)?.champion_team_id ?? null
      const recs = (recsOf.all(lg.id, season, sport) as Rec[])
        .sort((a, b) => (a.finish_position ?? 99) - (b.finish_position ?? 99) || (b.wins ?? 0) - (a.wins ?? 0))
        .slice(0, n)
      if (recs.length < 2) continue

      const size = pow2(recs.length)
      const seeds: (string | null)[] = Array.from({ length: size }, (_, i) => recs[i]?.team_id ?? null)
      let alive = seedOrder(size).map(seed => ({ seed, teamId: seeds[seed - 1] ?? null }))
      const totalRounds = Math.round(Math.log2(size))

      for (let round = 1; round <= totalRounds; round++) {
        const next: typeof alive = []
        for (let i = 0, mi = 0; i < alive.length; i += 2, mi++) {
          const home = alive[i], away = alive[i + 1]
          let winner: typeof home
          if (!home.teamId) winner = away
          else if (!away.teamId) winner = home
          else if (home.teamId === champId) winner = home
          else if (away.teamId === champId) winner = away
          else winner = home.seed < away.seed ? home : away

          const h = hash(`${lg.id}:${season}:${sport}:${round}:${mi}`)
          const loScore = 84 + (h % 38)
          const hiScore = loScore + 3 + ((h >> 5) % 22)
          const homeWins = winner === home
          const homeScore = away.teamId ? (homeWins ? hiScore : loScore) : hiScore
          const awayScore = away.teamId ? (homeWins ? loScore : hiScore) : 0

          insert.run(nanoid(), lg.id, season, sport, round, mi, 'WINNERS',
            home.teamId ? home.seed : null, away.teamId ? away.seed : null,
            home.teamId, away.teamId, homeScore, awayScore, winner.teamId, 1)
          created++
          next.push(winner)
        }
        alive = next
      }
      brackets++
    }
  }
}

console.log(`Backfilled ${brackets} bracket(s), ${created} playoff game(s).`)
