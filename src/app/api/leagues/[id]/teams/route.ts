import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, teamRecords, leagueMembers, users } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { safeParse } from '@/lib/utils'

const addSchema = z.object({
  name: z.string().min(1).max(60),
  abbreviation: z.string().min(1).max(5),
  ownerName: z.string().min(1).max(80),
  ownerEmail: z.string().email().max(160),
})

// Commissioner adds a franchise to the league (creates/links the owner user).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (league.commissionerId !== session.user.id) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })

  let body: z.infer<typeof addSchema>
  try { body = addSchema.parse(await req.json()) }
  catch (e) { if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors }, { status: 400 }); return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const existingTeams = await db.select({ id: teams.id }).from(teams).where(eq(teams.leagueId, id))
  if (existingTeams.length >= (league.maxTeams ?? 12))
    return NextResponse.json({ error: `League is full (max ${league.maxTeams} teams)` }, { status: 400 })

  // Find or create the owner user.
  let [owner] = await db.select().from(users).where(eq(users.email, body.ownerEmail)).limit(1)
  if (!owner) {
    const pw = await bcrypt.hash(nanoid(), 10) // placeholder; owner resets via account
    ;[owner] = await db.insert(users).values({ id: nanoid(), name: body.ownerName, email: body.ownerEmail, password: pw }).returning()
  }

  // Already in this league?
  const [dupe] = await db.select({ id: teams.id }).from(teams).where(and(eq(teams.leagueId, id), eq(teams.userId, owner.id))).limit(1)
  if (dupe) return NextResponse.json({ error: 'That owner already has a franchise in this league' }, { status: 409 })

  const teamId = nanoid()
  await db.insert(teams).values({ id: teamId, name: body.name, abbreviation: body.abbreviation.toUpperCase(), wordmark: body.name, userId: owner.id, leagueId: id })
  await db.insert(leagueMembers).values({ id: nanoid(), leagueId: id, userId: owner.id, role: 'MEMBER' }).onConflictDoNothing()

  // Seed current-season records for each enabled sport.
  const sports = safeParse<string[]>(league.sportsEnabled, [])
  for (const sport of sports) {
    await db.insert(teamRecords).values({ id: nanoid(), teamId, leagueId: id, season: league.season, sport, faabRemaining: league.faabBudget ?? 100 })
  }

  return NextResponse.json({ ok: true, teamId })
}
