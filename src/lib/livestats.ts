import { db } from '@/db'
import { apiUsage, realStatLines, players } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { weekDateRange } from '@/lib/defaults'
import { tank01Configured, tank01GamesForDate, tank01BoxScore } from '@/lib/providers/tank01'

type Sport = 'NFL' | 'NBA' | 'NHL' | 'MLB'

// Hard monthly cap so a free-tier key (≈1000/mo) is never exceeded.
export const MONTHLY_CAP = Number(process.env.TANK01_MONTHLY_CAP ?? 1000)
const ym = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export async function usageThisMonth(): Promise<number> {
  const [row] = await db.select().from(apiUsage).where(eq(apiUsage.yearMonth, ym())).limit(1)
  return row?.count ?? 0
}
async function bumpUsage(n = 1) {
  const month = ym()
  const [row] = await db.select().from(apiUsage).where(eq(apiUsage.yearMonth, month)).limit(1)
  if (row) await db.update(apiUsage).set({ count: (row.count ?? 0) + n }).where(eq(apiUsage.id, row.id))
  else await db.insert(apiUsage).values({ id: nanoid(), yearMonth: month, count: n })
}
async function budgetLeft(): Promise<number> { return MONTHLY_CAP - (await usageThisMonth()) }

// Map a calendar date to the fantasy week of a season (the week whose range covers it).
function fantasyWeekOf(season: string, date: Date): number | null {
  for (let w = 1; w <= 45; w++) {
    const { start, end } = weekDateRange(season, w)
    if (date >= start && date <= new Date(end.getTime() + 86_400_000)) return w
  }
  return null
}

const yyyymmdd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

// Pull every finished game for a sport on a date and upsert real per-player stat
// lines for that fantasy week. Idempotent; respects the monthly call budget.
export async function ingestDate(sport: Sport, date: Date, season: string): Promise<{ ingested: number; calls: number; skipped?: string }> {
  if (!tank01Configured()) return { ingested: 0, calls: 0, skipped: 'no API key' }
  const week = fantasyWeekOf(season, date)
  if (week == null) return { ingested: 0, calls: 0, skipped: 'date outside season' }
  if ((await budgetLeft()) < 2) return { ingested: 0, calls: 0, skipped: 'monthly API budget reached' }

  let calls = 0
  const games = await tank01GamesForDate(sport, yyyymmdd(date)); calls++; await bumpUsage(1)
  const finished = games.filter(g => /final|completed|closed/i.test(g.status))

  // externalId → aggregated stat line for the week.
  const agg: Record<string, Record<string, number>> = {}
  for (const g of finished) {
    if ((await budgetLeft()) < 1) break
    const lines = await tank01BoxScore(sport, g.gameId); calls++; await bumpUsage(1)
    for (const l of lines) {
      const a = (agg[l.externalId] ??= {})
      for (const [k, v] of Object.entries(l.stats)) a[k] = (a[k] ?? 0) + v
    }
  }

  // Map provider externalIds to our players and upsert this week's line.
  const ext = Object.keys(agg)
  if (!ext.length) return { ingested: 0, calls }
  const ours = await db.select({ id: players.id, externalId: players.externalId }).from(players).where(eq(players.sport, sport))
  const byExt = new Map(ours.filter(p => p.externalId).map(p => [String(p.externalId), p.id]))
  let ingested = 0
  for (const eid of ext) {
    const pid = byExt.get(eid)
    if (!pid) continue
    const stats = JSON.stringify(agg[eid])
    const [existing] = await db.select({ id: realStatLines.id }).from(realStatLines)
      .where(and(eq(realStatLines.playerId, pid), eq(realStatLines.sport, sport), eq(realStatLines.season, season), eq(realStatLines.week, week))).limit(1)
    if (existing) await db.update(realStatLines).set({ stats, updatedAt: new Date().toISOString() }).where(eq(realStatLines.id, existing.id))
    else await db.insert(realStatLines).values({ id: nanoid(), playerId: pid, sport, season, week, stats })
    ingested++
  }
  return { ingested, calls }
}

// Real stat line for a player in a fantasy week, if one has been ingested.
export async function realStatsFor(playerId: string, sport: string, season: string, week: number): Promise<Record<string, number> | null> {
  const [row] = await db.select({ stats: realStatLines.stats }).from(realStatLines)
    .where(and(eq(realStatLines.playerId, playerId), eq(realStatLines.sport, sport), eq(realStatLines.season, season), eq(realStatLines.week, week))).limit(1)
  if (!row) return null
  try { return JSON.parse(row.stats ?? '{}') } catch { return null }
}
