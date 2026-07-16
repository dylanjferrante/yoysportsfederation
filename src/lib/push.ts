import { db } from '@/db'
import { deviceTokens } from '@/db/schema'
import { inArray } from 'drizzle-orm'

export async function sendPush(userIds: string[], title: string, body: string, data: Record<string, unknown> = {}): Promise<void> {
  try {
    const ids = [...new Set(userIds.filter(Boolean))]
    if (!ids.length) return
    const rows = await db.select({ token: deviceTokens.token }).from(deviceTokens).where(inArray(deviceTokens.userId, ids))
    const tokens = rows.map(r => r.token).filter(t => /^ExponentPushToken\[/.test(t))
    if (!tokens.length) return
    const messages = tokens.map(to => ({ to, title, body, data, sound: 'default' as const }))
    for (let i = 0; i < messages.length; i += 100) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
      }).catch(() => {})
    }
  } catch {}
}
