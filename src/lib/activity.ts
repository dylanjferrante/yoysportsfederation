import { db } from '@/db'
import { activity, commissionerActions } from '@/db/schema'
import { nanoid } from 'nanoid'
import { dispatch, EventType } from '@/lib/notifications'

// Record a league activity-feed entry.
export async function logActivity(leagueId: string, type: string, message: string, teamId?: string | null, data?: Record<string, unknown>) {
  try {
    await db.insert(activity).values({ id: nanoid(), leagueId, type, message, teamId: teamId ?? null, data: data ? JSON.stringify(data) : null })
  } catch { /* non-fatal */ }
}

// Append an audited commissioner action (who did what, with details) to the
// commissioner_actions log.
export async function logCommissionerAction(leagueId: string, userId: string, action: string, details: Record<string, unknown> = {}) {
  try {
    await db.insert(commissionerActions).values({ id: nanoid(), leagueId, userId, action, details: JSON.stringify(details) })
  } catch { /* non-fatal */ }
}

// Notify one or more users. Routes through the multi-channel dispatcher
// (in-app + opted-in email/push), respecting each user's preferences.
export async function notify(userIds: string | string[], message: string, link?: string, event: EventType = 'LEAGUE') {
  await dispatch(userIds, event, message, link)
}

// A roster move's details for the activity log, from the player's record: kind is SIGNED (free-agent
// add), CLAIMED (waivers), DROPPED or TRADED.
export async function moveData(playerId: string, kind: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const { players } = await import('@/db/schema')
  const { eq } = await import('drizzle-orm')
  const [p] = await db.select({ name: players.name, sport: players.sport, team: players.realTeamAbbr, position: players.position, eligible: players.eligiblePositions }).from(players).where(eq(players.id, playerId)).limit(1)
  if (!p) return { kind, ...extra }
  let pos = p.position ?? ''
  try { const e = JSON.parse(p.eligible ?? '[]') as string[]; if (e.length > 1) pos = e.join('/') } catch { /* keep position */ }
  return { kind, sport: p.sport, player: p.name, team: p.team ?? '', pos, playerId, ...extra }
}
