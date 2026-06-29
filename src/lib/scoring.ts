// Fantasy scoring engine: turn a player's stat line into fantasy points using a
// league's scoring settings, and (until the live sports APIs are wired up on
// deployment) generate plausible weekly stat lines so matchups can be scored.

export type Stats = Record<string, number>

// Points = dot product of the stat line with the league's per-stat values.
export function scorePlayer(stats: Stats, scoring: Record<string, number>): number {
  let total = 0
  for (const [k, v] of Object.entries(stats)) total += v * (scoring[k] ?? 0)
  return +total.toFixed(1)
}

const rnd = () => Math.random()
const pois = (lambda: number) => {
  if (lambda <= 0) return 0
  const L = Math.exp(-lambda)
  let k = 0, p = 1
  do { k++; p *= rnd() } while (p > L)
  return k - 1
}
const norm = (mean: number, spread: number) => Math.max(0, Math.round(mean + ((rnd() + rnd() + rnd()) / 1.5 - 1) * spread))
const bern = (p: number) => (rnd() < p ? 1 : 0)

// Generate a single-game stat line. `talent` (~0.4–2.2) scales counting stats so
// stars produce bigger lines; derived from the player's projected points.
export function generateStatLine(sport: string, position: string, talent: number): Stats {
  const t = Math.max(0.35, Math.min(2.4, talent || 1))
  if (sport === 'NFL') return nflStats(position, t)
  if (sport === 'NBA') return nbaStats(t)
  if (sport === 'NHL') return nhlStats(position, t)
  if (sport === 'MLB') return mlbStats(position, t)
  return {}
}

function nflStats(pos: string, t: number): Stats {
  if (pos === 'QB') {
    const py = norm(235 * t, 70)
    return { passingYards: py, passingTD: pois(1.6 * t), passingInt: pois(0.7), passingCompletions: norm(22 * t, 5), passingAttempts: norm(34, 6), rushingYards: norm(12 * t, 12), rushingTD: pois(0.2 * t), passing300Bonus: py >= 300 ? 1 : 0, passing400Bonus: py >= 400 ? 1 : 0 }
  }
  if (pos === 'RB') {
    const ry = norm(62 * t, 34)
    return { rushingYards: ry, rushingTD: pois(0.5 * t), rushingAttempts: norm(14 * t, 5), receptions: pois(2.2 * t), receivingYards: norm(18 * t, 15), fumbles: pois(0.12), rushing100Bonus: ry >= 100 ? 1 : 0 }
  }
  if (pos === 'WR') {
    const rec = pois(4 * t), recy = norm(56 * t, 30)
    return { receptions: rec, receivingYards: recy, receivingTD: pois(0.42 * t), targets: rec + pois(2), receiving100Bonus: recy >= 100 ? 1 : 0 }
  }
  if (pos === 'TE') {
    const recy = norm(38 * t, 20)
    return { receptions: pois(3.2 * t), receivingYards: recy, receivingTD: pois(0.32 * t), targets: pois(4), receiving100Bonus: recy >= 100 ? 1 : 0 }
  }
  if (pos === 'K') return { fgMade0_39: pois(1.1 * t), fgMade40_49: pois(0.5 * t), fgMade50plus: pois(0.2 * t), xpMade: pois(2.2 * t), fgMissed: pois(0.25) }
  // DEF / D-ST
  const tiers = ['ptsAllowed0', 'ptsAllowed1_6', 'ptsAllowed7_13', 'ptsAllowed14_20', 'ptsAllowed21_27', 'ptsAllowed28_34', 'ptsAllowed35plus']
  const tier = tiers[Math.min(tiers.length - 1, pois(2.4))]
  return { sack: pois(2.4 * t), interception: pois(0.8 * t), fumbleRecovery: pois(0.6), defensiveTD: pois(0.14), safeties: pois(0.05), [tier]: 1 }
}

function nbaStats(t: number): Stats {
  const points = norm(15 * t, 8)
  const reb = norm(5.5 * t, 3)
  const off = Math.round(reb * 0.3), def = reb - off
  const ast = pois(3 * t), stl = pois(1), blk = pois(0.6)
  const tens = [points, reb, ast, stl, blk].filter(x => x >= 10).length
  return {
    points, offRebounds: off, defRebounds: def, assists: ast, steals: stl, blocks: blk,
    turnovers: pois(1.8), threesMade: pois(1.6 * t), fieldGoalsMade: Math.round(points * 0.38),
    fieldGoalsMissed: pois(5), freeThrowsMade: pois(2.2 * t), freeThrowsMissed: pois(1), personalFouls: pois(2),
    doubleDouble: tens >= 2 ? 1 : 0, tripleDouble: tens >= 3 ? 1 : 0, minutes: norm(30, 6),
  }
}

function nhlStats(pos: string, t: number): Stats {
  if (pos === 'G') {
    const ga = pois(2.6), wins = bern(0.52 * t)
    return { wins, saves: norm(28 * t, 6), goalsAllowed: ga, shutout: ga === 0 && wins ? 1 : 0, overtimeLoss: wins ? 0 : bern(0.18) }
  }
  const goals = pois(0.45 * t), assists = pois(0.6 * t)
  return {
    goals, assists, shotsOnGoal: pois(2.6 * t), plusMinus: Math.round(((rnd() + rnd()) - 1) * 2),
    penaltyMinutes: pois(0.6), hits: pois(1.6), blockedShots: pois(1.1), ppGoals: pois(0.1 * t),
    ppAssists: pois(0.16 * t), gwGoals: goals > 0 ? bern(0.2) : 0, faceoffsWon: pos === 'C' ? pois(6) : 0,
  }
}

function mlbStats(pos: string, t: number): Stats {
  if (pos === 'SP' || pos === 'RP') {
    const ip = pos === 'SP' ? norm(6, 1) : norm(1, 1)
    const er = pois(ip * 0.45)
    return {
      inningsPitched: ip, strikeoutsAsPitcher: pois(ip * (1.0 * t)), earnedRunsAllowed: er,
      hitsAllowed: pois(ip * 0.9), walksAllowed: pois(ip * 0.32), wins: pos === 'SP' ? bern(0.4 * t) : 0,
      saves: pos === 'RP' ? bern(0.3 * t) : 0, holds: pos === 'RP' ? bern(0.25) : 0,
      qualityStart: pos === 'SP' && ip >= 6 && er <= 3 ? 1 : 0, shutoutPitching: pos === 'SP' && er === 0 && ip >= 9 ? 1 : 0,
    }
  }
  const hits = pois(1.05 * t)
  const hr = hits > 0 ? bern(0.18 * t) : 0
  const dbl = hits > 0 ? bern(0.2) : 0
  const tpl = bern(0.03)
  const singles = Math.max(0, hits - hr - dbl - tpl)
  return {
    runs: pois(0.6 * t), singles, doubles: dbl, triples: tpl, homeRuns: hr, rbi: pois(0.6 * t),
    walks: pois(0.4), hbp: bern(0.05), stolenBases: pois(0.15 * t), strikeoutsAsBatter: pois(1), sacFly: bern(0.06),
  }
}
