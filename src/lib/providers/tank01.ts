// ── Tank01 (RapidAPI) provider ───────────────────────────────────────────────
// One RapidAPI subscription per sport, each with its own host. The API key is
// read from the environment (TANK01_RAPIDAPI_KEY) and never stored in the repo.
//
// Hosts default to the values from our RapidAPI dashboard but can be overridden
// per-sport via env (TANK01_HOST_NFL, _NBA, _NHL, _MLB).
//
// NOTE: endpoint *paths* below are Tank01's documented names. Response-field
// mapping is intentionally defensive; run `npx tsx scripts/tank01-probe.ts NFL`
// to print a live response and confirm/adjust the field names.

import type { SportsDataProvider, Sport, ProviderPlayer, ProviderProjection, ProviderStatLine, ProviderTeam } from './types'

const DEFAULT_HOSTS: Record<Sport, string> = {
  NFL: 'tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com',
  NBA: 'tank01-fantasy-stats.p.rapidapi.com',
  NHL: 'tank01-nhl-live-in-game-real-time-statistics-nhl.p.rapidapi.com',
  MLB: 'tank01-mlb-live-in-game-real-time-statistics.p.rapidapi.com',
}

function hostFor(sport: Sport): string {
  return process.env[`TANK01_HOST_${sport}`] || DEFAULT_HOSTS[sport]
}

export function tank01Configured(): boolean {
  return !!process.env.TANK01_RAPIDAPI_KEY
}

// Small in-memory TTL cache so page loads don't each hit the rate-limited API.
type CacheEntry = { at: number; data: unknown }
const cache = new Map<string, CacheEntry>()
const DEFAULT_TTL_MS = 1000 * 60 * 15 // 15 min; raise for tight quotas

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
// Minimum spacing between provider requests, to stay under the plan's per-minute
// rate limit during bulk pulls. Tunable; 0 disables.
const MIN_GAP_MS = Number(process.env.TANK01_MIN_GAP_MS ?? 150)
const MAX_RETRIES = Number(process.env.TANK01_MAX_RETRIES ?? 4)
let lastCallAt = 0

async function call<T>(sport: Sport, path: string, query: Record<string, string | number | boolean> = {}, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  const key = process.env.TANK01_RAPIDAPI_KEY
  if (!key) throw new Error('TANK01_RAPIDAPI_KEY is not set')
  const host = hostFor(sport)
  const qs = Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
  const url = `https://${host}/${path}${qs ? `?${qs}` : ''}`

  const cached = cache.get(url)
  if (cached && Date.now() - cached.at < ttlMs) return cached.data as T

  // Throttle, then retry on 429 (rate limit) with backoff so bulk pulls and the
  // nightly cron ride out the plan's per-minute cap instead of crashing.
  for (let attempt = 0; ; attempt++) {
    const gap = MIN_GAP_MS - (Date.now() - lastCallAt)
    if (gap > 0) await sleep(gap)
    lastCallAt = Date.now()

    const res = await fetch(url, {
      headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': host, 'Content-Type': 'application/json' },
    })
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const ra = Number(res.headers.get('retry-after'))
      await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(30_000, 1000 * 2 ** attempt))
      continue
    }
    if (!res.ok) throw new Error(`Tank01 ${sport} ${path} → ${res.status} ${res.statusText}`)
    const json = await res.json()
    // Tank01 wraps payloads as { statusCode, body }.
    const data = (json && typeof json === 'object' && 'body' in json) ? (json as { body: T }).body : (json as T)
    cache.set(url, { at: Date.now(), data })
    return data
  }
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0
  return Number.isFinite(n) ? n : 0
}

// Endpoint path names per sport (Tank01 prefixes each with the sport code).
const EP = (sport: Sport) => ({
  teams: `get${sport}Teams`,
  players: `get${sport}PlayerList`,
  projections: `get${sport}Projections`,
  boxScore: `get${sport}BoxScore`,
  teamSchedule: `get${sport}TeamSchedule`,
  // Per-date schedule. NOTE: get<Sport>GamesForDate does NOT carry a gameStatus
  // field for MLB or NBA (only NFL/NHL include it), so it can't be used to tell
  // finished games from scheduled ones. get<Sport>ScoresOnly returns gameStatus
  // ("Completed", live status, etc.) for ALL four sports, so we filter on that.
  scoresForDate: `get${sport}ScoresOnly`,
})

