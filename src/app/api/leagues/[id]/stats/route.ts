import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { safeParse } from '@/lib/utils'
import { tank01Configured } from '@/lib/providers/tank01'
import { ingestDate, usageThisMonth, MONTHLY_CAP } from '@/lib/livestats'
import { advanceLeague, rescoreWeeks } from '@/lib/advance'

// Live-stats status (GET) and a commissioner-triggered pull (POST).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select({ live: leagues.liveScoring }).from(leagues).where(eq(leagues.id, id)).limit(1)
  return NextResponse.json({ configured: tank01Configured(), used: await usageThisMonth(), cap: MONTHLY_CAP, live: !!league?.live })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 })
  if (league.commissionerId !== session.user.id) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
  if (!tank01Configured()) return NextResponse.json({ error: 'No stats provider key configured (set TANK01_RAPIDAPI_KEY).' }, { status: 400 })

  // Pull finished games for the league's enabled sports across the last `days` days.
  const { days = 2 } = await req.json().catch(() => ({})) as { days?: number }
  const mode = league.liveScoring ? 'LIVE' : 'FINAL'
  const sports = safeParse<string[]>(league.sportsEnabled, []) as any[]
  const results: Record<string, { ingested: number; calls: number; week?: number; skipped?: string }> = {}
  const affected: { sport: string; week: number }[] = []
  for (let d = 0; d < Math.min(days, 7); d++) {
    const date = new Date(Date.now() - d * 86_400_000)
    for (const sport of sports) {
      const r = await ingestDate(sport, date, league.season, mode)
      results[`${sport}:${date.toISOString().slice(0, 10)}`] = r
      if (r.ingested > 0 && r.week) affected.push({ sport, week: r.week })
    }
  }
  // Re-score the weeks that received real stats (overwrites simulated scores),
  // then bring the rest of the league up to date.
  await rescoreWeeks(league, affected)
  await advanceLeague(league, true)
  return NextResponse.json({ ok: true, used: await usageThisMonth(), cap: MONTHLY_CAP, results })
}
