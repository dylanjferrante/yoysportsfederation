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
    'tradeDeadline', 'tradeDeadlines', 'tradeReview', 'tradeReviewHours', 'vetoVotesRequired',
    'waiverType', 'faabBudget', 'faabMode', 'waiverDay', 'waiverHour', 'waiverSchedule', 'irEligibleDesignations', 'defenseMode', 'lockDay',
    'playoffTeams', 'playoffStartWeek', 'regularSeasonWeeks', 'playoffRounds', 'playoffFormat', 'weeksPerRound', 'positionLimits',
    'duesAmount',
  ] as const

  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  // Serialize JSON object/array fields.
  for (const k of ['divisionLogos', 'sportsEnabled', 'rosterSettings', 'scoringSettings', 'draftRounds', 'federationScoring', 'sportSchedule', 'rookieDraftRounds', 'regularSeasonWeeks', 'tradeDeadlines', 'waiverSchedule', 'irEligibleDesignations', 'positionLimits']) {
    if (k in update && typeof update[k] !== 'string') update[k] = JSON.stringify(update[k])
  }

  // Recompute the schedule if sports, the season anchor, or any sport's
  // regular-season length changed (so per-sport playoff start stays correct) —
  // unless the client sent an explicit, fully-edited schedule, which wins.
  if (!('sportSchedule' in update) && ('sportsEnabled' in update || 'seasonStart' in update || 'regularSeasonWeeks' in update)) {
    const sportsEnabled = 'sportsEnabled' in update
      ? safeParse<string[]>(update.sportsEnabled as string, [])
      : safeParse<string[]>(league.sportsEnabled, [])
    const seasonStart = (update.seasonStart as string) ?? league.seasonStart ?? 'FOOTBALL'
    const seasonWeeks = safeParse<Record<string, number>>((update.regularSeasonWeeks as string) ?? league.regularSeasonWeeks, {})
    update.sportSchedule = JSON.stringify(buildSchedule(seasonStart, sportsEnabled, seasonWeeks))
  }

  const [updated] = await db.update(leagues).set(update).where(eq(leagues.id, id)).returning()
  return NextResponse.json(updated)
}
