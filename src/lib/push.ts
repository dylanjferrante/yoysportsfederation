import { db } from '@/db'
import { deviceTokens } from '@/db/schema'
import { inArray } from 'drizzle-orm'

// Send a push notification to one or more users' registered devices via the
// Expo Push API (https://docs.expo.dev/push-notifications/sending-notifications).
// No-op when nobody has a device registered. Fire-and-forget; never throws into
// the caller's flow.
export async function sendPush(userIds: string[], title: string, body: string, data: Record<string, unknown> = {}): Promise<void> {
  try {
    const ids = [...new Set(userIds.filter(Boolean))]
    if (!ids.length) return
    const rows = await db.select({ token: deviceTokens.token }).from(deviceTokens).where(inArray(deviceTokens.userId, ids))
    const tokens = rows.map(r => r.token).filter(t => /^ExponentPushToken\[/.test(t))
    if (!tokens.length) return
    const messages = tokens.map(to => ({ to, title, body, data, sound: 'default' as const }))
    // Expo accepts up to 100 messages per request.
    for (let i = 0; i < messages.length; i += 100) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
      }).catch(() => {})
    }
  } catch { /* push must never break the originating action */ }
}
