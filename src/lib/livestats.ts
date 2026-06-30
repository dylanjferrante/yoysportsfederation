import { db } from '@/db'
import { apiUsage, realStatLines, players } from '@/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { weekDateRange, DEFAULT_SCORING } from '@/lib/defaults'
import { scorePlayer } from '@/lib/scoring'
import { tank01Configured, tank01GamesForDate, tank01BoxScore } from '@/lib/providers/tank01'
import { mapBoxScoreBase, deriveWeekly } from '@/lib/providers/boxscore-map'

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
export function fantasyWeekOf(season: string, date: Date): number | null {
  for (let w = 1; w <= 45; w++) {
    const { start, end } = weekDateRange(season, w)
    if (date >= start && date <= new Date(end.getTime() + 86_400_000)) return w
  }
  return null
}

const yyyymmdd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

export type IngestMode = 'FINAL' | 'LIVE'
// Which games to ingest: FINAL = finished only (daily finalize); LIVE = finished
// plus in-progress (live scoring), but never not-yet-started games.
function gamesToIngest(games: { gameId: string; status: string }[], mode: IngestMode) {
  const isFinal = (s: string) => /final|completed|closed/i.test(s)
  const inProgress = (s: string) => /in.?progress|live|q[1-4]\b|half|inning|period|ot\b|delay|active/i.test(s)
  return games.filter(g => isFinal(g.status) || (mode === 'LIVE' && inProgress(g.status)))
}

// Box scores and games are GLOBAL (the same real game serves every league), so
// fetch each game ONCE per cron run and reuse the result for every season that
// needs it. Returns externalId → derived weekly stat line, plus the call count.
// Mutates nothing in the DB; respects the monthly budget.
async function fetchDayStats(sport: Sport, date: Date, mode: IngestMode): Promise<{ agg: Record<string, Record<string, number>>; calls: number; budget: boolean }> {
  if ((await budgetLeft()) < 2) return { agg: {}, calls: 0, budget: false }
  let calls = 0
  const games = await tank01GamesForDate(sport, yyyymmdd(date)); calls++; await bumpUsage(1)
  const want = gamesToIngest(games, mode)

  const agg: Record<string, Record<string, number>> = {}
  for (const g of want) {
    if ((await budgetLeft()) < 1) break
    const lines = await tank01BoxScore(sport, g.gameId); calls++; await bumpUsage(1)
    for (const l of lines) {
      const base = mapBoxScoreBase(sport, l.raw)
      const a = (agg[l.externalId] ??= {})
      for (const [k, v] of Object.entries(base)) a[k] = (a[k] ?? 0) + v
    }
  }
  for (const eid of Object.keys(agg)) agg[eid] = deriveWeekly(sport, agg[eid])
  return { agg, calls, budget: true }
}

// Upsert an already-fetched day's stats into one season's fantasy week (no API
// calls). externalId → players.id is resolved against the global player pool.
async function upsertDay(sport: Sport, season: string, date: Date, agg: Record<string, Record<string, number>>): Promise<number> {
  const week = fantasyWeekOf(season, date)
  if (week == null) return 0
  const ext = Object.keys(agg)
  if (!ext.length) return 0
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
  return ingested
}

// Single-season ingest (one fetch + one upsert). Used by the commissioner pull.
export async function ingestDate(sport: Sport, date: Date, season: string, mode: IngestMode = 'FINAL'): Promise<{ ingested: number; calls: number; week?: number; skipped?: string }> {
  if (!tank01Configured()) return { ingested: 0, calls: 0, skipped: 'no API key' }
  const week = fantasyWeekOf(season, date)
  if (week == null) return { ingested: 0, calls: 0, skipped: 'date outside season' }
  const { agg, calls, budget } = await fetchDayStats(sport, date, mode)
  if (!budget) return { ingested: 0, calls, week, skipped: 'monthly API budget reached' }
  const ingested = await upsertDay(sport, season, date, agg)
  return { ingested, calls, week }
}

// Scale-aware ingest: fetch each game ONCE, then upsert into every season that
// needs it. Used by the scheduled cron so N leagues sharing real games don't
// multiply the API spend. Returns per-season ingested counts + total calls.
export async function ingestDateForSeasons(sport: Sport, date: Date, seasons: string[], mode: IngestMode = 'FINAL'): Promise<{ calls: number; bySeason: Record<string, number>; skipped?: string }> {
  if (!tank01Configured()) return { calls: 0, bySeason: {}, skipped: 'no API key' }
  const uniq = [...new Set(seasons)]
  const { agg, calls, budget } = await fetchDayStats(sport, date, mode)
  if (!budget) return { calls, bySeason: {}, skipped: 'monthly API budget reached' }
  const bySeason: Record<string, number> = {}
  for (const season of uniq) bySeason[season] = await upsertDay(sport, season, date, agg)
  return { calls, bySeason }
}

// Derive projections from REAL ingested stats. Tank01 exposes no fantasy-point
// projections for NBA/NHL/MLB (and only preseason ones for NFL), so we project
// each player from their own real production: the mean of their per-week real
// stat lines becomes the projected stat line, scored under default scoring for a
// projectedPoints. Costs NO API calls. Only players with ≥1 real line are touched
// (others keep whatever projection they had). ADP is then re-ranked per sport.
export async function deriveProjections(season: string): Promise<{ updated: number }> {
  const lines = await db.select({ playerId: realStatLines.playerId, sport: realStatLines.sport, stats: realStatLines.stats })
    .from(realStatLines).where(eq(realStatLines.season, season))

  const byPlayer = new Map<string, { sport: string; weeks: Record<string, number>[] }>()
  for (const l of lines) {
    const e = byPlayer.get(l.playerId) ?? { sport: l.sport, weeks: [] }
    try { e.weeks.push(JSON.parse(l.stats ?? '{}')) } catch { /* skip bad line */ }
    byPlayer.set(l.playerId, e)
  }

  let updated = 0
  const sportsTouched = new Set<string>()
  for (const [pid, { sport, weeks }] of byPlayer) {
    if (!weeks.length) continue
    const sum: Record<string, number> = {}
    for (const w of weeks) for (const [k, v] of Object.entries(w)) if (typeof v === 'number') sum[k] = (sum[k] ?? 0) + v
    const mean: Record<string, number> = {}
    for (const [k, v] of Object.entries(sum)) mean[k] = v / weeks.length
    const proj = +scorePlayer(mean, DEFAULT_SCORING[sport] ?? {}).toFixed(1)
    await db.update(players).set({ stats: JSON.stringify(mean), projectedPoints: proj, weeklyAvg: proj }).where(eq(players.id, pid))
    updated++
    sportsTouched.add(sport)
  }

  // Re-rank ADP within each touched sport (1 = highest projected points).
  for (const sport of sportsTouched) {
    await db.run(sql`UPDATE players SET adp = (SELECT COUNT(*) + 1 FROM players p2 WHERE p2.sport = players.sport AND p2.projected_points > players.projected_points) WHERE sport = ${sport}`)
  }
  return { updated }
}

// Real stat line for a player in a fantasy week, if one has been ingested.
export async function realStatsFor(playerId: string, sport: string, season: string, week: number): Promise<Record<string, number> | null> {
  const [row] = await db.select({ stats: realStatLines.stats }).from(realStatLines)
    .where(and(eq(realStatLines.playerId, playerId), eq(realStatLines.sport, sport), eq(realStatLines.season, season), eq(realStatLines.week, week))).limit(1)
  if (!row) return null
  try { return JSON.parse(row.stats ?? '{}') } catch { return null }
}