// One provider call each (budget-tracked by the caller). Used by the ingestion job.
// Returns every game on the date with a real status, so the caller can keep only
// finished (or, in LIVE mode, in-progress) games before spending a box-score call.
export async function tank01GamesForDate(sport: Sport, yyyymmdd: string): Promise<{ gameId: string; status: string }[]> {
  const body = await call<any>(sport, EP(sport).scoresForDate, { gameDate: yyyymmdd }, 0)
  const rows: any[] = Array.isArray(body) ? body : Object.values(body ?? {})
  return rows.map(g => ({ gameId: String(g.gameID ?? g.gameId ?? g.id ?? ''), status: String(g.gameStatus ?? g.status ?? '') }))
}
// Returns each player's RAW nested stat object for a finished game. The caller
// (livestats) maps it onto our scoring keys via boxscore-map, so the simulator
// and real stats share the same scoring path.
export async function tank01BoxScore(sport: Sport, gameId: string): Promise<{ externalId: string; raw: any }[]> {
  const body = await call<any>(sport, EP(sport).boxScore, { gameID: gameId }, 0)
  const ps = body?.playerStats ?? body?.PlayerStats ?? body?.playerStatsMap ?? {}
  const entries = Object.entries<any>(ps).map(([playerID, raw]) => ({ externalId: String((raw?.playerID ?? playerID)), raw }))

  if (sport === 'NFL') {
    // Made-FG distances only exist in scoringPlays (e.g. "Butker 36 Yd Field Goal"),
    // not in the per-player Kicking leaf fields. Attribute each to its kicker so the
    // mapper can score FG by distance/yardage. playerIDs[0] is the kicker.
    const fgByKicker: Record<string, number[]> = {}
    for (const play of (body?.scoringPlays ?? []) as any[]) {
      if (String(play?.scoreType) !== 'FG') continue
      const m = /(\d+)\s*Yd/i.exec(String(play?.score ?? ''))
      const kid = String((play?.playerIDs ?? [])[0] ?? '')
      if (m && kid) (fgByKicker[kid] ??= []).push(Number(m[1]))
    }
    for (const e of entries) {
      const ds = fgByKicker[e.externalId]
      if (ds?.length) e.raw = { ...e.raw, __fgMade: ds }
    }
    // Team-defense (DST) stats live in the box score's top-level DST block, keyed
    // by side. Emit them as DST_<teamID> entries so the DEF roster slot scores.
    const dst = body?.DST ?? {}
    for (const side of ['away', 'home']) {
      const d = (dst as any)[side]
      if (d?.teamID) entries.push({ externalId: `DST_${d.teamID}`, raw: { __dst: d } })
    }
  }
  return entries
}

// One team's full-season schedule, normalized. Each real game appears on two
// teams' schedules, so callers should dedup by gameId. Budget: 1 call per team.
export type ScheduleGame = { gameId: string; sport: Sport; gameDate: string; homeAbbr: string; awayAbbr: string; gameTimeEpoch: string | null; status: string | null; seasonType: string | null }
export async function tank01TeamSchedule(sport: Sport, teamAbv: string, season?: string): Promise<ScheduleGame[]> {
  const q: Record<string, string> = { teamAbv }
  if (season) q.season = season
  const body = await call<any>(sport, EP(sport).teamSchedule, q, 0)
  const rows: any[] = Array.isArray(body?.schedule) ? body.schedule : Array.isArray(body) ? body : Object.values(body?.schedule ?? body ?? {})
  return rows
    .map(g => ({
      gameId: String(g.gameID ?? g.gameId ?? ''),
      sport,
      gameDate: String(g.gameDate ?? ''),
      homeAbbr: String(g.home ?? g.teamAbvHome ?? ''),
      awayAbbr: String(g.away ?? g.teamAbvAway ?? ''),
      gameTimeEpoch: g.gameTime_epoch != null ? String(g.gameTime_epoch) : null,
      status: g.gameStatus != null ? String(g.gameStatus) : null,
      seasonType: g.seasonType != null ? String(g.seasonType) : null,
    }))
    .filter(g => g.gameId && g.gameDate && g.homeAbbr && g.awayAbbr)
}

