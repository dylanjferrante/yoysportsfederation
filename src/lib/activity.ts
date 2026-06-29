import { db } from '@/db'
import { activity, notifications } from '@/db/schema'
import { nanoid } from 'nanoid'

// Record a league activity-feed entry.
export async function logActivity(leagueId: string, type: string, message: string, teamId?: string | null) {
  try {
    await db.insert(activity).values({ id: nanoid(), leagueId, type, message, teamId: teamId ?? null })
  } catch { /* non-fatal */ }
}

// Send an in-app notification to one or more users.
export async function notify(userIds: string | string[], message: string, link?: string) {
  const ids = Array.isArray(userIds) ? userIds : [userIds]
  if (!ids.length) return
  try {
    await db.insert(notifications).values(ids.map(userId => ({ id: nanoid(), userId, message, link: link ?? null })))
  } catch { /* non-fatal */ }
}
