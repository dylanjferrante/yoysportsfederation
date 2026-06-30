import { db } from '@/db'
import { teams, teamSeasonBranding, rosters, players, rosterSnapshots } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'

// Resolve which season a league page should render from its ?season= param,
// and whether that's a past (read-only) season.
export function viewSeasonOf(league: { season: string }, sp: { season?: string } | undefined): { season: string; isPast: boolean } {
  const s = sp?.season
  const isPast = !!s && s !== league.season
  return { season: isPast ? s! : league.season, isPast }
}

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

// Snapshot every franchise's CURRENT roster into roster_snapshots for a season
// (replacing any existing snapshot). Player name/position are stored too, so the
// historical roster reads correctly even if the player later moves or is renamed.
export async function snapshotSeasonRosters(leagueId: string, season: string): Promise<number> {
  const teamRows = await db.select({ id: teams.id }).from(teams).where(eq(teams.leagueId, leagueId))
  const teamIds = teamRows.map(t => t.id)
  if (!teamIds.length) return 0
  const cur = await db.select({ teamId: rosters.teamId, playerId: rosters.playerId, slot: rosters.slot, sport: rosters.sport, name: players.name, position: players.position })
    .from(rosters).innerJoin(players, eq(rosters.playerId, players.id)).where(inArray(rosters.teamId, teamIds))
  await db.delete(rosterSnapshots).where(and(eq(rosterSnapshots.leagueId, leagueId), eq(rosterSnapshots.season, season)))
  if (cur.length) await db.insert(rosterSnapshots).values(cur.map(r => ({ id: nanoid(), leagueId, teamId: r.teamId, season, playerId: r.playerId, playerName: r.name, sport: r.sport, position: r.position, slot: r.slot })))
  return cur.length
}

export type SeasonPlayer = { playerId: string | null; name: string; sport: string; position: string; slot: string }

// A franchise's roster for a season: the snapshot if one exists, otherwise the
// current roster (fallback for seasons archived before snapshots existed).
export async function seasonRoster(leagueId: string, teamId: string, season: string): Promise<{ players: SeasonPlayer[]; isSnapshot: boolean }> {
  const snap = await db.select().from(rosterSnapshots).where(and(eq(rosterSnapshots.leagueId, leagueId), eq(rosterSnapshots.teamId, teamId), eq(rosterSnapshots.season, season)))
  if (snap.length) return { isSnapshot: true, players: snap.map(s => ({ playerId: s.playerId, name: s.playerName ?? '', sport: s.sport ?? '', position: s.position ?? '', slot: s.slot ?? 'BN' })) }
  const cur = await db.select({ playerId: rosters.playerId, slot: rosters.slot, sport: rosters.sport, name: players.name, position: players.position })
    .from(rosters).innerJoin(players, eq(rosters.playerId, players.id)).where(eq(rosters.teamId, teamId))
  return { isSnapshot: false, players: cur.map(c => ({ playerId: c.playerId, name: c.name, sport: c.sport, position: c.position, slot: c.slot })) }
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
