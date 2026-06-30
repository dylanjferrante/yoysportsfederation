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

const NFL: Aliases = {
  passingYards: ['passyds', 'passingyards'],
  passingTD: ['passtd', 'passingtd', 'passtds'],
  passingInt: ['int', 'interceptions', 'passingint'],
  passingCompletions: ['passcompletions', 'completions', 'cmp'],
  passingAttempts: ['passattempts', 'passatt'],
  sacked: ['sacked', 'timessacked'],
  rushingYards: ['rushyds', 'rushingyards'],
  rushingTD: ['rushtd', 'rushingtd', 'rushtds'],
  rushingAttempts: ['carries', 'rushatt', 'rushingattempts'],
  receptions: ['receptions', 'rec'],
  receivingYards: ['recyds', 'receivingyards'],
  receivingTD: ['rectd', 'receivingtd', 'rectds'],
  targets: ['targets'],
  fumbles: ['fumbles'],
  fumbleLost: ['fumByplayer', 'fumbleslost', 'fumlost'],
  // Kicking
  xpMade: ['xpmade'],
  xpMissed: ['xpmissed'],
  // Defense / special teams (IDP or DST)
  sack: ['sacks', 'defsacks'],
  interception: ['defensiveinterceptions', 'defint', 'interceptionsdefense'],
  fumbleRecovery: ['fumblesrecovered', 'fumrec'],
  defensiveTD: ['deftd', 'defensivetd'],
  specialTeamsTD: ['sttd', 'specialteamstd', 'kickreturntds', 'puntreturntds'],
  safeties: ['safeties'],
  blockedKick: ['blockkick', 'blockedkicks'],
}

const NBA: Aliases = {
  points: ['pts', 'points'],
  offRebounds: ['oreb', 'offreb', 'offensiverebounds'],
  defRebounds: ['dreb', 'defreb', 'defensiverebounds'],
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
}

const NHL: Aliases = {
  goals: ['goals', 'g'],
  assists: ['assists', 'a'],
  plusMinus: ['plusminus', 'plusmin'],
  penaltyMinutes: ['penaltyminutes', 'pim'],
  shotsOnGoal: ['shots', 'sog', 'shotsongoal'],
  ppGoals: ['powerplaypoints', 'ppgoals', 'ppg'],
  ppAssists: ['ppassists'],
  shGoals: ['shorthandedgoals', 'shgoals', 'shg'],
  gwGoals: ['gamewinninggoals', 'gwg'],
  hits: ['hits'],
  blockedShots: ['blockedshots', 'blocks'],
  faceoffsWon: ['faceoffswon', 'faceoffwins'],
  // Goalies
  wins: ['wins'],
  saves: ['saves'],
  goalsAllowed: ['goalsagainst', 'ga'],
  shutout: ['shutouts', 'so'],
}

const MLB: Aliases = {
  runs: ['runs', 'r'],
  doubles: ['doubles', '2b'],
  triples: ['triples', '3b'],
  homeRuns: ['homeruns', 'hr'],
  rbi: ['rbi'],
  walks: ['basesonballs', 'walks', 'bb'],
  hbp: ['hitbypitch', 'hbp'],
  stolenBases: ['stolenbases', 'sb'],
  caughtStealing: ['caughtstealing', 'cs'],
  strikeoutsAsBatter: ['strikeouts', 'so'],
  // Pitching
  inningsPitched: ['inningspitched', 'ip'],
  strikeoutsAsPitcher: ['pitchingstrikeouts', 'strikeoutspitching', 'k'],
  wins: ['win', 'wins', 'w'],
  losses: ['loss', 'losses', 'l'],
  earnedRunsAllowed: ['earnedruns', 'er'],
  hitsAllowed: ['hitsallowed'],
  walksAllowed: ['walksallowed'],
  saves: ['save', 'saves', 'sv'],
  holds: ['holds', 'hld'],
  blownSaves: ['blownsaves', 'bs'],
  completeGame: ['completegames', 'cg'],
  shutoutPitching: ['shutouts', 'sho'],
}

const ALIASES: Record<string, Aliases> = { NFL, NBA, NHL, MLB }

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

// Map ONE game's box-score entry for a player to our base scoring keys (no
// game-level bonuses — those are derived once per fantasy week from the totals).
export function mapBoxScoreBase(sport: string, raw: any): Record<string, number> {
  const flat = flattenDeep(raw)
  const out = extract(ALIASES[sport] ?? {}, flat)
  // Stash total hits for MLB single-derivation at week level.
  if (sport === 'MLB') { const h = flat['hits'] ?? flat['h']; if (h != null) (out as any).__hits = h }
  return out
}

// Compute weekly derived categories (bonuses/tiers/dd) on the SUMMED base totals.
export function deriveWeekly(sport: string, summed: Record<string, number>): Record<string, number> {
  const fn = DERIVE[sport]
  return fn ? fn(summed) : summed
}
