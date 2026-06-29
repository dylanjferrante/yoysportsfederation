import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, matchups, leagueMembers, users } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const league = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const leagueTeams = await db
    .select({ team: teams, user: { id: users.id, name: users.name, email: users.email } })
    .from(teams)
    .leftJoin(users, eq(teams.userId, users.id))
    .where(eq(teams.leagueId, id))
    .orderBy(teams.wins)

  const currentMatchups = await db
    .select().from(matchups)
    .where(and(eq(matchups.leagueId, id), eq(matchups.isComplete, false)))
    .limit(20)

  return NextResponse.json({
    league: league[0],
    teams: leagueTeams,
    matchups: currentMatchups,
  })
}
