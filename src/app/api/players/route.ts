import { NextResponse } from 'next/server'
import { db } from '@/db'
import { players, rosters, teams, playerGameStats } from '@/db/schema'
import { eq, like, and, notInArray, inArray, desc } from 'drizzle-orm'
import { safeParse, crossSportValue } from '@/lib/utils'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const sport    = searchParams.get('sport')
  const position = searchParams.get('position')
  const search   = searchParams.get('q')
  const leagueId = searchParams.get('leagueId')
  const free     = searchParams.get('free') === 'true'
  const rich     = searchParams.get('rich') === 'true'

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
    .limit(rich ? 300 : 200)

  // Attach a normalized cross-sport value so free agents can be ranked fairly
  // (raw points favor high-scoring sports like the NBA).
  if (!rich) return NextResponse.json(result.map(p => ({ ...p, value: crossSportValue(p.sport, p.projectedPoints) })))

  // Rich mode (Players page): attach season category stats, games played,
  // last-game points, ownership, and positional rank.
  const ids = result.map(p => p.id)
  const logs = ids.length
    ? await db.select({ playerId: playerGameStats.playerId, week: playerGameStats.week, points: playerGameStats.points, stats: playerGameStats.stats })
        .from(playerGameStats).where(inArray(playerGameStats.playerId, ids))
    : []
  const agg: Record<string, { season: Record<string, number>; gp: number; lastWk: number; lastPts: number }> = {}
  for (const g of logs) {
    const a = (agg[g.playerId] ??= { season: {}, gp: 0, lastWk: -1, lastPts: 0 })
    const s = safeParse<Record<string, number>>(g.stats ?? '{}', {})
    for (const k in s) a.season[k] = (a.season[k] ?? 0) + (s[k] ?? 0)
    a.gp++
    if (g.week > a.lastWk) { a.lastWk = g.week; a.lastPts = g.points ?? 0 }
  }

  const rosteredRows = await db.select({ playerId: rosters.playerId }).from(rosters)
  const ownedSet = new Set(rosteredRows.map(r => r.playerId))

  // Positional rank within the returned set (already sorted by season points).
  const posCount: Record<string, number> = {}
  const enriched = result.map(p => {
    const key = `${p.sport}:${p.position}`
    posCount[key] = (posCount[key] ?? 0) + 1
    const a = agg[p.id]
    return {
      ...p,
      seasonStats: a?.season ?? {},
      gp: a?.gp ?? 0,
      lastPts: a?.lastPts ?? null,
      avg: a && a.gp ? +( (p.seasonPoints ?? 0) / a.gp ).toFixed(1) : (p.weeklyAvg ?? 0),
      owned: ownedSet.has(p.id),
      posRank: posCount[key],
      value: crossSportValue(p.sport, p.projectedPoints),
    }
  })

  return NextResponse.json(enriched)
}
