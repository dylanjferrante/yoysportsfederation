import { FederationScoring, federationPointsFor } from './federation'

// Monte-Carlo rest-of-season simulator. Plays out every remaining matchup in
// every sport thousands of times, then resolves each sport's playoff bracket,
// to produce playoff odds, per-sport title odds, and — by aggregating
// federation points across sports each run — odds to win the federation.

export type SportInput = {
  sport: string
  playoffTeams: number
  teams: { teamId: string; wins: number; pointsFor: number; games: number }[]
  remaining: { home: string; away: string }[]
}

// Standard-normal sample (Box–Muller).
function randn(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export type OddsResult = {
  perSport: Record<string, {
    playoff: Record<string, number>   // team → P(make playoffs)
    title: Record<string, number>     // team → P(win sport)
  }>
  federation: Record<string, number>  // team → P(win federation)
  fedPoints: Record<string, number>   // team → expected federation points
  sims: number
}

export function simulateSeason(
  sports: SportInput[],
  fs: FederationScoring,
  includedSports: string[],
  sims = 3000,
): OddsResult {
  const included = new Set(includedSports)
  const perSport: OddsResult['perSport'] = {}
  const federation: Record<string, number> = {}
  const fedPoints: Record<string, number> = {}

  // Per-sport baseline scoring strength (avg points-for per game), with a
  // league-average fallback for teams that haven't played yet.
  const strength: Record<string, Record<string, number>> = {}
  for (const sp of sports) {
    perSport[sp.sport] = { playoff: {}, title: {} }
    const avgAll = sp.teams.reduce((s, t) => s + (t.games ? t.pointsFor / t.games : 0), 0) / Math.max(1, sp.teams.filter(t => t.games).length)
    strength[sp.sport] = {}
    for (const t of sp.teams) {
      const s = t.games ? t.pointsFor / t.games : (avgAll || 100)
      strength[sp.sport][t.teamId] = s || 100
      perSport[sp.sport].playoff[t.teamId] ??= 0
      perSport[sp.sport].title[t.teamId] ??= 0
      federation[t.teamId] ??= 0
      fedPoints[t.teamId] ??= 0
    }
  }

  const sample = (sport: string, teamId: string) => {
    const mean = strength[sport][teamId] ?? 100
    return Math.max(0, mean + randn() * mean * 0.28)
  }

  for (let n = 0; n < sims; n++) {
    // Per-sim federation point tally per team.
    const fedTally: Record<string, number> = {}

    for (const sp of sports) {
      const wins: Record<string, number> = {}
      const pf: Record<string, number> = {}
      for (const t of sp.teams) { wins[t.teamId] = t.wins; pf[t.teamId] = t.pointsFor }

      // Play remaining regular-season games.
      for (const g of sp.remaining) {
        const hs = sample(sp.sport, g.home), as = sample(sp.sport, g.away)
        pf[g.home] += hs; pf[g.away] += as
        if (hs >= as) wins[g.home] += 1; else wins[g.away] += 1
      }

      // Final standings: wins, then points-for.
      const ranked = [...sp.teams].sort((a, b) => (wins[b.teamId] - wins[a.teamId]) || (pf[b.teamId] - pf[a.teamId]))
      const fieldSize = Math.min(sp.playoffTeams || 0, ranked.length)
      const field = ranked.slice(0, fieldSize).map(t => t.teamId)
      for (const tid of field) perSport[sp.sport].playoff[tid] += 1

      // Single-elimination bracket: re-seed each round, top seed plays low seed.
      let alive = [...field]
      while (alive.length > 1) {
        const next: string[] = []
        const lo = 0, hi = alive.length - 1
        const pairs: [string, string][] = []
        for (let i = 0; i < alive.length / 2; i++) pairs.push([alive[i], alive[alive.length - 1 - i]])
        for (const [top, bot] of pairs) {
          if (!bot) { next.push(top); continue }
          const ts = sample(sp.sport, top), bs = sample(sp.sport, bot)
          next.push(ts >= bs ? top : bot)
        }
        alive = next.sort((a, b) => field.indexOf(a) - field.indexOf(b))
      }
      const champ = alive[0]
      if (champ) perSport[sp.sport].title[champ] += 1

      // Federation points for this sport this sim.
      if (included.has(sp.sport)) {
        ranked.forEach((t, i) => {
          const pts = federationPointsFor(i + 1, t.teamId === champ, fs)
          fedTally[t.teamId] = (fedTally[t.teamId] ?? 0) + pts
        })
      }
    }

    // Federation champion = most federation points this sim.
    let best = -1, bestTeam: string | null = null
    for (const tid in fedTally) {
      fedPoints[tid] += fedTally[tid]
      if (fedTally[tid] > best) { best = fedTally[tid]; bestTeam = tid }
    }
    if (bestTeam) federation[bestTeam] += 1
  }

  // Normalize to probabilities / expectations.
  for (const sp of Object.values(perSport)) {
    for (const k in sp.playoff) sp.playoff[k] = sp.playoff[k] / sims
    for (const k in sp.title) sp.title[k] = sp.title[k] / sims
  }
  for (const k in federation) federation[k] = federation[k] / sims
  for (const k in fedPoints) fedPoints[k] = fedPoints[k] / sims

  return { perSport, federation, fedPoints, sims }
}
