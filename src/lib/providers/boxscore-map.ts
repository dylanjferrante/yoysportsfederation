// ── Tank01 box-score → our scoring-key mapper ────────────────────────────────
// A real box score is the per-player stat line for a finished game. The scoring
// engine (scorePlayer) does a dot-product of a stat line against a league's
// scoring weights, so the stat line MUST use OUR scoring keys (passingYards,
// rebounds, goals, …) — not Tank01's raw field names (passYds, reb, G).
//
// Tank01's exact box-score field names vary by sport and aren't guaranteed
// stable, so this maps by ALIASES: each scoring key lists the candidate source
// field names, matched case-insensitively against a deep-flattened box score.
// Confirm/extend the aliases against a live response with:
//   npm run tank01:probe NFL getNFLBoxScore gameID=<id>
//
// Non-linear categories (yardage bonuses, points-allowed tiers, double-doubles,
// singles) aren't raw fields — they're DERIVED here from the base counts.

const num = (v: unknown): number => {
  const x = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0
  return Number.isFinite(x) ? x : 0
}

// Flatten a nested box-score object to a flat { lowercasedLeafKey: number } map.
// Nested groups (Passing/Rushing/… for NFL) collapse to their leaf field names.
function flattenDeep(raw: any, out: Record<string, number> = {}): Record<string, number> {
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) flattenDeep(v, out)
    else {
      const nv = num(v)
      // Keep the first non-zero we see for a leaf name; otherwise record 0.
      const key = k.toLowerCase()
      if (!(key in out) || (out[key] === 0 && nv !== 0)) out[key] = nv
    }
  }
  return out
}

// scoringKey → candidate Tank01 leaf field names (lowercased). First hit wins.
type Aliases = Record<string, string[]>

// NFL — VERIFIED against a live getNFLBoxScore (game 20260104_NYJ@BUF). Field
// names are the leaf keys inside Tank01's per-player groups (Passing/Rushing/
// Receiving/Kicking/Punting/Defense), lowercased by flattenDeep.
const NFL: Aliases = {
  passingYards: ['passyds', 'passingyards'],
  passingTD: ['passtd', 'passingtd', 'passtds'],
  passingInt: ['int', 'interceptions', 'passingint'],
  passing2pt: ['passingtwopointconversion', 'passing2pt'],
  passingCompletions: ['passcompletions', 'completions', 'cmp'],
  passingAttempts: ['passattempts', 'passatt'],
  sacked: ['sacked', 'timessacked'], // value is "sacks-yards" e.g. "3-21"; num() → sack count
  rushingYards: ['rushyds', 'rushingyards'],
  rushingTD: ['rushtd', 'rushingtd', 'rushtds'],
  rushingAttempts: ['carries', 'rushatt', 'rushingattempts'],
  receptions: ['receptions', 'rec'],
  receivingYards: ['recyds', 'receivingyards'],
  receivingTD: ['rectd', 'receivingtd', 'rectds'],
  receiving2pt: ['receivingtwopointconversion', 'receiving2pt'],
  targets: ['targets'],
  fumbles: ['fumbles'],
  fumbleLost: ['fumbleslost', 'fumlost'], // appears in a per-player Fumbles group when a fumble occurs
  // Kicking
  fgMissed: ['fgmissed'],
  xpMade: ['xpmade'],
  xpMissed: ['xpmissed'],
  // Special-teams return TDs (live under Kicking/Punting groups; field is singular "...TD")
  specialTeamsTD: ['kickreturntd', 'puntreturntd', 'sttd', 'specialteamstd'],
  // Individual-defender stats (per-player Defense group)
  sack: ['sacks', 'defsacks'],
  interception: ['defensiveinterceptions', 'defint', 'interceptionsdefense'],
  defensiveTD: ['deftd', 'defensivetd'],
  // NOTE: team-defense (DST) categories — fumbleRecovery, safeties, blockedKick,
  // ptsAllowed*/yardsAllowed* tiers — and FG-by-distance (fgMade0_39/40_49/50plus)
  // are NOT per-player leaf fields. DST aggregates live in the box score's
  // top-level `DST` block (not `playerStats`), and FG distance must be parsed
  // from `scoringPlays`. Both need ingestion-layer changes beyond this mapper.
}

// NBA — VERIFIED against a live getNBABoxScore (game 20260115_MIL@SA). Flat
// per-player fields. fieldGoalsMissed / freeThrowsMissed aren't raw fields; they
// are DERIVED (attempts − makes) in deriveNBA from the helper __fga / __fta.
const NBA: Aliases = {
  points: ['pts', 'points'],
  offRebounds: ['offreb', 'oreb', 'offensiverebounds'],
  defRebounds: ['defreb', 'dreb', 'defensiverebounds'],
  rebounds: ['reb', 'totreb', 'rebounds'],
  assists: ['ast', 'assists'],
  steals: ['stl', 'steals'],
  blocks: ['blk', 'blocks'],
  turnovers: ['tov', 'turnovers'],
  threesMade: ['tptfgm', 'tptfg', 'threesmade', 'fg3m'],
  fieldGoalsMade: ['fgm', 'fieldgoalsmade'],
  freeThrowsMade: ['ftm', 'freethrowsmade'],
  personalFouls: ['pf', 'personalfouls', 'fouls'],
  minutes: ['mins', 'minutes', 'min'],
  __fga: ['fga'], // helper for fieldGoalsMissed (deleted after derive)
  __fta: ['fta'], // helper for freeThrowsMissed
}

