import { db } from '@/db'
import { notifications, users, pushSubscriptions } from '@/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { sendEmail } from '@/lib/transports/email'
import { sendPush } from '@/lib/transports/push'

// ── Notification event catalog ───────────────────────────────────────────────
// Every notification belongs to an event type. Users opt each event in/out per
// channel (in-app, email, push) from their account settings.
export const EVENTS = {
  TRADE: 'Trade offers & decisions',
  WAIVER: 'Waiver & FAAB results',
  DRAFT: 'Draft — on the clock & picks',
  MATCHUP: 'Matchup results & scores',
  LINEUP: 'Lineup alerts (locks, inactive starters)',
  NEWS: 'Player news & injuries',
  LEAGUE: 'League announcements',
} as const
export type EventType = keyof typeof EVENTS
export const CHANNELS = ['inApp', 'email', 'push'] as const
export type Channel = typeof CHANNELS[number]

export type NotifyPrefs = { [C in Channel]: { enabled: boolean; events: Record<EventType, boolean> } }

export function defaultPrefs(): NotifyPrefs {
  const allEvents = () => Object.fromEntries(Object.keys(EVENTS).map(e => [e, true])) as Record<EventType, boolean>
  return {
    inApp: { enabled: true, events: allEvents() },
    email: { enabled: false, events: allEvents() },
    push: { enabled: false, events: allEvents() },
  }
}

export function parsePrefs(raw: string | null | undefined): NotifyPrefs {
  const base = defaultPrefs()
  if (!raw) return base
  try {
    const p = JSON.parse(raw) as Partial<NotifyPrefs>
    for (const ch of CHANNELS) {
      if (p[ch]) {
        base[ch].enabled = p[ch]!.enabled ?? base[ch].enabled
        base[ch].events = { ...base[ch].events, ...(p[ch]!.events ?? {}) }
      }
    }
  } catch { /* fall back to defaults */ }
  return base
}

function wants(prefs: NotifyPrefs, channel: Channel, event: EventType): boolean {
  const c = prefs[channel]
  return !!c?.enabled && c.events[event] !== false
}

// ── Unified dispatch ─────────────────────────────────────────────────────────
// Records an in-app notification for each recipient who wants it, then fans out
// to email/push for those who've opted in (transports are env-gated no-ops when
// unconfigured, so this is always safe to call).
export async function dispatch(
  userIds: string | string[],
  event: EventType,
  message: string,
  link?: string,
): Promise<void> {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))]
  if (!ids.length) return

  let recipients: { id: string; email: string; prefs: NotifyPrefs }[] = []
  try {
    const rows = await db.select({ id: users.id, email: users.email, notifyPrefs: users.notifyPrefs })
      .from(users).where(inArray(users.id, ids))
    recipients = rows.map(r => ({ id: r.id, email: r.email, prefs: parsePrefs(r.notifyPrefs) }))
  } catch { return }

  // In-app (default channel).
  const inAppTargets = recipients.filter(r => wants(r.prefs, 'inApp', event))
  if (inAppTargets.length) {
    try {
      await db.insert(notifications).values(inAppTargets.map(r => ({ id: nanoid(), userId: r.id, message, link: link ?? null })))
    } catch { /* non-fatal */ }
  }

  // Email.
  for (const r of recipients.filter(r => wants(r.prefs, 'email', event))) {
    await sendEmail(r.email, `Nexus Federation: ${EVENTS[event]}`, message, link)
  }

  // Web push — prune endpoints the browser has expired (so dead subs don't pile up).
  const pushTargets = recipients.filter(r => wants(r.prefs, 'push', event)).map(r => r.id)
  if (pushTargets.length) {
    try {
      const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, pushTargets))
      const dead: string[] = []
      for (const s of subs) { if (await sendPush(s, message, link) === 'gone') dead.push(s.id) }
      if (dead.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, dead))
    } catch { /* non-fatal */ }
  }
}
