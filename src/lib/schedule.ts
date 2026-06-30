// Real-schedule opponent lookup, backed by the game_schedule table (populated
// from get<Sport>TeamSchedule via `npm run tank01:schedule`). Replaces the
// synthetic round-robin in realschedule.ts when real data is present; callers
// fall back to realOpponents() when this returns null (no schedule loaded).

import { db } from '@/db'
import { gameSchedule } from '@/db/schema'
import { and, eq, gte, lte } from 'drizzle-orm'
import { weekDateRange } from '@/lib/defaults'
import type { Opp } from '@/lib/realschedule'

const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

// Real opponents for the given teams in a sport's fantasy week. Returns null if
// no schedule data exists for the sport (so the caller can fall back). A team
// with no game that week is simply absent from the map (real bye / off day).
export async function scheduleOpponents(sport: string, season: string, abbrs: string[], week: number): Promise<Record<string, Opp> | null> {
  const [has] = await db.select({ id: gameSchedule.id }).from(gameSchedule).where(eq(gameSchedule.sport, sport)).limit(1)
  if (!has) return null

  const { start, end } = weekDateRange(season, week)
  const from = ymd(start)
  const to = ymd(new Date(end.getTime() + 86_400_000)) // inclusive of the final day
  const rows = await db.select({ home: gameSchedule.homeAbbr, away: gameSchedule.awayAbbr }).from(gameSchedule)
    .where(and(eq(gameSchedule.sport, sport), gte(gameSchedule.gameDate, from), lte(gameSchedule.gameDate, to)))

  const want = new Set(abbrs.filter(Boolean))
  const map: Record<string, Opp> = {}
  for (const g of rows) {
    // First game of the week wins the "this week's opponent" label.
    if (want.has(g.home) && !map[g.home]) map[g.home] = { opp: g.away, home: true }
    if (want.has(g.away) && !map[g.away]) map[g.away] = { opp: g.home, home: false }
  }
  return map
}

// Real kickoff time (epoch ms) per team for a sport's fantasy week, from the
// schedule's gameTimeEpoch. A team with multiple games that week locks at its
// EARLIEST game. Returns null if no schedule data exists (caller falls back to
// the synthetic playerKickoff in locks.ts).
export async function scheduleKickoffs(sport: string, season: string, week: number): Promise<Record<string, number> | null> {
  const [has] = await db.select({ id: gameSchedule.id }).from(gameSchedule).where(eq(gameSchedule.sport, sport)).limit(1)
  if (!has) return null

  const { start, end } = weekDateRange(season, week)
  const from = ymd(start)
  const to = ymd(new Date(end.getTime() + 86_400_000))
  const rows = await db.select({ home: gameSchedule.homeAbbr, away: gameSchedule.awayAbbr, epoch: gameSchedule.gameTimeEpoch }).from(gameSchedule)
    .where(and(eq(gameSchedule.sport, sport), gte(gameSchedule.gameDate, from), lte(gameSchedule.gameDate, to)))

  const out: Record<string, number> = {}
  for (const g of rows) {
    const sec = Number(g.epoch)
    if (!Number.isFinite(sec) || sec <= 0) continue
    const ms = Math.round(sec * 1000)
    for (const ab of [g.home, g.away]) if (ab && (out[ab] == null || ms < out[ab])) out[ab] = ms
  }
  return out
}
