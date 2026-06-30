import { db } from '@/db'
import { dailyLineups } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { weekDateRange } from '@/lib/defaults'
import { playerKickoff } from '@/lib/locks'

// ── Daily-lineup support (NHL/NBA/MLB) ───────────────────────────────────────
// A "daily" sport lets an owner set a different starting lineup each calendar
// day of the fantasy week, so a bench player can fill a slot on a day the slot's
// usual starter is off. The standing rosters.slot lineup applies to any day the
// owner hasn't explicitly overridden.

// Local YYYY-MM-DD for a Date (matches how playerKickoff sets local hours).
export function fmtDate(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// The seven calendar dates that make up a fantasy week.
export function weekDates(season: string, week: number): string[] {
  const { start } = weekDateRange(season, week)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start); d.setDate(d.getDate() + i); return fmtDate(d)
  })
}

// The date a player's single game falls on this week (from their deterministic
// kickoff), or null when unknown (no real team).
export function gameDateOf(sport: string, realTeamAbbr: string | null | undefined, season: string, week: number): string | null {
  const ko = playerKickoff(sport, realTeamAbbr, season, week)
  return ko == null ? null : fmtDate(new Date(ko))
}

// Per-day slot overrides for one team+sport+season across a set of dates:
// returns { [date]: { [playerId]: slot } }.
export async function teamDayLineups(leagueId: string, teamId: string, season: string, sport: string, dates: string[]): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {}
  if (!dates.length) return out
  const rows = await db.select().from(dailyLineups)
    .where(and(eq(dailyLineups.leagueId, leagueId), eq(dailyLineups.teamId, teamId), eq(dailyLineups.season, season), eq(dailyLineups.sport, sport), inArray(dailyLineups.date, dates)))
  for (const r of rows) (out[r.date] ??= {})[r.playerId] = r.slot
  return out
}

// All teams' per-day slot overrides for a league+sport+season over a week's
// dates, keyed `${teamId}|${date}` → { [playerId]: slot }. Used by the scoring
// engine. Scoping by season keeps overlapping seasons (a finishing prior season
// and a started new one) from reading each other's lineups.
export async function leagueDayLineups(leagueId: string, season: string, sport: string, dates: string[]): Promise<Map<string, Record<string, string>>> {
  const map = new Map<string, Record<string, string>>()
  if (!dates.length) return map
  const rows = await db.select().from(dailyLineups)
    .where(and(eq(dailyLineups.leagueId, leagueId), eq(dailyLineups.season, season), eq(dailyLineups.sport, sport), inArray(dailyLineups.date, dates)))
  for (const r of rows) {
    const key = `${r.teamId}|${r.date}`
    const m = map.get(key) ?? {}
    m[r.playerId] = r.slot
    map.set(key, m)
  }
  return map
}
