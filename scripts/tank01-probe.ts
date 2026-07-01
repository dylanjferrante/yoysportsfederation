/**
 * Tank01 connectivity probe — makes EXACTLY ONE request, so it's safe against
 * the 1,000/month quota. Reads your key from .env (no dependencies needed).
 *
 *   npx tsx scripts/tank01-probe.ts            # defaults to NFL getNFLTeams
 *   npx tsx scripts/tank01-probe.ts NBA
 *   npx tsx scripts/tank01-probe.ts MLB getMLBTeams
 *
 * It prints the HTTP status and a trimmed preview of the response so we can
 * confirm the field names before wiring the sync.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Sport = 'NFL' | 'NBA' | 'NHL' | 'MLB'

const HOSTS: Record<Sport, string> = {
  NFL: 'tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com',
  NBA: 'tank01-fantasy-stats.p.rapidapi.com',
  NHL: 'tank01-nhl-live-in-game-real-time-statistics-nhl.p.rapidapi.com',
  MLB: 'tank01-mlb-live-in-game-real-time-statistics.p.rapidapi.com',
}

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

async function main() {
  const env = { ...loadEnv(), ...process.env }
  const sport = ((process.argv[2] || 'NFL').toUpperCase()) as Sport
  const endpoint = process.argv[3] || `get${sport}Teams`
  // Any further args of the form key=value become query params, e.g.
  //   npm run tank01:probe MLB getMLBProjections date=20260629
  const query = process.argv.slice(4).filter(a => a.includes('=')).join('&')
  const key = env.TANK01_RAPIDAPI_KEY
  const host = env[`TANK01_HOST_${sport}`] || HOSTS[sport]

  if (!HOSTS[sport]) { console.error(`Unknown sport "${sport}". Use NFL | NBA | NHL | MLB.`); process.exit(1) }
  if (!key) { console.error('TANK01_RAPIDAPI_KEY is not set in .env'); process.exit(1) }

  const url = `https://${host}/${endpoint}${query ? `?${query}` : ''}`
  console.log(`→ ${url}\n  host: ${host}\n  (1 request)\n`)

  const res = await fetch(url, { headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': host, 'Content-Type': 'application/json' } })
  console.log(`HTTP ${res.status} ${res.statusText}`)
  const remaining = res.headers.get('x-ratelimit-requests-remaining')
  if (remaining != null) console.log(`Requests remaining this period: ${remaining}`)

  const text = await res.text()
  let json: any
  try { json = JSON.parse(text) } catch { console.log(text.slice(0, 1500)); return }

  const body = json && typeof json === 'object' && 'body' in json ? json.body : json

  if (Array.isArray(body)) {
    console.log(`\nArray of ${body.length}. First entry:`)
    console.log(JSON.stringify(body[0], null, 2).slice(0, 2000))
    return
  }

  if (body && typeof body === 'object') {
    const keys = Object.keys(body)
    console.log(`\nTop-level keys (${keys.length}): ${JSON.stringify(keys)}`)
    // For each top-level key, reveal its shape + one sample sub-entry.
    for (const k of keys.slice(0, 8)) {
      const v = (body as any)[k]
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const subKeys = Object.keys(v)
        console.log(`\n• ${k}: object with ${subKeys.length} entries. Sample [${subKeys[0]}]:`)
        console.log(JSON.stringify(v[subKeys[0]], null, 2).slice(0, 1200))
      } else if (Array.isArray(v)) {
        console.log(`\n• ${k}: array of ${v.length}. Sample:`)
        console.log(JSON.stringify(v[0], null, 2).slice(0, 1200))
      } else {
        console.log(`\n• ${k}: ${JSON.stringify(v)}`)
      }
    }
    return
  }

  console.log(`\nValue: ${JSON.stringify(body)}`)
}

main().catch(e => { console.error(e); process.exit(1) })
