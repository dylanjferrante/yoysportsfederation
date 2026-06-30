// In-process pub/sub for live draft updates. A POST that mutates a draft calls
// publishDraft(id); SSE streams subscribed to that draft push an update to every
// connected client instantly (same server instance).
//
// SCALE NOTE: this is per-instance. Behind multiple app instances, a pick made
// on instance A won't fire subscribers on instance B — so the SSE stream ALSO
// polls a lightweight DB fingerprint on a slow interval as a cross-instance
// safety net. To make cross-instance delivery instant, swap this emitter for
// Redis pub/sub (or Postgres LISTEN/NOTIFY) behind the same publish/subscribe API.
import { EventEmitter } from 'node:events'

// Survive Next.js dev hot-reloads via a global singleton.
const g = globalThis as unknown as { __draftBus?: EventEmitter }
const bus = g.__draftBus ?? (g.__draftBus = new EventEmitter())
bus.setMaxListeners(0)

export function publishDraft(draftId: string): void {
  bus.emit(draftId)
}

export function subscribeDraft(draftId: string, cb: () => void): () => void {
  bus.on(draftId, cb)
  return () => bus.off(draftId, cb)
}
