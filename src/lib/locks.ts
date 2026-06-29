import { weekDateRange } from '@/lib/defaults'

// ── Per-player, per-sport game-time lineup locks ─────────────────────────────
// Real-time kickoff data isn't available from the free providers, so each
// player's game time is derived deterministically from (sport, real team, week)
// inside that league week's 7-day window. The distribution mirrors how each
// sport actually schedules games: NFL clusters on Sunday with a Thu/Mon night
// game, the winter sports and baseball spread games across most days. Once a
// player's game has kicked off, their lineup slot is frozen — you can no longer
// move them into or out of a starting spot for that week.

type Slot = { dow: number; hour: number } // day-of-week offset (0 = week start), local hour

// Candidate game slots per sport. A player is assigned one deterministically.
const GAME_SLOTS: Record<string, Slot[]> = {
  // NFL: Thu night, Sun early/late, Sun night, Mon night.
  NFL: [
    { dow: 4, hour: 20 }, // Thursday night
    { dow: 0, hour: 13 }, { dow: 0, hour: 13 }, { dow: 0, hour: 16 }, { dow: 0, hour: 16 }, // Sunday (weighted)
    { dow: 0, hour: 20 }, // Sunday night
    { dow: 1, hour: 20 }, // Monday night
  ],
  // NBA / NHL / MLB play most nights — spread across the week, evening tip-offs.
  NBA: [0, 1, 2, 3, 4, 5, 6].map(dow => ({ dow, hour: 19 })),
  NHL: [0, 1, 2, 3, 4, 5, 6].map(dow => ({ dow, hour: 19 })),
  MLB: [0, 1, 2, 3, 4, 5, 6].map(dow => ({ dow, hour: 19 })),
}

// Small deterministic string hash → unsigned 32-bit.
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

// Deterministic kickoff (epoch ms) for a player's real team in a given week.
export function playerKickoff(sport: string, realTeamAbbr: string | null | undefined, season: string, week: number): number | null {
  if (!realTeamAbbr) return null
  const slots = GAME_SLOTS[sport]
  if (!slots) return null
  const { start } = weekDateRange(season, week)
  const slot = slots[hash(`${sport}:${realTeamAbbr}:${week}`) % slots.length]
  const k = new Date(start)
  k.setDate(k.getDate() + slot.dow)
  k.setHours(slot.hour, 0, 0, 0)
  return k.getTime()
}

// Is this player's game underway/past for the given week as of `now`?
export function isPlayerLocked(
  sport: string,
  realTeamAbbr: string | null | undefined,
  season: string,
  week: number,
  now: number = Date.now(),
): boolean {
  const k = playerKickoff(sport, realTeamAbbr, season, week)
  if (k == null) return false
  return now >= k
}
