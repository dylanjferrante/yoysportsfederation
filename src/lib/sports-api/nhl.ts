/**
 * NHL player data via the official NHL Stats API (https://api-web.nhle.com/v1/)
 * Completely free, no API key required.
 */
import type { ApiPlayer } from './types'

const NHL_TEAMS = [
  'ANA','ARI','BOS','BUF','CGY','CAR','CHI','COL','CBJ','DAL',
  'DET','EDM','FLA','LAK','MIN','MTL','NSH','NJD','NYI','NYR',
  'OTT','PHI','PIT','SJS','SEA','STL','TBL','TOR','UTA','VAN','VGK','WSH','WPG',
]

interface NhlRosterPlayer {
  id: number
  headshot?: string
  firstName: { default: string }
  lastName: { default: string }
  positionCode: string
  teamAbbrev?: string
}

export async function fetchNhlPlayers(): Promise<ApiPlayer[]> {
  const season = '20252026'
  const results: ApiPlayer[] = []

  for (const team of NHL_TEAMS) {
    try {
      const res = await fetch(`https://api-web.nhle.com/v1/roster/${team}/${season}`)
      if (!res.ok) continue
      const data = await res.json()
      const groups: Record<string, NhlRosterPlayer[]> = {
        forwards: data.forwards ?? [],
        defensemen: data.defensemen ?? [],
        goalies: data.goalies ?? [],
      }

      for (const [_group, players] of Object.entries(groups)) {
        for (const p of players) {
          results.push({
            externalId: String(p.id),
            name: `${p.firstName.default} ${p.lastName.default}`,
            sport: 'NHL',
            position: p.positionCode,
            eligiblePositions: [p.positionCode],
            realTeam: team,
            realTeamAbbr: team,
            status: 'ACTIVE',
            photoUrl: p.headshot,
            stats: {},
          })
        }
      }
    } catch {
      // skip team on error
    }
  }

  return results
}
