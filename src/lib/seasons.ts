import { db } from '@/db'
import { teams, teamSeasonBranding } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export type Branding = {
  teamId: string; name: string; abbreviation: string
  logo: string | null; altLogo: string | null; wordmark: string | null
  primaryColor: string | null; secondaryColor: string | null; logoBg: number
}

// Snapshot every franchise's CURRENT branding into team_season_branding for a
// season (upsert). Called at season rollover and by the commissioner's archive
// tool, so a past season permanently remembers the logos used during it.
export async function snapshotSeasonBranding(leagueId: string, season: string): Promise<number> {
  const rows = await db.select().from(teams).where(eq(teams.leagueId, leagueId))
  for (const t of rows) {
    const vals = { name: t.name, abbreviation: t.abbreviation, logo: t.logo, altLogo: t.altLogo, wordmark: t.wordmark, primaryColor: t.primaryColor, secondaryColor: t.secondaryColor, logoBg: t.logoBg ? 1 : 0 }
    const [ex] = await db.select({ id: teamSeasonBranding.id }).from(teamSeasonBranding).where(and(eq(teamSeasonBranding.teamId, t.id), eq(teamSeasonBranding.season, season))).limit(1)
    if (ex) await db.update(teamSeasonBranding).set(vals).where(eq(teamSeasonBranding.id, ex.id))
    else await db.insert(teamSeasonBranding).values({ id: nanoid(), leagueId, teamId: t.id, season, ...vals })
  }
  return rows.length
}

// teamId → branding for a season: the snapshot if one exists, otherwise the
// franchise's current branding (graceful fallback for seasons archived before
// snapshots existed).
export async function seasonBranding(leagueId: string, season: string): Promise<Record<string, Branding>> {
  const out: Record<string, Branding> = {}
  const snaps = await db.select().from(teamSeasonBranding).where(and(eq(teamSeasonBranding.leagueId, leagueId), eq(teamSeasonBranding.season, season)))
  for (const s of snaps) out[s.teamId] = { teamId: s.teamId, name: s.name ?? '', abbreviation: s.abbreviation ?? '', logo: s.logo, altLogo: s.altLogo, wordmark: s.wordmark, primaryColor: s.primaryColor, secondaryColor: s.secondaryColor, logoBg: s.logoBg ?? 0 }
  const cur = await db.select().from(teams).where(eq(teams.leagueId, leagueId))
  for (const t of cur) if (!out[t.id]) out[t.id] = { teamId: t.id, name: t.name, abbreviation: t.abbreviation, logo: t.logo, altLogo: t.altLogo, wordmark: t.wordmark, primaryColor: t.primaryColor, secondaryColor: t.secondaryColor, logoBg: t.logoBg ? 1 : 0 }
  return out
}
