import { NextResponse } from 'next/server'
import { db } from '@/db'
import { leagues, teams, teamRecords, matchups, users } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const franchises = await db
    .select({ team: teams, user: { id: users.id, name: users.name, email: users.email } })
    .from(teams)
    .leftJoin(users, eq(teams.userId, users.id))
    .where(eq(teams.leagueId, id))

  const records = await db
    .select().from(teamRecords)
    .where(and(eq(teamRecords.leagueId, id), eq(teamRecords.season, league.season)))

  const currentMatchups = await db
    .select().from(matchups)
    .where(eq(matchups.leagueId, id))
    .limit(500)

  return NextResponse.json({ league, teams: franchises, records, matchups: currentMatchups })
}
