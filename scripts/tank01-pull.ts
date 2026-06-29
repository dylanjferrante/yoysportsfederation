/**
 * Tank01 → committed data fixtures.
 *
 * Pulls real players + projections per sport and writes them to
 * src/data/tank01-<sport>.json. Run occasionally (costs ~2 requests per sport);
 * the seed then builds a real-player league from these files with NO network
 * calls, so `npm run db:reset` never burns your API quota.
 *
 *   npm run tank01:pull            # all four sports
 *   npm run tank01:pull NFL        # one sport
 *
 * Captures: name, position, team, headshot, injury status/description, rookie
 * flag, external id, mapped raw projected stats, and projected points computed
 * under the default scoring (each league re-scores from the raw stats).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { toScoringStats, applyScoring, mapNFLDefense } from '../src/lib/providers/tank01-map'
import { DEFAULT_SCORING } from '../src/lib/defaults'

type Sport = 'NFL' | 'NBA' | 'NHL' | 'MLB'
const ALL: Sport[] = ['NFL', 'NBA', 'NHL', 'MLB']

const HOSTS: Record<Sport, string> = {
  NFL: 'tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com',
  NBA: 'tank01-fantasy-stats.p.rapidapi.com',
  NHL: 'tank01-nhl-live-in-game-real-time-statistics-nhl.p.rapidapi.com',
  MLB: 'tank01-mlb-live-in-game-real-time-statistics.p.rapidapi.com',
}
// Sports with a confirmed projection mapper (others store raw fallback + Tank01's number).
const MAPPED: Sport[] = ['NFL']

function loadEnv(): Record<string, string> {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    const out: Record<string, string> = {}
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
    return out
  } catch { return {} }
}

const env = { ...loadEnv(), ...process.env }
const KEY = env.TANK01_RAPIDAPI_KEY
const num = (v: unknown) => { const x = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0; return Number.isFinite(x) ? x : 0 }

async function call(sport: Sport, path: string): Promise<any> {
  const host = env[`TANK01_HOST_${sport}`] || HOSTS[sport]
  const res = await fetch(`https://${host}/${path}`, {
    headers: { 'x-rapidapi-key': KEY!, 'x-rapidapi-host': host, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`${sport} ${path} → ${res.status} ${res.statusText}`)
  const json = await res.json()
  return json && typeof json === 'object' && 'body' in json ? json.body : json
}

type PulledPlayer = {
  externalId: string; name: string; sport: Sport; position: string
  team: string; status: string; injuryNote: string; photoUrl: string | null
  isRookie: boolean; projectedPoints: number; stats: Record<string, number>
}

async function pullSport(sport: Sport): Promise<PulledPlayer[]> {
  console.log(`\n${sport}: fetching player list + projections (2 requests)…`)
  const listBody = await call(sport, `get${sport}PlayerList`)
  const projBody = await call(sport, `get${sport}Projections`)
  const list: any[] = Array.isArray(listBody) ? listBody : Object.values(listBody ?? {})
  const projMap: Record<string, any> = projBody?.playerProjections ?? projBody ?? {}
  const hasMapper = MAPPED.includes(sport)

  const players: PulledPlayer[] = list.map(p => {
    const id = String(p.playerID ?? p.id ?? '')
    const proj = projMap[id]
    let stats: Record<string, number> = {}
    let projectedPoints = 0
    if (proj) {
      stats = toScoringStats(sport, proj)
      const fp = proj.fantasyPointsDefault
      const tankDefault = typeof fp === 'object' ? num(fp.PPR ?? fp.standard) : num(fp)
      projectedPoints = hasMapper ? applyScoring(DEFAULT_SCORING[sport] ?? {}, stats) : tankDefault
    }
    return {
      externalId: id,
      name: p.longName ?? p.playerName ?? p.name ?? '',
      sport,
      position: p.pos ?? p.position ?? '',
      team: p.team ?? p.teamAbv ?? '',
      status: p.injury?.designation ? p.injury.designation : 'ACTIVE',
      injuryNote: p.injury?.description || '',
      photoUrl: p.espnHeadshot ?? p.headshot ?? null,
      isRookie: p.exp === 'R' || p.isRookie === true,
      projectedPoints,
      stats,
    }
  }).filter(p => p.externalId && p.name)

  // NFL team defenses live in a separate block; add them as DEF players so the
  // DEF roster slot can be filled.
  const dstMap: Record<string, any> = projBody?.teamDefenseProjections ?? {}
  if (sport === 'NFL') {
    for (const [teamId, raw] of Object.entries(dstMap)) {
      const stats = mapNFLDefense(raw)
      players.push({
        externalId: `DST_${teamId}`,
        name: `${raw.teamAbv ?? ''} DST`.trim(),
        sport, position: 'DEF', team: raw.teamAbv ?? '',
        status: 'ACTIVE', injuryNote: '', photoUrl: null, isRookie: false,
        projectedPoints: applyScoring(DEFAULT_SCORING[sport] ?? {}, stats), stats,
      })
    }
  }

  // Prefer players with a projection (fantasy-relevant); keep the rest after.
  players.sort((a, b) => b.projectedPoints - a.projectedPoints)
  console.log(`  ${players.length} players, ${players.filter(p => p.projectedPoints > 0).length} with projections`)
  return players
}

async function main() {
  if (!KEY) { console.error('TANK01_RAPIDAPI_KEY is not set in .env'); process.exit(1) }
  const arg = process.argv[2]?.toUpperCase() as Sport | undefined
  const sports = arg && ALL.includes(arg) ? [arg] : ALL
  const outDir = resolve(process.cwd(), 'src/fixtures')
  mkdirSync(outDir, { recursive: true })

  for (const sport of sports) {
    try {
      const players = await pullSport(sport)
      const file = resolve(outDir, `tank01-${sport}.json`)
      writeFileSync(file, JSON.stringify(players))
      console.log(`  → wrote ${file}`)
    } catch (e) {
      console.error(`  ✗ ${sport} failed:`, (e as Error).message)
    }
  }
  console.log('\nDone. Now run: npm run db:reset')
}

main().catch(e => { console.error(e); process.exit(1) })
