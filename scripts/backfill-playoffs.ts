import Database from 'better-sqlite3'
import path from 'path'
import { nanoid } from 'nanoid'
import { seasonAnchor } from '../src/lib/defaults'

// Non-destructive: reconstruct a WINNERS playoff bracket for any past season
// that has a recorded champion (league_history) but no playoff_games rows —
// e.g. the seeded example league's prior seasons, or an imported history. The
// bracket is seeded by each sport's final standings (finish_position) and played
// out so the recorded champion advances to and wins the final. Existing playoff
// data is never touched.
//
// It also resolves the CURRENT season's playoffs (see the second pass below):
// the seed lays down each sport's round-1 games but can't score them (there are
// no per-week stat lines), so they sit incomplete. Since the scoreboard treats
// the earliest incomplete week as "this week", those stuck games pin the current
// week to the football playoffs in December. Here we simulate the results for any
// playoff round whose calendar week is already in the past — mirroring the app's
// bracket logic in src/lib/advance.ts — which leaves the current week where it
// belongs and crowns the sports whose seasons have finished.

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

// ── Current-season pass ──────────────────────────────────────────────────────
// Play out each in-progress season's playoffs for rounds already in the past.
type CurLeague = { id: string; season: string; season_start: string | null; playoff_teams: number | null; playoff_reseed: number | null; sport_schedule: string | null; sports_enabled: string | null }
type PoGame = {
  id: string; sport: string; round: number; match_index: number; bracket: string | null
  home_seed: number | null; away_seed: number | null; home_team_id: string | null; away_team_id: string | null
  winner_team_id: string | null; is_complete: number
}
const curLeagues = db.prepare(`SELECT id, season, season_start, playoff_teams, playoff_reseed, sport_schedule, sports_enabled FROM leagues`).all() as CurLeague[]
const regIncomplete = db.prepare(`SELECT 1 FROM matchups WHERE league_id=? AND season=? AND sport=? AND is_complete=0 LIMIT 1`)
const standingsOf = db.prepare(`SELECT team_id, wins, points_for FROM team_records WHERE league_id=? AND season=? AND sport=?`)
const poGamesOf = db.prepare(`SELECT id, sport, round, match_index, bracket, home_seed, away_seed, home_team_id, away_team_id, winner_team_id, is_complete FROM playoff_games WHERE league_id=? AND season=? AND sport=? AND COALESCE(bracket,'WINNERS')='WINNERS' ORDER BY round, match_index`)
const completeGame = db.prepare(`UPDATE playoff_games SET home_score=?, away_score=?, winner_team_id=?, is_complete=1 WHERE id=?`)
const markChampion = db.prepare(`UPDATE team_records SET is_champion=1 WHERE league_id=? AND season=? AND sport=? AND team_id=?`)
const histExists = db.prepare(`SELECT 1 FROM league_history WHERE league_id=? AND season=? AND scope=? LIMIT 1`)
const insertHist = db.prepare(`INSERT INTO league_history (id,league_id,season,scope,champion_team_id,runner_up_team_id,note) VALUES (?,?,?,?,?,?,?)`)
const WEEK_MS = 7 * 86_400_000

