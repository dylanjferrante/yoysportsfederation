import { NextResponse } from 'next/server'
import { db } from '@/db'
import { leagues } from '@/db/schema'
import { safeParse } from '@/lib/utils'
import { tank01Configured } from '@/lib/providers/tank01'
import { ingestDate, usageThisMonth, MONTHLY_CAP } from '@/lib/livestats'
import { advanceLeague, rescoreWeeks } from '@/lib/advance'

// ── Scheduled live-stats pull ────────────────────────────────────────────────
// The production cron entry point. A scheduler (Vercel Cron, GitHub Actions,
// cron + curl) hits this once or twice a day, AFTER games finish, so finished
// box scores are ingested and the affected fantasy weeks re-scored from real
// stats. Protected by CRON_SECRET so it isn't publicly triggerable.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/stats
//
// Optional query: ?days=2 (lookback, max 7). The monthly call budget is enforced
// inside ingestDate, so this can run safely on a free-tier key.

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // must be configured to run
  const header = req.headers.get('authorization') || ''
  const url = new URL(req.url)
  return header === `Bearer ${secret}` || url.searchParams.get('secret') === secret
}

async function run(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!tank01Configured()) return NextResponse.json({ error: 'No stats provider key configured (set TANK01_RAPIDAPI_KEY).' }, { status: 400 })

  const url = new URL(req.url)
  const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? 2), 1), 7)

  const all = await db.select().from(leagues)
  const summary: Record<string, { ingested: number; rescored: number }> = {}
  for (const league of all) {
    const sports = safeParse<string[]>(league.sportsEnabled, []) as any[]
    const affected: { sport: string; week: number }[] = []
    let ingested = 0
    for (let d = 0; d < days; d++) {
      const date = new Date(Date.now() - d * 86_400_000)
      for (const sport of sports) {
        const r = await ingestDate(sport, date, league.season)
        ingested += r.ingested
        if (r.ingested > 0 && r.week) affected.push({ sport, week: r.week })
      }
    }
    await rescoreWeeks(league, affected)
    await advanceLeague(league, true)
    summary[league.id] = { ingested, rescored: new Set(affected.map(a => `${a.sport}:${a.week}`)).size }
  }
  return NextResponse.json({ ok: true, used: await usageThisMonth(), cap: MONTHLY_CAP, leagues: all.length, summary })
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
