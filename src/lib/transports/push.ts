// Web-push transport. Env-gated: when VAPID keys aren't configured this is a
// safe no-op. To enable real delivery, set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
// (and NEXT_PUBLIC_VAPID_PUBLIC_KEY for the client), install `web-push`, and
// uncomment the web-push block below.
type Sub = { endpoint: string; p256dh: string; auth: string }

export function pushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

export async function sendPush(sub: Sub, message: string, link?: string): Promise<void> {
  if (!pushConfigured()) {
    if (process.env.NODE_ENV !== 'production') console.log(`[push:noop] → ${sub.endpoint.slice(0, 40)}… · ${message}`)
    return
  }
  try {
    // const webpush = (await import('web-push')).default
    // webpush.setVapidDetails('mailto:no-reply@nexusfantasy.com', process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)
    // await webpush.sendNotification(
    //   { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    //   JSON.stringify({ title: 'Nexus Federation', body: message, link }),
    // )
    console.log(`[push:send] → ${sub.endpoint.slice(0, 40)}…`)
  } catch (e) {
    console.error('[push] send failed', e)
  }
}
