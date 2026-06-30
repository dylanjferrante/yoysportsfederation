// Web-push transport. Env-gated: when VAPID keys aren't configured this is a
// safe no-op. To enable real delivery set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
// (and NEXT_PUBLIC_VAPID_PUBLIC_KEY for the client). Generate a keypair with:
//   npm run push:keys
import webpush from 'web-push'

type Sub = { endpoint: string; p256dh: string; auth: string }
export type PushResult = 'ok' | 'gone' | 'error' | 'skipped'

let configured = false
export function pushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

function ensureVapid() {
  if (configured || !pushConfigured()) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:no-reply@nexusfantasy.com',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  configured = true
}

// Send one push. Returns 'gone' for an expired/unsubscribed endpoint (404/410)
// so the caller can prune it — important so dead subscriptions don't accumulate.
export async function sendPush(sub: Sub, message: string, link?: string): Promise<PushResult> {
  if (!pushConfigured()) {
    if (process.env.NODE_ENV !== 'production') console.log(`[push:noop] → ${sub.endpoint.slice(0, 40)}… · ${message}`)
    return 'skipped'
  }
  ensureVapid()
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title: 'Nexus Federation', body: message, link: link ?? '/' }),
      { TTL: 60 * 60 * 12 },
    )
    return 'ok'
  } catch (e) {
    const status = (e as { statusCode?: number })?.statusCode
    if (status === 404 || status === 410) return 'gone'
    console.error('[push] send failed', status ?? e)
    return 'error'
  }
}
