import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (league.commissionerId !== session.user.id) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })

  const body = await req.json()

  // Only allow updating certain fields
  const allowed = [
    'name', 'description', 'isPublic', 'maxTeams',
    'rosterSettings', 'scoringSettings',
    'draftType', 'draftDate', 'auctionBudget', 'secondsPerPick', 'autoPickEnabled',
    'tradeDeadline', 'tradeReview', 'tradeReviewHours', 'vetoVotesRequired',
    'waiverType', 'faabBudget', 'waiverDay', 'waiverHour', 'lockDay',
    'playoffTeams', 'playoffStartWeek', 'regularSeasonWeeks', 'playoffRounds',
  ] as const

  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  // Serialize JSON fields if passed as objects
  if (typeof update.rosterSettings === 'object') update.rosterSettings = JSON.stringify(update.rosterSettings)
  if (typeof update.scoringSettings === 'object') update.scoringSettings = JSON.stringify(update.scoringSettings)

  const [updated] = await db.update(leagues).set(update).where(eq(leagues.id, id)).returning()
  return NextResponse.json(updated)
}
