/**
 * NBA player data via ball-dont-lie API (https://api.balldontlie.io/v1/)
 * Free tier: no API key required for basic endpoints.
 */
import type { ApiPlayer } from './types'

interface BdlPlayer {
  id: number
  first_name: string
  last_name: string
  position: string
  team: {
    id: number
    abbreviation: string
    city: string
    name: string
    full_name: string
  }
}

function mapNbaPosition(pos: string): string {
  if (!pos) return 'F'
  if (pos.includes('G')) return pos === 'G' ? 'PG' : pos.split('-')[0]
  if (pos.includes('F')) return pos === 'F' ? 'SF' : pos.split('-')[0]
  if (pos === 'C') return 'C'
  return pos || 'UTIL'
}

function eligibleNbaPositions(pos: string): string[] {
  const mapped = mapNbaPosition(pos)
  const map: Record<string, string[]> = {
    PG: ['PG', 'G', 'UTIL'],
    SG: ['SG', 'G', 'UTIL'],
    SF: ['SF', 'F', 'UTIL'],
    PF: ['PF', 'F', 'UTIL'],
    C:  ['C', 'UTIL'],
  }
  return map[mapped] ?? ['UTIL']
}

export async function fetchNbaPlayers(): Promise<ApiPlayer[]> {
  const players: ApiPlayer[] = []
  let cursor = 0
  const limit = 100

  // Paginate through all players
  for (let page = 0; page < 15; page++) {
    const url = `https://api.balldontlie.io/v1/players?per_page=${limit}&cursor=${cursor}`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) break
    const { data, meta }: { data: BdlPlayer[]; meta: { next_cursor?: number } } = await res.json()

    for (const p of data) {
      if (!p.team) continue
      const position = mapNbaPosition(p.position)
      players.push({
        externalId: String(p.id),
        name: `${p.first_name} ${p.last_name}`,
        sport: 'NBA',
        position,
        eligiblePositions: eligibleNbaPositions(p.position),
        realTeam: p.team.full_name,
        realTeamAbbr: p.team.abbreviation,
        status: 'ACTIVE',
        stats: {},
      })
    }

    if (!meta.next_cursor) break
    cursor = meta.next_cursor
  }

  return players
}
