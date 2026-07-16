import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, teamRecords, leagueMembers, users, rosters, draftPicks } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { safeParse } from '@/lib/utils'

const schema = z.object({
  archiveTeamId: z.string(),
  transferSports: z.array(z.string()).default([]),
  name: z.string().max(60).optional(),
  abbreviation: z.string().max(5).optional(),
  ownerName: z.string().max(80).optional(),
  ownerEmail: z.string().email().max(160).optional(),
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
  if (oldTeam.archived) return NextResponse.json({ error: 'That club is already fully archived' }, { status: 400 })

  const sportsEnabled = safeParse<string[]>(league.sportsEnabled, [])
  const transferSports = body.transferSports.filter(s => sportsEnabled.includes(s))

  // Resolve the replacement club: reuse an existing one, else create it.
  let newTeamId: string
  if (oldTeam.replacedBy) {
    const [b] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, oldTeam.replacedBy)).limit(1)
    if (!b) return NextResponse.json({ error: 'Replacement club is missing' }, { status: 400 })
    newTeamId = b.id
  } else {
    if (!body.name || !body.abbreviation || !body.ownerName || !body.ownerEmail)
      return NextResponse.json({ error: 'New club name, abbreviation and owner are required' }, { status: 400 })
    let [owner] = await db.select().from(users).where(eq(users.email, body.ownerEmail.toLowerCase().trim())).limit(1)
    if (!owner) {
      const pw = await bcrypt.hash(nanoid(), 10)
      ;[owner] = await db.insert(users).values({ id: nanoid(), name: body.ownerName, email: body.ownerEmail.toLowerCase().trim(), password: pw }).returning()
    }
    const [dupe] = await db.select({ id: teams.id }).from(teams).where(and(eq(teams.leagueId, id), eq(teams.userId, owner.id), eq(teams.archived, false))).limit(1)
    if (dupe) return NextResponse.json({ error: 'That owner already manages an active club in this league' }, { status: 409 })
    newTeamId = nanoid()
    await db.insert(teams).values({ id: newTeamId, name: body.name, abbreviation: body.abbreviation.toUpperCase(), wordmark: body.name, userId: owner.id, leagueId: id, division: oldTeam.division ?? null })
    await db.insert(leagueMembers).values({ id: nanoid(), leagueId: id, userId: owner.id, role: 'MEMBER' }).onConflictDoNothing()
  }

  // Transfer the selected sports' assets to the replacement club.
  if (transferSports.length) {
    await db.update(rosters).set({ teamId: newTeamId }).where(and(eq(rosters.teamId, body.archiveTeamId), inArray(rosters.sport, transferSports)))
    await db.update(draftPicks).set({ currentTeamId: newTeamId }).where(and(eq(draftPicks.currentTeamId, body.archiveTeamId), inArray(draftPicks.sport, transferSports)))
    const oldRecs = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, id), eq(teamRecords.teamId, body.archiveTeamId), eq(teamRecords.season, league.season)))
    for (const sport of transferSports) {
      const old = oldRecs.find(r => r.sport === sport)
      const [existing] = await db.select({ id: teamRecords.id }).from(teamRecords).where(and(eq(teamRecords.leagueId, id), eq(teamRecords.teamId, newTeamId), eq(teamRecords.season, league.season), eq(teamRecords.sport, sport))).limit(1)
      if (existing) await db.update(teamRecords).set({ faabRemaining: old?.faabRemaining ?? league.faabBudget ?? 100, waiverPriority: old?.waiverPriority ?? null }).where(eq(teamRecords.id, existing.id))
      else await db.insert(teamRecords).values({ id: nanoid(), teamId: newTeamId, leagueId: id, season: league.season, sport, faabRemaining: old?.faabRemaining ?? league.faabBudget ?? 100, waiverPriority: old?.waiverPriority ?? null })
    }
  }

  const prev = safeParse<string[]>(oldTeam.archivedSports, [])
  const archivedSports = [...new Set([...prev, ...transferSports])]
  const fully = sportsEnabled.length > 0 && sportsEnabled.every(s => archivedSports.includes(s))
  if (fully) await db.update(draftPicks).set({ currentTeamId: newTeamId }).where(eq(draftPicks.currentTeamId, body.archiveTeamId))
  await db.update(teams).set({
    archivedSports: JSON.stringify(archivedSports), replacedBy: newTeamId,
    archived: fully, archivedAt: fully ? new Date().toISOString() : oldTeam.archivedAt,
  }).where(eq(teams.id, body.archiveTeamId))

  return NextResponse.json({ ok: true, teamId: newTeamId, fullyArchived: fully })
}