export class Tank01Provider implements SportsDataProvider {
  readonly id = 'tank01'
  supports(_sport: Sport) { return tank01Configured() }

  async listTeams(sport: Sport): Promise<ProviderTeam[]> {
    const body = await call<any>(sport, EP(sport).teams)
    const rows: any[] = Array.isArray(body) ? body : Object.values(body ?? {})
    return rows.map(t => ({
      externalId: String(t.teamID ?? t.teamId ?? t.id ?? ''),
      sport,
      name: t.teamName ?? t.name ?? `${t.teamCity ?? ''} ${t.teamName ?? ''}`.trim(),
      abbreviation: t.teamAbv ?? t.abbreviation ?? '',
      logoUrl: t.espnLogo1 ?? t.nbaComLogo1 ?? t.logo ?? null,
    }))
  }

  async listPlayers(sport: Sport): Promise<ProviderPlayer[]> {
    const body = await call<any>(sport, EP(sport).players)
    const rows: any[] = Array.isArray(body) ? body : Object.values(body ?? {})
    return rows.map(p => ({
      externalId: String(p.playerID ?? p.playerId ?? p.id ?? ''),
      name: p.longName ?? p.playerName ?? p.name ?? '',
      sport,
      position: p.pos ?? p.position ?? '',
      realTeam: p.team ?? p.teamAbv ?? '',
      realTeamAbbr: p.teamAbv ?? undefined,
      status: p.injury?.designation ? p.injury.designation : 'ACTIVE',
      injuryNote: p.injury?.description || null,
      photoUrl: p.espnHeadshot ?? p.headshot ?? null,
      isRookie: p.exp === 'R' || p.isRookie === 'True' || p.isRookie === true,
      byeWeek: null, // bye weeks live on the teams payload, not the player list
    }))
  }

  private fantasyPts(raw: any): number {
    const fp = raw.fantasyPoints ?? raw.fantasyPointsDefault
    if (fp == null) return 0
    if (typeof fp === 'object') return num(fp.PPR ?? fp.halfPPR ?? fp.standard)
    return num(fp)
  }

  async getProjections(sport: Sport, opts?: { week?: number; season?: string }): Promise<ProviderProjection[]> {
    const query: Record<string, string | number> = {}
    if (opts?.week) query.week = opts.week
    if (opts?.season) query.archiveSeason = opts.season.slice(0, 4)
    const body = await call<any>(sport, EP(sport).projections, query)
    // Tank01 nests skill players under playerProjections and team defenses under
    // teamDefenseProjections (keyed by teamID). Merge both into one list.
    const playerMap = body?.playerProjections ?? {}
    const dstMap = body?.teamDefenseProjections ?? {}
    const out: ProviderProjection[] = []
    for (const [externalId, raw] of Object.entries<any>(playerMap)) {
      out.push({
        externalId,
        name: raw.longName ?? raw.playerName ?? '',
        sport,
        projectedPoints: this.fantasyPts(raw),
        stats: Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'string' || typeof v === 'number').map(([k, v]) => [k, num(v)])),
      })
    }
    for (const [teamId, raw] of Object.entries<any>(dstMap)) {
      out.push({ externalId: `DST_${teamId}`, name: `${raw.teamAbv ?? ''} DST`.trim(), sport, projectedPoints: this.fantasyPts(raw), stats: {} })
    }
    return out
  }

  async getStatLines(sport: Sport, week: number, _opts?: { season?: string }): Promise<ProviderStatLine[]> {
    // Box scores are per-game; aggregating a week's games into per-player lines
    // requires the date→gameID lookup. Left to the sync job, which knows the
    // week→date mapping. Returns [] until that job is wired with a live key.
    void week
    return []
  }
}
