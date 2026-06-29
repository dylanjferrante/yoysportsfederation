import { NextResponse } from 'next/server'
import { db } from '@/db'
import { teams, teamRecords, matchups, leagueHistory } from '@/db/schema'
import { eq, or } from 'drizzle-orm'

// Season-by-season records, championships, and opponent results for one franchise.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1)
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const leagueTeams = await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation }).from(teams).where(eq(teams.leagueId, team.leagueId))
  const nameMap = Object.fromEntries(leagueTeams.map(t => [t.id, t]))

  const records = await db.select().from(teamRecords).where(eq(teamRecords.teamId, id))
  const games = await db.select().from(matchups).where(or(eq(matchups.homeTeamId, id), eq(matchups.awayTeamId, id))).limit(2000)
  const titles = await db.select().from(leagueHistory).where(eq(leagueHistory.championTeamId, id))

  const opponents = games.map(m => {
    const isHome = m.homeTeamId === id
    const oppId = isHome ? m.awayTeamId : m.homeTeamId
    const my = (isHome ? m.homeScore : m.awayScore) ?? 0
    const their = (isHome ? m.awayScore : m.homeScore) ?? 0
    return {
      season: m.season, sport: m.sport, week: m.week,
      opponent: oppId ? nameMap[oppId]?.abbreviation ?? '—' : 'BYE',
      my, their, result: !m.isComplete ? 'LIVE' : (my >= their ? 'W' : 'L'),
      isComplete: m.isComplete,
    }
  })

  return NextResponse.json({ team, records, opponents, titles })
}
