import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, leagueMembers, teams, teamRecords, drafts } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { buildPerSportSettings, buildSchedule, defaultTradeDeadlines, defaultWaiverSchedule, defaultIrDesignations, dynastyDraftRounds } from '@/lib/defaults'
import { defaultFederationScoring } from '@/lib/federation'

const createSchema = z.object({
  name:        z.string().min(3).max(60),
  season:      z.string().default('2025-26'),
  sportsEnabled: z.array(z.enum(['NFL', 'NHL', 'NBA', 'MLB'])).min(1).default(['NFL', 'NHL', 'NBA', 'MLB']),
  seasonStart: z.enum(['FOOTBALL', 'WINTER', 'BASEBALL']).default('FOOTBALL'),
  logoUrl:     z.string().max(2000).optional(),
  teamName:    z.string().max(60).optional(),
  maxTeams:    z.number().int().min(4).max(16).default(12),
  isPublic:    z.boolean().default(false),
  description: z.string().max(500).optional(),
  draftType:   z.enum(['SNAKE', 'AUCTION', 'LINEAR']).default('SNAKE'),
  draftOrderMethod: z.enum(['REVERSE_STANDINGS', 'RANDOM', 'MANUAL', 'LOTTERY']).default('REVERSE_STANDINGS'),
  rookieDraftMode: z.enum(['COMBINED', 'PER_SPORT']).default('PER_SPORT'),
  tradeablePickYears: z.number().int().min(0).max(7).default(3),
  tradeReview: z.enum(['NONE', 'COMMISSIONER', 'LEAGUE_VOTE']).default('COMMISSIONER'),
  waiverType:  z.enum(['PRIORITY', 'FAAB', 'FREE_AGENT']).default('PRIORITY'),
  faabBudget:  z.number().default(100),
  faabMode:    z.enum(['TOTAL', 'PER_SPORT']).default('TOTAL'),
  playoffTeams: z.number().default(6),
  playoffStartWeek: z.number().default(15),
  playoffRounds: z.number().default(3),
  playoffFormat: z.enum(['H2H', 'MULTI_WEEK', 'CHAMP_MULTI']).default('H2H'),
  weeksPerRound: z.number().default(1),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mine = searchParams.get('mine') === 'true'

  if (mine) {
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

    const { roster, scoring, draftRounds, rookieRounds, seasonWeeks } = buildPerSportSettings(body.sportsEnabled)
    const schedule = buildSchedule(body.seasonStart, body.sportsEnabled, seasonWeeks)
    const fedScoring = defaultFederationScoring(body.maxTeams, body.sportsEnabled)

    const [league] = await db.insert(leagues).values({
      id: leagueId,
      name: body.name,
      season: body.season,
      commissionerId: session.user.id,
      isPublic: body.isPublic,
      inviteCode,
      status: 'SETUP',
      maxTeams: body.maxTeams,
      description: body.description,
      logoUrl: body.logoUrl,
      sportsEnabled: JSON.stringify(body.sportsEnabled),
      seasonStart: body.seasonStart,
      sportSchedule: JSON.stringify(schedule),
      rosterSettings: JSON.stringify(roster),
      scoringSettings: JSON.stringify(scoring),
      draftRounds: JSON.stringify(draftRounds),
      federationScoring: JSON.stringify(fedScoring),
      draftType: body.draftType,
      draftOrderMethod: body.draftOrderMethod,
      rookieDraftMode: body.rookieDraftMode,
      rookieDraftRounds: JSON.stringify(rookieRounds),
      tradeablePickYears: body.tradeablePickYears,
      tradeDeadlines: JSON.stringify(defaultTradeDeadlines(body.sportsEnabled)),
      tradeReview: body.tradeReview,
      waiverType: body.waiverType,
      faabBudget: body.faabBudget,
      faabMode: body.faabMode,
      waiverSchedule: JSON.stringify(defaultWaiverSchedule(body.sportsEnabled)),
      irEligibleDesignations: JSON.stringify(defaultIrDesignations(body.sportsEnabled)),
      defenseMode: 'TEAM',
      playoffTeams: body.playoffTeams,
      playoffStartWeek: body.playoffStartWeek,
      regularSeasonWeeks: JSON.stringify(seasonWeeks),
      playoffRounds: body.playoffRounds,
      playoffFormat: body.playoffFormat,
      weeksPerRound: body.weeksPerRound,
      positionLimits: '{}',
      rookieDraftDates: JSON.stringify(Object.fromEntries(body.sportsEnabled.map((s: string) => [s, '']))),
      divisions: 0,
      sportNames: '{}',
      championshipNames: '{}',
      championshipLogos: '{}',
      breakWeeks: '{}',
    }).returning()

    // Commissioner membership + their franchise
    await db.insert(leagueMembers).values({
      id: nanoid(), leagueId, userId: session.user.id, role: 'COMMISSIONER',
    })

    const teamId = nanoid()
    const teamName = body.teamName?.trim() || `${session.user.name ?? 'My'} Franchise`
    await db.insert(teams).values({
      id: teamId,
      name: teamName,
      abbreviation: teamName.slice(0, 4).toUpperCase(),
      userId: session.user.id,
      leagueId,
    })

    // Blank current-season records for each enabled sport.
    await db.insert(teamRecords).values(
      body.sportsEnabled.map(sport => ({
        id: nanoid(), teamId, leagueId, season: body.season, sport,
        wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0,
        finishPosition: 1, faabRemaining: body.faabBudget,
      }))
    )

    // Pending dynasty draft for the inaugural combined draft.
    await db.insert(drafts).values({
      id: nanoid(), leagueId, kind: 'DYNASTY', scope: 'OVERALL', season: body.season,
      type: body.draftType, rounds: dynastyDraftRounds(roster), status: 'PENDING',
    })

    return NextResponse.json(league, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors }, { status: 400 })
    console.error(e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
