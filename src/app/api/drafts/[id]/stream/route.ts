import { db } from '@/db'
import { drafts, draftPicks } from '@/db/schema'
import { eq, and, count } from 'drizzle-orm'
import { subscribeDraft } from '@/lib/draft-events'

export const dynamic = 'force-dynamic'

// Server-Sent Events stream for a live draft. Replaces client polling: the client
// opens one persistent connection and re-fetches the full draft state whenever an
// `update` event arrives. Updates fire instantly via the in-process bus when a
// pick lands, and a slow DB-fingerprint poll covers cross-instance changes and
// the pick clock expiring.
async function fingerprint(draftId: string): Promise<string> {
  const [d] = await db.select({
    status: drafts.status, currentPick: drafts.currentPick, pickDeadline: drafts.pickDeadline,
    nomPlayerId: drafts.nomPlayerId, nomTeamId: drafts.nomTeamId, nomBid: drafts.nomBid,
  }).from(drafts).where(eq(drafts.id, draftId)).limit(1)
  if (!d) return 'gone'
  const [{ c } = { c: 0 }] = await db.select({ c: count() }).from(draftPicks)
    .where(and(eq(draftPicks.draftId, draftId), eq(draftPicks.isUsed, true)))
  return `${d.status}|${d.currentPick}|${d.pickDeadline}|${d.nomPlayerId}|${d.nomTeamId}|${d.nomBid}|${c}`
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const encoder = new TextEncoder()
  let closed = false
  let last = ''

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: string) => {
        if (closed) return
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`)) } catch { /* closed */ }
      }
      // Push an update only when the fingerprint actually changes.
      const check = async () => {
        if (closed) return
        try {
          const fp = await fingerprint(id)
          if (fp !== last) { last = fp; send('update', fp) }
        } catch { /* transient */ }
      }

      send('ready', 'ok')
      await check()

      // Instant local delivery + a slow safety-net poll (cross-instance, clock).
      const unsub = subscribeDraft(id, () => { void check() })
      const poll = setInterval(check, 2500)
      const keepalive = setInterval(() => send('ping', String(Date.now())), 25_000)

      const cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(poll); clearInterval(keepalive); unsub()
        try { controller.close() } catch { /* already closed */ }
      }
      req.signal.addEventListener('abort', cleanup)
    },
    cancel() { closed = true },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
