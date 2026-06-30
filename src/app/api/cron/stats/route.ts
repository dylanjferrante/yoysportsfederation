import { NextResponse } from 'next/server'
import { db } from '@/db'
import { leagues } from '@/db/schema'
import { safeParse } from '@/lib/utils'
import { tank01Configured } from '@/lib/providers/tank01'
import { ingestDateForSeasons, fantasyWeekOf, usageThisMonth, MONTHLY_CAP, deriveProjections, type IngestMode } from '@/lib/livestats'
import { advanceLeague, rescoreWeeks } from '@/lib/advance'

// ── Scheduled live-stats pull ────────────────────────────────────────────────
// The production cron entry point. A scheduler (Vercel Cron, GitHub Actions,
// cron + curl) hits this so finished (and optionally in-progress) box scores are
// ingested and the affected fantasy weeks re-scored from real stats.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/stats
//   # live in-game scoring (more API calls — needs a paid tier / headroom):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/stats?mode=live
//
// Scale: real games are GLOBAL, so each (sport, date) is fetched ONCE and upserted
// into every season that needs it — the spend does not grow with league count.
// The monthly call budget is enforced inside the ingest layer. Protected by
// CRON_SECRET so it isn't publicly triggerable.

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization') || ''
  const url = new URL(req.url)
  return header === `Bearer ${secret}` || url.searchParams.get('secret') === secret
}

async function run(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!tank01Configured()) return NextResponse.json({ error: 'No stats provider key configured (set TANK01_RAPIDAPI_KEY).' }, { status: 400 })

  const url = new URL(req.url)
  const all = await db.select().from(leagues)

  // Live mode if explicitly requested or any league has live scoring enabled.
  const liveRequested = url.searchParams.get('mode') === 'live'
  const anyLive = all.some(l => (l as any).liveScoring)
  const mode: IngestMode = liveRequested || anyLive ? 'LIVE' : 'FINAL'
  // Live cares only about today; finalize looks back a couple days to catch late finals.
  const days = mode === 'LIVE' ? 1 : Math.min(Math.max(Number(url.searchParams.get('days') ?? 2), 1), 7)

  // sport → seasons that need it (dedup so each game is fetched once).
  const sportSeasons: Record<string, Set<string>> = {}
  for (const l of all) for (const s of safeParse<string[]>(l.sportsEnabled, [])) (sportSeasons[s] ??= new Set()).add(l.season)

  const dates = Array.from({ length: days }, (_, d) => new Date(Date.now() - d * 86_400_000))
  let calls = 0
  for (const date of dates) {
    for (const [sport, seasons] of Object.entries(sportSeasons)) {
      const r = await ingestDateForSeasons(sport as any, date, [...seasons], mode)
      calls += r.calls
    }
  }

  // Re-score each league's affected weeks and bring it up to date.
  const summary: Record<string, { rescored: number }> = {}
  for (const league of all) {
    const sports = safeParse<string[]>(league.sportsEnabled, [])
    const affected: { sport: string; week: number }[] = []
    for (const date of dates) for (const sport of sports) {
      const week = fantasyWeekOf(league.season, date)
      if (week) affected.push({ sport, week })
    }
    await rescoreWeeks(league, affected)
    await advanceLeague(league, true)
    summary[league.id] = { rescored: new Set(affected.map(a => `${a.sport}:${a.week}`)).size }
  }

  // Refresh projections from the freshly-ingested real stats (no API calls).
  let projected = 0
  for (const season of new Set(all.map(l => l.season))) projected += (await deriveProjections(season)).updated

  return NextResponse.json({ ok: true, mode, calls, used: await usageThisMonth(), cap: MONTHLY_CAP, leagues: all.length, projected, summary })
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
