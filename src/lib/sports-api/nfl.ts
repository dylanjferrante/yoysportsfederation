/**
 * NFL player data via Sleeper API (https://api.sleeper.app/v1/players/nfl)
 * No API key required. Returns all NFL players in one call.
 */
import type { ApiPlayer } from './types'

interface SleeperPlayer {
  player_id: string
  full_name?: string
  first_name?: string
  last_name?: string
  position?: string
  fantasy_positions?: string[]
  team?: string
  status?: string
  injury_status?: string
  injury_notes?: string
  number?: number
  age?: number
}

export async function fetchNflPlayers(): Promise<ApiPlayer[]> {
  const res = await fetch('https://api.sleeper.app/v1/players/nfl', {
    next: { revalidate: 3600 }, // cache 1 hour
  })
  if (!res.ok) throw new Error(`Sleeper API error: ${res.status}`)
  const data: Record<string, SleeperPlayer> = await res.json()

  const relevant = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

  return Object.values(data)
    .filter((p) => p.full_name && p.position && relevant.includes(p.position) && p.team)
    .map((p) => ({
      externalId: p.player_id,
      name: p.full_name!,
      sport: 'NFL',
      position: p.position!,
      eligiblePositions: p.fantasy_positions ?? [p.position!],
      realTeam: p.team!,
      realTeamAbbr: p.team!,
      status: mapNflStatus(p.injury_status),
      injuryNote: p.injury_notes,
      stats: {},
    }))
}

function mapNflStatus(s?: string): ApiPlayer['status'] {
  if (!s) return 'ACTIVE'
  if (s === 'IR') return 'IR'
  if (s === 'Out') return 'OUT'
  if (s === 'Questionable' || s === 'Doubtful') return 'INJURED'
  return 'ACTIVE'
}
