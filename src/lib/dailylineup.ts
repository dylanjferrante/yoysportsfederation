import { db } from '@/db'
import { dailyLineups } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { weekDateRange } from '@/lib/defaults'
import { playerKickoff } from '@/lib/locks'

export function fmtDate(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function weekDates(season: string, week: number): string[] {
  const { start } = weekDateRange(season, week)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start); d.setDate(d.getDate() + i); return fmtDate(d)
  })
}

export function gameDateOf(sport: string, realTeamAbbr: string | null | undefined, season: string, week: number): string | null {
  const ko = playerKickoff(sport, realTeamAbbr, season, week)
  return ko == null ? null : fmtDate(new Date(ko))
}

export async function teamDayLineups(leagueId: string, teamId: string, season: string, sport: string, dates: string[]): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {}
  if (!dates.length) return out
  const rows = await db.select().from(dailyLineups)
    .where(and(eq(dailyLineups.leagueId, leagueId), eq(dailyLineups.teamId, teamId), eq(dailyLineups.season, season), eq(dailyLineups.sport, sport), inArray(dailyLineups.date, dates)))
  for (const r of rows) (out[r.date] ??= {})[r.playerId] = r.slot
  return out
}

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
