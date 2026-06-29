import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { buildSchedule } from '@/lib/defaults'
import { safeParse } from '@/lib/utils'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (league.commissionerId !== session.user.id) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })

  const body = await req.json()

  const allowed = [
    'name', 'description', 'isPublic', 'maxTeams', 'season',
    'logoUrl', 'divisionLogos', 'sportsEnabled', 'seasonStart', 'sportSchedule',
    'rosterSettings', 'scoringSettings', 'draftRounds', 'federationScoring',
    'draftType', 'draftDate', 'auctionBudget', 'secondsPerPick', 'autoPickEnabled', 'draftOrderMethod',
    'rookieDraftMode', 'rookieDraftRounds', 'tradeablePickYears',
    'tradeDeadline', 'tradeReview', 'tradeReviewHours', 'vetoVotesRequired',
    'waiverType', 'faabBudget', 'faabMode', 'waiverDay', 'waiverHour', 'lockDay',
    'playoffTeams', 'playoffStartWeek', 'regularSeasonWeeks', 'playoffRounds',
    'duesAmount',
  ] as const

  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  // Serialize JSON object/array fields.
  for (const k of ['divisionLogos', 'sportsEnabled', 'rosterSettings', 'scoringSettings', 'draftRounds', 'federationScoring', 'sportSchedule', 'rookieDraftRounds', 'regularSeasonWeeks']) {
    if (k in update && typeof update[k] !== 'string') update[k] = JSON.stringify(update[k])
  }

  // If the enabled sports or season anchor changed, recompute the schedule.
  if ('sportsEnabled' in update || 'seasonStart' in update) {
    const sportsEnabled = 'sportsEnabled' in update
      ? safeParse<string[]>(update.sportsEnabled as string, [])
      : safeParse<string[]>(league.sportsEnabled, [])
    const seasonStart = (update.seasonStart as string) ?? league.seasonStart ?? 'FOOTBALL'
    update.sportSchedule = JSON.stringify(buildSchedule(seasonStart, sportsEnabled))
  }

  const [updated] = await db.update(leagues).set(update).where(eq(leagues.id, id)).returning()
  return NextResponse.json(updated)
}
