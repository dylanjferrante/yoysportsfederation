// Federation scoring — the cross-sport meta-competition. Each franchise earns
// federation points based on where it finishes in each sport, plus bonuses.

export type FederationScoring = {
  placement: number[]        // placement[i] = points for finishing position i+1
  championBonus: number      // extra points for a sport's playoff champion
  regularSeasonBonus: number // extra points for a sport's regular-season #1
  includedSports: string[]   // which sports count toward the overall total
}

export function defaultFederationScoring(maxTeams: number, sportsEnabled: string[]): FederationScoring {
  // 1st place = maxTeams points, descending to 1 for last.
  const placement = Array.from({ length: maxTeams }, (_, i) => maxTeams - i)
  return { placement, championBonus: 3, regularSeasonBonus: 1, includedSports: [...sportsEnabled] }
}

export type RankableRecord = { teamId: string; wins: number; pointsFor: number }

// Finishing positions within a single sport (by wins, then points-for).
export function rankWithinSport<T extends RankableRecord>(records: T[]): (T & { position: number })[] {
  return [...records]
    .sort((a, b) => (b.wins - a.wins) || (b.pointsFor - a.pointsFor))
    .map((r, i) => ({ ...r, position: i + 1 }))
}

export function federationPointsFor(position: number, isChampion: boolean, fs: FederationScoring): number {
  const base = fs.placement[position - 1] ?? 0
  return base + (isChampion ? fs.championBonus : 0)
}

export type FedRecord = { teamId: string; sport: string; finishPosition: number | null; isChampion?: boolean | null }
export type FedStanding<T> = { team: T; total: number; perSport: Record<string, number> }

// Aggregate federation points across the included sports for each team.
export function computeFederationStandings<T extends { id: string }>(
  teams: T[],
  records: FedRecord[],
  fs: FederationScoring,
  includedSports: string[],
): FedStanding<T>[] {
  const included = new Set(includedSports)
  const standings = teams.map(team => {
    const perSport: Record<string, number> = {}
    let total = 0
    for (const rec of records) {
      if (rec.teamId !== team.id) continue
      if (!included.has(rec.sport)) continue
      const pts = federationPointsFor(rec.finishPosition ?? (fs.placement.length + 1), !!rec.isChampion, fs)
      perSport[rec.sport] = pts
      total += pts
    }
    return { team, total, perSport }
  })
  return standings.sort((a, b) => b.total - a.total)
}