// NHL — VERIFIED against a live getNHLBoxScore (game 20260115_SJ@WSH). Skaters and
// goalies share one flat playerStats map. Goalie win/shutout/OT-loss come from the
// `goalieDecision` STRING (W/L/OTL), handled per-game in applyNHLGoalie — not here.
const NHL: Aliases = {
  goals: ['goals', 'g'],
  assists: ['assists', 'a'],
  plusMinus: ['plusminus', 'plusmin'],
  penaltyMinutes: ['penaltiesinminutes', 'penaltyminutes', 'pim'],
  shotsOnGoal: ['shots', 'sog', 'shotsongoal'],
  ppGoals: ['powerplaygoals', 'ppgoals', 'ppg'], // NOT powerPlayPoints (= PP goals + PP assists)
  ppAssists: ['powerplayassists', 'ppassists'],
  shGoals: ['shorthandedgoals', 'shgoals', 'shg'], // unverified: no SH goal in sample game
  shAssists: ['shorthandedassists', 'shassists'],  // unverified: no SH assist in sample game
  gwGoals: ['gamewinninggoals', 'gwg'],            // unverified: GWG is derived from scoringPlays, not a leaf field
  hits: ['hits'],
  blockedShots: ['blockedshots', 'blocks'],
  faceoffsWon: ['faceoffswon', 'faceoffwins'],
  faceoffsLost: ['faceoffslost'],
  // Goalies (saves / goals-against are real leaf fields; win/shutout/OTL derived from goalieDecision)
  saves: ['saves'],
  goalsAllowed: ['goalsagainst', 'ga'],
}

// MLB is handled by a dedicated group-aware mapper (mapMLB), NOT flat aliases:
// a Tank01 MLB box score gives EVERY player all of Hitting/Pitching/BaseRunning/
// Fielding (zero-filled), and those groups SHARE leaf names (H, R, BB, SO, HR,
// HBP). A flat "first non-zero wins" merge can't tell a batter's strikeouts from
// a pitcher's, or hits-for from hits-allowed — so MLB must read by group.

const ALIASES: Record<string, Aliases> = { NFL, NBA, NHL }

// "6.2" innings = 6 innings + 2 outs = 6⅔. Convert to a true decimal so per-inning
// scoring (e.g. 2.25 pts/IP) credits each out as ⅓ inning, not a literal ".2".
function inningsOuts(v: unknown): number {
  const s = String(v ?? '').trim()
  if (!s) return 0
  const [whole, frac] = s.split('.')
  const w = parseInt(whole, 10) || 0
  const outs = frac ? (parseInt(frac, 10) || 0) : 0
  return w + outs / 3
}

// Map ONE MLB player's box-score entry to our scoring keys, reading each stat from
// its specific group so batting/pitching never collide. Verified against a live
// getMLBBoxScore (game 20250920_SEA@HOU). Accepts either the real grouped shape or
// a flat batting object (used by unit tests / simpler callers).
function mapMLB(raw: any): Record<string, number> {
  const grouped = !!(raw && (raw.Hitting || raw.Pitching || raw.BaseRunning))
  const H = grouped ? (raw.Hitting ?? {}) : (raw ?? {})
  const P = grouped ? (raw.Pitching ?? {}) : {}
  const BR = grouped ? (raw.BaseRunning ?? {}) : (raw ?? {})
  const out: Record<string, number> = {}
  const put = (k: string, v: number) => { if (v) out[k] = v } // omit zeros to keep stat lines lean

  // Batting (Hitting group)
  put('runs', num(H['R']))
  put('doubles', num(H['2B']))
  put('triples', num(H['3B']))
  put('homeRuns', num(H['HR']))
  put('rbi', num(H['RBI']))
  put('walks', num(H['BB']))
  put('hbp', num(H['HBP']))
  put('strikeoutsAsBatter', num(H['SO']))
  put('sacFly', num(H['SF']))
  // Base running
  put('stolenBases', num(BR['SB']))
  put('caughtStealing', num(BR['CS']))

  // Pitching (Pitching group)
  const ip = inningsOuts(P['InningsPitched'] ?? P['inningsPitched'])
  put('inningsPitched', ip)
  put('strikeoutsAsPitcher', num(P['SO']))
  put('earnedRunsAllowed', num(P['ER']))
  put('hitsAllowed', num(P['H']))
  put('walksAllowed', num(P['BB']))

  // Pitching decisions are per-game events (W/L/S/H). Stored as 0/1 counts so a
  // week with two saves sums to two. Tank01 uses single-letter codes here.
  const dec = String(P['decision'] ?? '').trim().toUpperCase()
  put('wins', dec === 'W' ? 1 : 0)
  put('losses', dec === 'L' ? 1 : 0)
  put('saves', dec === 'S' || dec === 'SV' || dec === 'SAVE' ? 1 : 0)
  put('holds', dec === 'H' || dec === 'HLD' || dec === 'HOLD' ? 1 : 0)

  // Quality start: the game's starting pitcher (pitchingOrder 1) with ≥6 IP, ≤3 ER.
  const startedAsPitcher = String(P['pitchingOrder'] ?? '') === '1'
  if (startedAsPitcher && ip >= 6 && num(P['ER']) <= 3) out.qualityStart = 1

  // Stash total hits so deriveMLB can compute singles at week level.
  const hits = num(H['H'])
  if (hits) (out as any).__hits = hits
  return out
}

