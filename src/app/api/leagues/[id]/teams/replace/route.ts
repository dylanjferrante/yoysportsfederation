import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, teamRecords, leagueMembers, users, rosters, draftPicks } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { safeParse } from '@/lib/utils'

const schema = z.object({
  archiveTeamId: z.string(),
  name: z.string().min(1).max(60),
  abbreviation: z.string().min(1).max(5),
  ownerName: z.string().min(1).max(80),
  ownerEmail: z.string().email().max(160),
  transferAssets: z.boolean().default(false),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (league.commissionerId !== session.user.id) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })

  let body: z.infer<typeof schema>
  try { body = schema.parse(await req.json()) }
  catch (e) { if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors }, { status: 400 }); return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const [oldTeam] = await db.select().from(teams).where(and(eq(teams.id, body.archiveTeamId), eq(teams.leagueId, id))).limit(1)
  if (!oldTeam) return NextResponse.json({ error: 'Club to archive not found in this league' }, { status: 404 })
  if (oldTeam.archived) return NextResponse.json({ error: 'That club is already archived' }, { status: 400 })

  let [owner] = await db.select().from(users).where(eq(users.email, body.ownerEmail.toLowerCase().trim())).limit(1)
  if (!owner) {
    const pw = await bcrypt.hash(nanoid(), 10)
    ;[owner] = await db.insert(users).values({ id: nanoid(), name: body.ownerName, email: body.ownerEmail.toLowerCase().trim(), password: pw }).returning()
  }
  const [dupe] = await db.select({ id: teams.id }).from(teams).where(and(eq(teams.leagueId, id), eq(teams.userId, owner.id), eq(teams.archived, false))).limit(1)
  if (dupe) return NextResponse.json({ error: 'That owner already manages an active club in this league' }, { status: 409 })

  const newTeamId = nanoid()
  await db.insert(teams).values({
    id: newTeamId, name: body.name, abbreviation: body.abbreviation.toUpperCase(), wordmark: body.name,
    userId: owner.id, leagueId: id, division: oldTeam.division ?? null,
  })
  await db.insert(leagueMembers).values({ id: nanoid(), leagueId: id, userId: owner.id, role: 'MEMBER' }).onConflictDoNothing()

  const sports = safeParse<string[]>(league.sportsEnabled, [])
  const oldRecs = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, id), eq(teamRecords.teamId, body.archiveTeamId), eq(teamRecords.season, league.season)))
  const oldBySport = new Map(oldRecs.map(r => [r.sport, r]))

  if (body.transferAssets) {
    await db.update(rosters).set({ teamId: newTeamId }).where(eq(rosters.teamId, body.archiveTeamId))
    await db.update(draftPicks).set({ currentTeamId: newTeamId }).where(eq(draftPicks.currentTeamId, body.archiveTeamId))
  }

  for (const sport of sports) {
    const old = oldBySport.get(sport)
    await db.insert(teamRecords).values({
      id: nanoid(), teamId: newTeamId, leagueId: id, season: league.season, sport,
      faabRemaining: body.transferAssets ? (old?.faabRemaining ?? league.faabBudget ?? 100) : (league.faabBudget ?? 100),
      waiverPriority: body.transferAssets ? (old?.waiverPriority ?? null) : null,
    })
  }

  await db.update(teams).set({ archived: true, archivedAt: new Date().toISOString() }).where(eq(teams.id, body.archiveTeamId))

  return NextResponse.json({ ok: true, teamId: newTeamId })
}
