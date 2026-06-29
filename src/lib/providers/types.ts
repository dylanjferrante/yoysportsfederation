// ── Sports-data provider abstraction ─────────────────────────────────────────
// The rest of the app talks to these interfaces, never to a specific vendor.
// A provider is selected at runtime (see ./index): Tank01 when an API key is
// configured, otherwise the built-in mock that reads the seeded database.

export type Sport = 'NFL' | 'NBA' | 'NHL' | 'MLB'

/** A real-world player as described by the data source (not yet linked to our DB row). */
export type ProviderPlayer = {
  externalId: string
  name: string
  sport: Sport
  position: string
  realTeam: string
  realTeamAbbr?: string
  status?: string
  injuryNote?: string | null
  photoUrl?: string | null
  isRookie?: boolean
  byeWeek?: number | null
}

/** A fantasy projection for a player, keyed by the source's external id. */
export type ProviderProjection = {
  externalId: string
  name: string
  sport: Sport
  /** Total projected fantasy points for the period (season or a given week). */
  projectedPoints: number
  /** Optional raw stat line behind the projection. */
  stats?: Record<string, number>
}

/** An actual produced stat line for scoring, keyed by the source's external id. */
export type ProviderStatLine = {
  externalId: string
  name: string
  sport: Sport
  week: number
  /** Flat { statKey: value } map matching our scoring-settings keys. */
  stats: Record<string, number>
}

export type ProviderTeam = {
  externalId: string
  sport: Sport
  name: string
  abbreviation: string
  logoUrl?: string | null
}

export interface SportsDataProvider {
  /** Stable identifier, e.g. 'tank01' or 'mock'. */
  readonly id: string
  /** Which sports this provider instance can serve. */
  supports(sport: Sport): boolean

  listTeams(sport: Sport): Promise<ProviderTeam[]>
  listPlayers(sport: Sport): Promise<ProviderPlayer[]>
  /** Projections for a week (or season totals when week is omitted). */
  getProjections(sport: Sport, opts?: { week?: number; season?: string }): Promise<ProviderProjection[]>
  /** Produced stat lines for a specific scoring week. */
  getStatLines(sport: Sport, week: number, opts?: { season?: string }): Promise<ProviderStatLine[]>
}