function extract(aliases: Aliases, flat: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [scoringKey, candidates] of Object.entries(aliases)) {
    for (const c of candidates) if (c in flat) { out[scoringKey] = flat[c]; break }
  }
  return out
}

// Add non-linear / derived categories from the base counts so the scoring engine
// (which just dot-products) can credit bonuses and tiers. Mutates and returns.
function deriveNFL(s: Record<string, number>): Record<string, number> {
  const py = s.passingYards ?? 0, ry = s.rushingYards ?? 0, recy = s.receivingYards ?? 0
  if (py >= 400) s.passing400Bonus = 1; else if (py >= 300) s.passing300Bonus = 1
  if (ry >= 200) s.rushing200Bonus = 1; else if (ry >= 100) s.rushing100Bonus = 1
  if (recy >= 200) s.receiving200Bonus = 1; else if (recy >= 100) s.receiving100Bonus = 1
  return s
}
function deriveNBA(s: Record<string, number>): Record<string, number> {
  // Missed shots = attempts − makes (Tank01 gives attempts/makes, not misses).
  const fga = (s as any).__fga, fta = (s as any).__fta
  if (fga != null) { s.fieldGoalsMissed = Math.max(0, fga - (s.fieldGoalsMade ?? 0)); delete (s as any).__fga }
  if (fta != null) { s.freeThrowsMissed = Math.max(0, fta - (s.freeThrowsMade ?? 0)); delete (s as any).__fta }
  // Total rebounds from splits if a combined figure wasn't provided.
  if (s.rebounds == null && (s.offRebounds != null || s.defRebounds != null)) {
    s.rebounds = (s.offRebounds ?? 0) + (s.defRebounds ?? 0)
  }
  const cats = [s.points ?? 0, s.rebounds ?? 0, s.assists ?? 0, s.steals ?? 0, s.blocks ?? 0]
  const dd = cats.filter(v => v >= 10).length
  if (dd >= 3) s.tripleDouble = 1
  else if (dd >= 2) s.doubleDouble = 1
  return s
}
function deriveMLB(s: Record<string, number>): Record<string, number> {
  // Singles aren't a raw field: hits − (2B + 3B + HR). Needs a total-hits source.
  const hits = (s as any).__hits
  if (hits != null) {
    s.singles = Math.max(0, hits - (s.doubles ?? 0) - (s.triples ?? 0) - (s.homeRuns ?? 0))
    delete (s as any).__hits
  }
  return s
}

const DERIVE: Record<string, (s: Record<string, number>) => Record<string, number>> = {
  NFL: deriveNFL, NBA: deriveNBA, MLB: deriveMLB,
}

// NHL goalie win/shutout/OT-loss are PER-GAME events encoded in the `goalieDecision`
// string (W/L/OTL), not numeric leaf fields — so they're set here as 0/1 counts
// (summable across a week) rather than via aliases. Skaters have no goalieDecision.
function applyNHLGoalie(raw: any, out: Record<string, number>): void {
  const dec = String(raw?.goalieDecision ?? '').trim().toUpperCase()
  if (!dec) return // not a goalie (or no decision)
  if (dec === 'W') out.wins = 1
  else if (dec === 'OTL' || dec === 'OT' || dec === 'SOL') out.overtimeLoss = 1
  // Shutout: a winning goalie who allowed no (regulation/OT) goals.
  if (dec === 'W' && num(raw?.goalsAgainst) === 0) out.shutout = 1
}

// Map ONE game's box-score entry for a player to our base scoring keys (no
// game-level bonuses — those are derived once per fantasy week from the totals).
export function mapBoxScoreBase(sport: string, raw: any): Record<string, number> {
  // MLB needs group-aware extraction (shared Hitting/Pitching leaf names).
  if (sport === 'MLB') return mapMLB(raw)
  const flat = flattenDeep(raw)
  const out = extract(ALIASES[sport] ?? {}, flat)
  if (sport === 'NHL') applyNHLGoalie(raw, out)
  return out
}

// Compute weekly derived categories (bonuses/tiers/dd) on the SUMMED base totals.
export function deriveWeekly(sport: string, summed: Record<string, number>): Record<string, number> {
  const fn = DERIVE[sport]
  return fn ? fn(summed) : summed
}
