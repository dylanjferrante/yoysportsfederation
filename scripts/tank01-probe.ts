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
  const key = env.TANK01_RAPIDAPI_KEY
  const host = env[`TANK01_HOST_${sport}`] || HOSTS[sport]

  if (!HOSTS[sport]) { console.error(`Unknown sport "${sport}". Use NFL | NBA | NHL | MLB.`); process.exit(1) }
  if (!key) { console.error('TANK01_RAPIDAPI_KEY is not set in .env'); process.exit(1) }

  const url = `https://${host}/${endpoint}`
  console.log(`→ ${url}\n  host: ${host}\n  (1 request)\n`)

  const res = await fetch(url, { headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': host, 'Content-Type': 'application/json' } })
  console.log(`HTTP ${res.status} ${res.statusText}`)
  const remaining = res.headers.get('x-ratelimit-requests-remaining')
  if (remaining != null) console.log(`Requests remaining this period: ${remaining}`)

  const text = await res.text()
  let json: any
  try { json = JSON.parse(text) } catch { console.log(text.slice(0, 1500)); return }

  const body = json && typeof json === 'object' && 'body' in json ? json.body : json
  const rows = Array.isArray(body) ? body : (body && typeof body === 'object' ? Object.values(body) : [])
  console.log(`\nRows returned: ${rows.length}`)
  console.log('First entry (field names matter for mapping):')
  console.log(JSON.stringify(rows[0] ?? body, null, 2).slice(0, 2000))
}

main().catch(e => { console.error(e); process.exit(1) })
