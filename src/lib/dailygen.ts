import { gameDatesForClub, splitStatLine } from './dailysplit'
import { scorePlayer } from './scoring'

export type WeeklyRow = { playerId: string; teamId: string | null; realTeamAbbr: string | null; stats: Record<string, number> }
export type DayRow = { playerId: string; teamId: string | null; date: string; stats: Record<string, number>; points: number }

// Turn each player's weekly stat line into per-game-day box lines: pick the club's
// game days for the week, split the line across them, and score each day. Per-day
// points sum to the weekly total (linear scoring for daily sports).
export function buildDayRows(sport: string, seedKey: string, weekDates: string[], scoring: Record<string, number>, weekly: WeeklyRow[]): DayRow[] {
  const out: DayRow[] = []
  for (const r of weekly) {
    const dates = gameDatesForClub(sport, r.realTeamAbbr, weekDates, seedKey)
    if (!dates.length) continue
    for (const { date, stats } of splitStatLine(r.playerId, r.stats, dates)) {
      out.push({ playerId: r.playerId, teamId: r.teamId ?? null, date, stats, points: scorePlayer(stats, scoring) })
    }
  }
  return out
}
