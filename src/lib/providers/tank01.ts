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

async function call<T>(sport: Sport, path: string, query: Record<string, string | number | boolean> = {}, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  const key = process.env.TANK01_RAPIDAPI_KEY
  if (!key) throw new Error('TANK01_RAPIDAPI_KEY is not set')
  const host = hostFor(sport)
  const qs = Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
  const url = `https://${host}/${path}${qs ? `?${qs}` : ''}`

  const cached = cache.get(url)
  if (cached && Date.now() - cached.at < ttlMs) return cached.data as T

  const res = await fetch(url, {
    headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': host, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Tank01 ${sport} ${path} → ${res.status} ${res.statusText}`)
  const json = await res.json()
  // Tank01 wraps payloads as { statusCode, body }.
  const data = (json && typeof json === 'object' && 'body' in json) ? (json as { body: T }).body : (json as T)
  cache.set(url, { at: Date.now(), data })
  return data
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
  gamesForDate: `get${sport}GamesForDate`,
})

// Flatten a provider stat object to a numeric stat line (defensive: real field
// names vary by sport — confirm with scripts/tank01-probe.ts against a live key).
function flattenStats(raw: any): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(parseFloat(v)))) out[k] = num(v)
    else if (v && typeof v === 'object') for (const [k2, v2] of Object.entries(v)) if (typeof v2 === 'number' || typeof v2 === 'string') { const n = num(v2); if (n) out[`${k}_${k2}`] = n }
  }
  return out
}

// One provider call each (budget-tracked by the caller). Used by the ingestion job.
export async function tank01GamesForDate(sport: Sport, yyyymmdd: string): Promise<{ gameId: string; status: string }[]> {
  const body = await call<any>(sport, EP(sport).gamesForDate, { gameDate: yyyymmdd }, 0)
  const rows: any[] = Array.isArray(body) ? body : Object.values(body ?? {})
  return rows.map(g => ({ gameId: String(g.gameID ?? g.gameId ?? g.id ?? ''), status: String(g.gameStatus ?? g.status ?? '') }))
}
export async function tank01BoxScore(sport: Sport, gameId: string): Promise<{ externalId: string; stats: Record<string, number> }[]> {
  const body = await call<any>(sport, EP(sport).boxScore, { gameID: gameId }, 0)
  const ps = body?.playerStats ?? body?.PlayerStats ?? body?.playerStatsMap ?? {}
  return Object.entries<any>(ps).map(([playerID, raw]) => ({ externalId: String((raw?.playerID ?? playerID)), stats: flattenStats(raw) }))
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
