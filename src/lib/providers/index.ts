// ── Provider selection ───────────────────────────────────────────────────────
// At 1,000 requests/month per sport, Tank01 is a *sync source*, not a
// request-time source: a scheduled job (scripts/tank01-sync.ts) pulls metadata
// and projections into our DB, and the app always reads the DB via the mock
// provider. This module exposes both so callers pick the right one.

import { MockProvider } from './mock'
import { Tank01Provider, tank01Configured } from './tank01'
import type { SportsDataProvider } from './types'

export * from './types'
export { tank01Configured }

/** Request-time provider for the app — always the DB-backed mock. */
export function getProvider(): SportsDataProvider {
  return new MockProvider()
}

/**
 * The external sync source, or null when no API key is configured.
 * Used only by the scheduled sync job, never on page loads.
 */
export function getSyncProvider(): SportsDataProvider | null {
  return tank01Configured() ? new Tank01Provider() : null
}
