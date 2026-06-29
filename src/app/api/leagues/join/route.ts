import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, leagueMembers, teams, teamRecords } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { safeParse } from '@/lib/utils'
import { logActivity } from '@/lib/activity'

const schema = z.object({
  code: z.string().min(1),
  teamName: z.string().min(1).max(40).optional(),
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { code, teamName } = schema.parse(await req.json())

    const [league] = await db.select().from(leagues).where(eq(leagues.inviteCode, code.trim().toUpperCase())).limit(1)
    if (!league) return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })

    // Already a member?
    const [existing] = await db.select().from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, league.id), eq(leagueMembers.userId, session.user.id))).limit(1)
    if (existing) return NextResponse.json({ leagueId: league.id, already: true })

    // League full?
    const members = await db.select({ id: leagueMembers.id }).from(leagueMembers).where(eq(leagueMembers.leagueId, league.id))
    if (members.length >= (league.maxTeams ?? 12)) return NextResponse.json({ error: 'This league is full' }, { status: 400 })

    const sportsEnabled = safeParse<string[]>(league.sportsEnabled, ['NFL', 'NBA', 'NHL', 'MLB'])

    await db.insert(leagueMembers).values({ id: nanoid(), leagueId: league.id, userId: session.user.id, role: 'MEMBER' })

    const teamId = nanoid()
    const name = teamName?.trim() || `${session.user.name ?? 'New'} Franchise`
    await db.insert(teams).values({
      id: teamId, name, abbreviation: name.slice(0, 3).toUpperCase(),
      userId: session.user.id, leagueId: league.id,
    })

    await db.insert(teamRecords).values(
      sportsEnabled.map(sport => ({
        id: nanoid(), teamId, leagueId: league.id, season: league.season, sport,
        wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0,
        finishPosition: members.length + 1, faabRemaining: league.faabBudget ?? 100,
        waiverPriority: members.length + 1,
      }))
    )

    await logActivity(league.id, 'LEAGUE', `${name} joined the federation`, teamId)

    return NextResponse.json({ leagueId: league.id }, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors }, { status: 400 })
    console.error(e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
