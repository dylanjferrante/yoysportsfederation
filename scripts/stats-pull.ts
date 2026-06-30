/**
 * Convenience wrapper around the scheduled live-stats endpoint.
 *
 *   npm run stats:pull            # lookback 2 days
 *   npm run stats:pull -- 3       # lookback 3 days (max 7)
 *
 * Reads BASE_URL (default http://localhost:3000) and CRON_SECRET from .env, then
 * hits GET /api/cron/stats. For real scheduling, a crontab/Vercel-Cron entry
 * curling that URL directly is equivalent — this is just for manual local runs.
 *
 *   # crontab: pull twice daily at 1:10am and 1:10pm
 *   10 1,13 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *     https://<host>/api/cron/stats >/dev/null
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
  const base = env.BASE_URL || 'http://localhost:3000'
  const secret = env.CRON_SECRET
  const days = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '2'
  if (!secret) { console.error('CRON_SECRET is not set in .env'); process.exit(1) }

  const url = `${base}/api/cron/stats?days=${days}`
  console.log(`→ ${url}`)
  const res = await fetch(url, { headers: { authorization: `Bearer ${secret}` } })
  const json = await res.json().catch(() => null)
  console.log(`HTTP ${res.status}`)
  console.log(JSON.stringify(json, null, 2))
  if (!res.ok) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
