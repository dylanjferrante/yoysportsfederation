import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, matchups } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { safeParse } from '@/lib/utils'
import { rescoreWeeks } from '@/lib/advance'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (league.commissionerId !== session.user.id) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { sport?: string; week?: number }
  const sports = safeParse<string[]>(league.sportsEnabled, [])

  const targets: { sport: string; week: number }[] = []
  if (body.sport && body.week) {
    targets.push({ sport: body.sport, week: body.week })
  } else {
    for (const sport of sports) {
      const incomplete = await db.select({ week: matchups.week }).from(matchups)
        .where(and(eq(matchups.leagueId, id), eq(matchups.sport, sport), eq(matchups.isComplete, false)))
      const weeks = incomplete.map(r => r.week)
      if (weeks.length) targets.push({ sport, week: Math.min(...weeks) })
    }
  }

  await rescoreWeeks(league, targets)
  return NextResponse.json({ ok: true, scored: targets })
}
