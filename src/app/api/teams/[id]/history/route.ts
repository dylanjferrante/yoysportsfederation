import { NextResponse } from 'next/server'
import { db } from '@/db'
import { teams, teamRecords, matchups, leagueHistory, leagues } from '@/db/schema'
import { eq, or } from 'drizzle-orm'
import { safeParse } from '@/lib/utils'
import { computeFederationStandings } from '@/lib/federation'

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

  // Per-season federation points + overall finish, recomputed from the whole league.
  const [league] = await db.select().from(leagues).where(eq(leagues.id, team.leagueId)).limit(1)
  const fedScoring = safeParse<any>(league?.federationScoring, { placement: [], championBonus: 0, regularSeasonBonus: 0, includedSports: [] })
  const leagueRecords = await db.select().from(teamRecords).where(eq(teamRecords.leagueId, team.leagueId))
  const fedBySeason: Record<string, { points: number; finish: number; of: number }> = {}
  for (const season of [...new Set(records.map(r => r.season))]) {
    const standings = computeFederationStandings(
      leagueTeams.map(t => ({ id: t.id })),
      leagueRecords.filter(r => r.season === season).map(r => ({ teamId: r.teamId, sport: r.sport, finishPosition: r.finishPosition, isChampion: r.isChampion })),
      fedScoring, fedScoring.includedSports ?? [],
    )
    const idx = standings.findIndex(s => s.team.id === id)
    if (idx >= 0) fedBySeason[season] = { points: standings[idx].total ?? 0, finish: idx + 1, of: standings.length }
  }

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

  return NextResponse.json({ team, records, opponents, titles, fedBySeason })
}