let poResolved = 0, crowned = 0
for (const lg of curLeagues) {
  const sports: string[] = (() => { try { return JSON.parse(lg.sports_enabled ?? '[]') } catch { return [] } })()
  const schedule: { sport: string; endWeek: number }[] = (() => { try { return JSON.parse(lg.sport_schedule ?? '[]') } catch { return [] } })()
  const reseed = !!lg.playoff_reseed
  // Federation week that contains today, from the same anchor the app uses.
  const target = Math.floor((Date.now() - seasonAnchor(lg.season, lg.season_start ?? 'FOOTBALL')) / WEEK_MS) + 1

  for (const sport of sports) {
    const regEnd = schedule.find(s => s.sport === sport)?.endWeek ?? 0
    if (!regEnd || target < regEnd + 1) continue          // playoffs haven't started
    if (regIncomplete.get(lg.id, lg.season, sport)) continue // regular season still running

    // The seed lays down round 1 lazily via the app, so it may not exist yet at
    // reset time. If there's no bracket, build round 1 from final standings using
    // the same seeding the app uses (runPlayoffs), so the app later finds a
    // finished bracket instead of recreating a stuck one.
    if (!(poGamesOf.all(lg.id, lg.season, sport) as PoGame[]).length) {
      const nTeams = Math.max(2, lg.playoff_teams ?? 4)
      const pool = (standingsOf.all(lg.id, lg.season, sport) as { team_id: string; wins: number | null; points_for: number | null }[])
        .sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0) || (b.points_for ?? 0) - (a.points_for ?? 0))
        .slice(0, nTeams)
      if (pool.length < 2) continue
      const size = pow2(pool.length)
      const order = seedOrder(size)
      for (let i = 0, mi = 0; i < size; i += 2, mi++) {
        const hSeed = order[i], aSeed = order[i + 1]
        const home = pool[hSeed - 1], away = pool[aSeed - 1]
        insert.run(nanoid(), lg.id, lg.season, sport, 1, mi, 'WINNERS',
          home ? hSeed : null, away ? aSeed : null, home?.team_id ?? null, away?.team_id ?? null, 0, 0, null, 0)
      }
    }

    let safety = 0
    while (safety++ < 12) {
      const games = poGamesOf.all(lg.id, lg.season, sport) as PoGame[]
      if (!games.length) break
      const rounds = [...new Set(games.map(g => g.round))].sort((a, b) => a - b)
      const curRound = rounds.find(r => games.some(g => g.round === r && !g.is_complete))
      if (curRound == null) break
      if (target < regEnd + curRound) break                // this round is still in the future

      const roundGames = games.filter(g => g.round === curRound).sort((a, b) => a.match_index - b.match_index)
      const completed: { teamId: string | null; seed: number | null }[] = []
      for (const g of roundGames) {
        let winner = g.winner_team_id
        if (!g.is_complete) {
          let hs = 0, as = 0
          if (g.home_team_id && !g.away_team_id) winner = g.home_team_id           // bye
          else if (!g.home_team_id && g.away_team_id) winner = g.away_team_id       // bye
          else if (g.home_team_id && g.away_team_id) {
            const h = hash(`${lg.id}:${lg.season}:${sport}:${curRound}:${g.match_index}`)
            const lo = 84 + (h % 38), hi = lo + 3 + ((h >> 5) % 22)
            const homeWins = (g.home_seed ?? 99) <= (g.away_seed ?? 99)             // higher (lower-numbered) seed wins
            hs = homeWins ? hi : lo; as = homeWins ? lo : hi
            winner = homeWins ? g.home_team_id : g.away_team_id
          }
          completeGame.run(hs, as, winner, g.id)
          poResolved++
        }
        completed.push({ teamId: winner, seed: winner === g.home_team_id ? g.home_seed : g.away_seed })
      }

      if (completed.length === 1) {
        const champ = completed[0].teamId
        if (champ && !histExists.get(lg.id, lg.season, sport)) {
          markChampion.run(lg.id, lg.season, sport, champ)
          const runner = roundGames[0].home_team_id === champ ? roundGames[0].away_team_id : roundGames[0].home_team_id
          insertHist.run(nanoid(), lg.id, lg.season, sport, champ, runner ?? null, null)
          crowned++
        }
        break
      }
      // Seed the next round from this round's advancers (reseed by seed if enabled).
      let pairs = completed
      if (reseed) {
        const withTeam = completed.filter(c => c.teamId).sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99))
        pairs = []
        let lo = 0, hi = withTeam.length - 1
        while (lo < hi) { pairs.push(withTeam[lo]); pairs.push(withTeam[hi]); lo++; hi-- }
        if (lo === hi) { pairs.push(withTeam[lo]); pairs.push({ teamId: null, seed: null }) }
      }
      for (let j = 0; j < pairs.length; j += 2) {
        const a = pairs[j], b = pairs[j + 1]
        insert.run(nanoid(), lg.id, lg.season, sport, curRound + 1, j / 2, 'WINNERS',
          a?.seed ?? null, b?.seed ?? null, a?.teamId ?? null, b?.teamId ?? null, 0, 0, null, 0)
      }
    }
  }
}

console.log(`Backfilled ${brackets} bracket(s), ${created} playoff game(s).`)
if (poResolved) console.log(`Resolved ${poResolved} current-season playoff game(s); crowned ${crowned} sport champion(s).`)
