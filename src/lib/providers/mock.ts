// ── Mock provider ────────────────────────────────────────────────────────────
// Reads the seeded database so the app works with zero API keys. This is the
// automatic fallback whenever Tank01 is not configured.

import { db } from '@/db'
import { players } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { safeParse } from '@/lib/utils'
import type { SportsDataProvider, Sport, ProviderPlayer, ProviderProjection, ProviderStatLine, ProviderTeam } from './types'

export class MockProvider implements SportsDataProvider {
  readonly id = 'mock'
  supports(_sport: Sport) { return true }

  async listTeams(_sport: Sport): Promise<ProviderTeam[]> {
    // The mock data set has no canonical real-team table; callers fall back to
    // the per-sport metadata in sportMeta() for branding.
    return []
  }

  async listPlayers(sport: Sport): Promise<ProviderPlayer[]> {
    const rows = await db.select().from(players).where(eq(players.sport, sport))
    return rows.map(p => ({
      externalId: p.externalId ?? p.id,
      name: p.name,
      sport: p.sport as Sport,
      position: p.position,
      realTeam: p.realTeam,
      realTeamAbbr: p.realTeamAbbr ?? undefined,
      status: p.status ?? undefined,
      injuryNote: p.injuryNote,
      photoUrl: p.photoUrl,
      isRookie: !!p.isRookie,
      byeWeek: p.byeWeek,
    }))
  }

  async getProjections(sport: Sport): Promise<ProviderProjection[]> {
    const rows = await db.select().from(players).where(eq(players.sport, sport))
    return rows.map(p => ({
      externalId: p.externalId ?? p.id,
      name: p.name,
      sport: p.sport as Sport,
      projectedPoints: p.projectedPoints ?? 0,
      stats: safeParse<Record<string, number>>(p.stats ?? '{}', {}),
    }))
  }

  async getStatLines(_sport: Sport, _week: number): Promise<ProviderStatLine[]> {
    // The mock scoring path is handled by the existing simulation engine
    // (src/lib/advance.ts); there are no externally-sourced stat lines.
    return []
  }
}
