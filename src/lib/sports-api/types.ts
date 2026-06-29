export type Sport = 'NFL' | 'NBA' | 'NHL' | 'MLB'

export interface ApiPlayer {
  externalId: string
  name: string
  sport: Sport
  position: string
  eligiblePositions: string[]
  realTeam: string
  realTeamAbbr: string
  status: 'ACTIVE' | 'INJURED' | 'IR' | 'OUT' | 'SUSPENDED'
  injuryNote?: string
  byeWeek?: number
  photoUrl?: string
  stats: Record<string, number>
}
