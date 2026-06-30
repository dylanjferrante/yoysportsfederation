import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, teamRecords, leagueHistory, users, leagueMembers } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { safeParse } from '@/lib/utils'
import { collectClubNames, legacyEmail, abbrFor } from '@/lib/import-history'

const recordSchema = z.object({
  club: z.string().min(1).max(80),
  sport: z.string().min(1).max(8),
  wins: z.number().int().min(0).max(400).default(0),
  losses: z.number().int().min(0).max(400).default(0),
  ties: z.number().int().min(0).max(400).default(0),
  pointsFor: z.number().min(0).max(1e7).default(0),
  pointsAgainst: z.number().min(0).max(1e7).default(0),
  finishPosition: z.number().int().min(1).max(64).optional(),
  isChampion: z.boolean().optional(),
})

const championSchema = z.object({
  scope: z.string().min(1).max(8),
  champion: z.string().min(1).max(80),
  runnerUp: z.string().max(80).optional(),
  note: z.string().max(200).optional(),
})

const seasonSchema = z.object({
  season: z.string().min(3).max(12),
  records: z.array(recordSchema).default([]),
  champions: z.array(championSchema).default([]),
})

const schema = z.object({
  clubs: z.array(z.object({
    name: z.string().min(1).max(80),
    abbreviation: z.string().max(5).optional(),
    ownerName: z.string().max(80).optional(),
    ownerEmail: z.string().email().max(160).optional(),
  })).default([]),
  seasons: z.array(seasonSchema).min(1).max(60),
  dryRun: z.boolean().optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (league.commissionerId !== session.user.id) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })

  let body: z.infer<typeof schema>
  try { body = schema.parse(await req.json()) }
  catch (e) { if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors }, { status: 400 }); return NextResponse.json({ error: 'Could not read the import file' }, { status: 400 }) }

  const sportsEnabled = safeParse<string[]>(league.sportsEnabled, [])

  const referenced = collectClubNames(body)

  const existing = await db.select().from(teams).where(eq(teams.leagueId, id))
  const byName = new Map<string, string>()
  for (const t of existing) byName.set(t.name.trim().toLowerCase(), t.id)
  const meta = new Map<string, { abbreviation?: string; ownerName?: string; ownerEmail?: string }>()
  for (const c of body.clubs) meta.set(c.name.trim().toLowerCase(), c)

  const usedEmails = new Set((await db.select({ email: users.email }).from(users)).map(u => u.email.toLowerCase()))

  let clubsCreated = 0, clubsMatched = 0
  const teamIdFor = new Map<string, string>()
  for (const name of referenced) {
    const key = name.toLowerCase()
    const hit = byName.get(key)
    if (hit) { teamIdFor.set(key, hit); clubsMatched++; continue }
    clubsCreated++
    if (body.dryRun) { teamIdFor.set(key, `new:${key}`); continue }

    const info = meta.get(key)
    const provided = info?.ownerEmail?.toLowerCase().trim()
    const email = provided && !usedEmails.has(provided) ? provided : legacyEmail(name, id, usedEmails)
    usedEmails.add(email)
    const pw = await bcrypt.hash(nanoid(), 10)
    const [owner] = await db.insert(users).values({ id: nanoid(), name: info?.ownerName || name, email, password: pw }).returning()
    const teamId = nanoid()
    await db.insert(teams).values({
      id: teamId, name: name, abbreviation: abbrFor(name, info?.abbreviation),
      userId: owner.id, leagueId: id,
      archived: true, archivedAt: new Date().toISOString(), archivedSports: JSON.stringify(sportsEnabled),
    })
    await db.insert(leagueMembers).values({ id: nanoid(), leagueId: id, userId: owner.id, role: 'MEMBER' }).onConflictDoNothing()
    teamIdFor.set(key, teamId)
  }

  const resolve = (name: string) => teamIdFor.get(name.trim().toLowerCase()) ?? null

  let recordsUpserted = 0, championsRecorded = 0, skipped = 0
  if (!body.dryRun) {
    for (const s of body.seasons) {
      const season = s.season.trim()
      for (const r of s.records) {
        const teamId = resolve(r.club)
        if (!teamId) { skipped++; continue }
        const sport = r.sport.toUpperCase()
        await db.insert(teamRecords).values({
          id: nanoid(), teamId, leagueId: id, season, sport,
          wins: r.wins, losses: r.losses, ties: r.ties, pointsFor: r.pointsFor, pointsAgainst: r.pointsAgainst,
          finishPosition: r.finishPosition ?? null, isChampion: r.isChampion ?? false,
        }).onConflictDoUpdate({
          target: [teamRecords.teamId, teamRecords.season, teamRecords.sport],
          set: { wins: r.wins, losses: r.losses, ties: r.ties, pointsFor: r.pointsFor, pointsAgainst: r.pointsAgainst, finishPosition: r.finishPosition ?? null, isChampion: r.isChampion ?? false },
        })
        recordsUpserted++
      }
      for (const c of s.champions) {
        const championTeamId = resolve(c.champion)
        if (!championTeamId) { skipped++; continue }
        const scope = c.scope.toUpperCase()
        // One champion per (season, scope): replace any existing row.
        await db.delete(leagueHistory).where(and(eq(leagueHistory.leagueId, id), eq(leagueHistory.season, season), eq(leagueHistory.scope, scope)))
        await db.insert(leagueHistory).values({
          id: nanoid(), leagueId: id, season, scope, championTeamId,
          runnerUpTeamId: c.runnerUp ? resolve(c.runnerUp) : null, note: c.note ?? null,
        })
        championsRecorded++
      }
    }
  } else {
    for (const s of body.seasons) {
      for (const r of s.records) { resolve(r.club) ? recordsUpserted++ : skipped++ }
      for (const c of s.champions) { resolve(c.champion) ? championsRecorded++ : skipped++ }
    }
  }

  return NextResponse.json({
    ok: true, dryRun: !!body.dryRun,
    summary: { clubsMatched, clubsCreated, recordsUpserted, championsRecorded, skipped, seasons: body.seasons.length },
  })
}
