import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, leagueMembers, teams } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { DEFAULT_ROSTER, DEFAULT_SCORING } from '@/lib/defaults'

const createSchema = z.object({
  name:        z.string().min(3).max(60),
  sport:       z.enum(['NFL', 'NBA', 'NHL', 'MLB']),
  season:      z.string(),
  maxTeams:    z.number().int().min(4).max(32).default(12),
  isPublic:    z.boolean().default(false),
  description: z.string().max(500).optional(),
  draftType:   z.enum(['SNAKE', 'AUCTION', 'LINEAR']).default('SNAKE'),
  auctionBudget: z.number().default(200),
  secondsPerPick: z.number().default(90),
  tradeReview: z.enum(['NONE', 'COMMISSIONER', 'LEAGUE_VOTE']).default('COMMISSIONER'),
  tradeReviewHours: z.number().default(48),
  waiverType:  z.enum(['PRIORITY', 'FAAB', 'FREE_AGENT']).default('PRIORITY'),
  faabBudget:  z.number().default(100),
  playoffTeams: z.number().default(4),
  playoffStartWeek: z.number().default(15),
  regularSeasonWeeks: z.number().default(14),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mine = searchParams.get('mine') === 'true'

  if (mine) {
    // Return leagues where user is a member
    const memberships = await db
      .select({ leagueId: leagueMembers.leagueId })
      .from(leagueMembers)
      .where(eq(leagueMembers.userId, session.user.id))

    const leagueIds = memberships.map(m => m.leagueId)
    if (!leagueIds.length) return NextResponse.json([])

    const result = await Promise.all(
      leagueIds.map(lid => db.select().from(leagues).where(eq(leagues.id, lid)).limit(1))
    )
    return NextResponse.json(result.flat())
  }

  // Public leagues
  const result = await db.select().from(leagues).where(eq(leagues.isPublic, true))
  return NextResponse.json(result)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = createSchema.parse(await req.json())
    const inviteCode = nanoid(8).toUpperCase()
    const leagueId = nanoid()

    const rosterSettings = JSON.stringify(DEFAULT_ROSTER[body.sport] ?? {})
    const scoringSettings = JSON.stringify(DEFAULT_SCORING[body.sport] ?? {})

    const [league] = await db.insert(leagues).values({
      id: leagueId,
      name: body.name,
      sport: body.sport,
      season: body.season,
      commissionerId: session.user.id,
      isPublic: body.isPublic,
      inviteCode,
      maxTeams: body.maxTeams,
      description: body.description,
      rosterSettings,
      scoringSettings,
      draftType: body.draftType,
      auctionBudget: body.auctionBudget,
      secondsPerPick: body.secondsPerPick,
      tradeReview: body.tradeReview,
      tradeReviewHours: body.tradeReviewHours,
      waiverType: body.waiverType,
      faabBudget: body.faabBudget,
      playoffTeams: body.playoffTeams,
      playoffStartWeek: body.playoffStartWeek,
      regularSeasonWeeks: body.regularSeasonWeeks,
    }).returning()

    // Add commissioner as member
    await db.insert(leagueMembers).values({
      id: nanoid(),
      leagueId,
      userId: session.user.id,
      role: 'COMMISSIONER',
    })

    return NextResponse.json(league, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
