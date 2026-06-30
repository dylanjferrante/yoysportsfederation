import { db } from '@/db'
import { teams, teamSeasonBranding, rosters, players, rosterSnapshots, playerGameStats } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { safeParse } from '@/lib/utils'

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
export async function snapshotSeasonRosters(leagueId: string, season: string, force = false): Promise<number> {
  const sports = ['NFL', 'NHL', 'NBA', 'MLB']
  let n = 0
  for (const sp of sports) n += await snapshotSportRoster(leagueId, season, sp, force)
  return n
}

// Freeze ONE sport's rosters for a season. Called the moment that sport-season
// finishes (its champion is crowned) so it becomes immutable, while the other
// sports of the same federation season may still be in progress (sports run
// sequentially, so a new football season can begin while the prior season's
// baseball is still being played). A frozen sport is scored from this snapshot,
// so later roster moves — which belong to the next season — can't change it.
export async function snapshotSportRoster(leagueId: string, season: string, sport: string, force = false): Promise<number> {
  // First freeze wins: a sport is snapshotted once, at its championship. Don't
  // overwrite it later (that would capture post-championship trades into the
  // frozen season) unless a commissioner forces a re-freeze.
  if (!force) {
    const [existing] = await db.select({ id: rosterSnapshots.id }).from(rosterSnapshots)
      .where(and(eq(rosterSnapshots.leagueId, leagueId), eq(rosterSnapshots.season, season), eq(rosterSnapshots.sport, sport))).limit(1)
    if (existing) return 0
  }
  const teamRows = await db.select({ id: teams.id }).from(teams).where(eq(teams.leagueId, leagueId))
  const teamIds = teamRows.map(t => t.id)
  if (!teamIds.length) return 0
  const cur = await db.select({ teamId: rosters.teamId, playerId: rosters.playerId, slot: rosters.slot, sport: rosters.sport, name: players.name, position: players.position })
    .from(rosters).innerJoin(players, eq(rosters.playerId, players.id))
    .where(and(inArray(rosters.teamId, teamIds), eq(rosters.sport, sport)))
  await db.delete(rosterSnapshots).where(and(eq(rosterSnapshots.leagueId, leagueId), eq(rosterSnapshots.season, season), eq(rosterSnapshots.sport, sport)))
  if (cur.length) await db.insert(rosterSnapshots).values(cur.map(r => ({ id: nanoid(), leagueId, teamId: r.teamId, season, playerId: r.playerId, playerName: r.name, sport: r.sport, position: r.position, slot: r.slot })))
  return cur.length
}

export type SeasonPlayer = { playerId: string | null; name: string; sport: string; position: string; slot: string }

// A franchise's roster for a season, merged PER SPORT: a sport that has been
// frozen (its championship decided) comes from the snapshot; a sport still in
// play — e.g. a prior season's baseball that's still going while the next
// football season has begun — comes from the live roster. isSnapshot is true
// only when every sport on the roster is frozen (a fully-archived past season).
export async function seasonRoster(leagueId: string, teamId: string, season: string): Promise<{ players: SeasonPlayer[]; isSnapshot: boolean }> {
  const snap = await db.select().from(rosterSnapshots).where(and(eq(rosterSnapshots.leagueId, leagueId), eq(rosterSnapshots.teamId, teamId), eq(rosterSnapshots.season, season)))
  const frozenSports = new Set(snap.map(s => s.sport ?? ''))
  const cur = await db.select({ playerId: rosters.playerId, slot: rosters.slot, sport: rosters.sport, name: players.name, position: players.position })
    .from(rosters).innerJoin(players, eq(rosters.playerId, players.id)).where(eq(rosters.teamId, teamId))
  const liveSports = new Set(cur.map(c => c.sport))
  const out: SeasonPlayer[] = [
    ...snap.map(s => ({ playerId: s.playerId, name: s.playerName ?? '', sport: s.sport ?? '', position: s.position ?? '', slot: s.slot ?? 'BN' })),
    // Live sports that aren't frozen yet (still being played this season).
    ...cur.filter(c => !frozenSports.has(c.sport)).map(c => ({ playerId: c.playerId, name: c.name, sport: c.sport, position: c.position, slot: c.slot })),
  ]
  const allFrozen = snap.length > 0 && [...liveSports].every(s => frozenSports.has(s))
  return { isSnapshot: allFrozen, players: out }
}

export type SeasonRosterPlayer = SeasonPlayer & {
  realTeamAbbr: string | null
  seasonPoints: number; weeklyAvg: number; gp: number; lastPts: number | null
  seasonStats: Record<string, number>
}

// A franchise's season roster enriched with that season's scoring, reconstructed
// from the persisted per-game stat lines (playerGameStats stays keyed by season,
// so a finished season's box-score totals survive). Drives the historical roster
// view, which mirrors the live My Team table.
export async function seasonRosterWithStats(leagueId: string, teamId: string, season: string): Promise<{ players: SeasonRosterPlayer[]; isSnapshot: boolean }> {
  const { players: base, isSnapshot } = await seasonRoster(leagueId, teamId, season)
  const ids = base.map(p => p.playerId).filter(Boolean) as string[]

  const logs = ids.length
    ? await db.select({ playerId: playerGameStats.playerId, week: playerGameStats.week, points: playerGameStats.points, stats: playerGameStats.stats })
        .from(playerGameStats)
        .where(and(eq(playerGameStats.leagueId, leagueId), eq(playerGameStats.season, season), inArray(playerGameStats.playerId, ids)))
    : []
  const agg: Record<string, { season: Record<string, number>; gp: number; pts: number; lastWk: number; lastPts: number }> = {}
  for (const g of logs) {
    const a = (agg[g.playerId] ??= { season: {}, gp: 0, pts: 0, lastWk: -1, lastPts: 0 })
    const s = safeParse<Record<string, number>>(g.stats ?? '{}', {})
    for (const k in s) a.season[k] = (a.season[k] ?? 0) + (s[k] ?? 0)
    a.gp++; a.pts += g.points ?? 0
    if (g.week > a.lastWk) { a.lastWk = g.week; a.lastPts = g.points ?? 0 }
  }

  // Real-team abbr for the "POS · TEAM" label (best-effort: current player row).
  const teamAbbr = ids.length
    ? Object.fromEntries((await db.select({ id: players.id, abbr: players.realTeamAbbr }).from(players).where(inArray(players.id, ids))).map(r => [r.id, r.abbr]))
    : {}

  const enriched = base.map(p => {
    const a = p.playerId ? agg[p.playerId] : undefined
    return {
      ...p,
      realTeamAbbr: (p.playerId ? teamAbbr[p.playerId] : null) ?? null,
      seasonPoints: a ? +a.pts.toFixed(1) : 0,
      gp: a?.gp ?? 0,
      weeklyAvg: a && a.gp ? +(a.pts / a.gp).toFixed(1) : 0,
      lastPts: a ? a.lastPts : null,
      seasonStats: a?.season ?? {},
    }
  })
  return { players: enriched, isSnapshot }
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
