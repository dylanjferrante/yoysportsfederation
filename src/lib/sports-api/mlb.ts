/**
 * MLB player data via the official MLB Stats API (https://statsapi.mlb.com/api/v1/)
 * Completely free, no API key required.
 */
import type { ApiPlayer } from './types'

interface MlbPlayer {
  id: number
  fullName: string
  primaryPosition: { abbreviation: string; name: string }
  currentTeam: { id: number; name: string; abbreviation: string }
  status: { description: string }
}

const BATTER_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH']
const PITCHER_POSITIONS = ['SP', 'RP', 'P']

function mapMlbPosition(abbr: string): string {
  if (abbr === 'P') return 'SP'
  if (abbr === 'LF' || abbr === 'CF' || abbr === 'RF') return 'OF'
  return abbr
}

function eligiblePositions(abbr: string): string[] {
  const pos = mapMlbPosition(abbr)
  if (PITCHER_POSITIONS.includes(abbr)) return ['SP', 'RP']
  if (abbr === 'LF' || abbr === 'CF' || abbr === 'RF') return ['OF', 'UTIL']
  if (abbr === 'DH') return ['UTIL']
  return [pos, 'UTIL']
}

export async function fetchMlbPlayers(): Promise<ApiPlayer[]> {
  // Fetch active roster for current season
  const res = await fetch('https://statsapi.mlb.com/api/v1/sports/1/players?season=2025&gameType=R', {
    next: { revalidate: 3600 },
  })
  if (!res.ok) throw new Error(`MLB API error: ${res.status}`)
  const { people }: { people: MlbPlayer[] } = await res.json()

  return people
    .filter((p) => {
      const pos = p.primaryPosition?.abbreviation
      return pos && [...BATTER_POSITIONS, ...PITCHER_POSITIONS].includes(pos)
    })
    .map((p) => ({
      externalId: String(p.id),
      name: p.fullName,
      sport: 'MLB',
      position: mapMlbPosition(p.primaryPosition.abbreviation),
      eligiblePositions: eligiblePositions(p.primaryPosition.abbreviation),
      realTeam: p.currentTeam?.name ?? 'FA',
      realTeamAbbr: p.currentTeam?.abbreviation ?? 'FA',
      status: p.status?.description === 'Active' ? 'ACTIVE' : 'INJURED',
      stats: {},
    }))
}
