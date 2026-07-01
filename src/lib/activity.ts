import { db } from '@/db'
import { activity } from '@/db/schema'
import { nanoid } from 'nanoid'
import { dispatch, EventType } from '@/lib/notifications'

// Record a league activity-feed entry.
export async function logActivity(leagueId: string, type: string, message: string, teamId?: string | null) {
  try {
    await db.insert(activity).values({ id: nanoid(), leagueId, type, message, teamId: teamId ?? null })
  } catch { /* non-fatal */ }
}

// Notify one or more users. Routes through the multi-channel dispatcher
// (in-app + opted-in email/push), respecting each user's preferences.
export async function notify(userIds: string | string[], message: string, link?: string, event: EventType = 'LEAGUE') {
  await dispatch(userIds, event, message, link)
}
