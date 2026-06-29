import { NextResponse } from 'next/server'
import { db } from '@/db'
import { players, rosters, teams } from '@/db/schema'
import { eq, like, and, notInArray, desc } from 'drizzle-orm'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const sport    = searchParams.get('sport')
  const position = searchParams.get('position')
  const search   = searchParams.get('q')
  const leagueId = searchParams.get('leagueId')
  const free     = searchParams.get('free') === 'true'

  const conditions = []
  if (sport)    conditions.push(eq(players.sport, sport))
  if (position) conditions.push(eq(players.position, position))
  if (search)   conditions.push(like(players.name, `%${search}%`))

  // Exclude rostered players in SQL so free agents always surface (not just
  // the ones that happen to fall inside a post-filter result cap).
  if (free && leagueId) {
    const rosteredInLeague = await db
      .select({ playerId: rosters.playerId })
      .from(rosters)
      .innerJoin(teams, eq(rosters.teamId, teams.id))
      .where(eq(teams.leagueId, leagueId))
    const rosteredIds = rosteredInLeague.map(r => r.playerId).filter(Boolean) as string[]
    if (rosteredIds.length > 0) conditions.push(notInArray(players.id, rosteredIds))
  }

  const result = await db
    .select()
    .from(players)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(players.seasonPoints))
    .limit(200)

  return NextResponse.json(result)
}
