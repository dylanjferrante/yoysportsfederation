// Counts paid API requests per day (data/logs/api-usage.json) so usage can be watched against the
// plan's limit. Used by the scripts and the app; no '@/' imports so scripts can load it directly.
import fs from 'fs'
import path from 'path'

const FILE = () => path.join(process.cwd(), 'data', 'logs', 'api-usage.json')
const day = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())

export function countCall(provider: string, n = 1) {
  try {
    fs.mkdirSync(path.dirname(FILE()), { recursive: true })
    let u: Record<string, Record<string, number>> = {}
    try { u = JSON.parse(fs.readFileSync(FILE(), 'utf8')) } catch { /* new */ }
    const d = day(); u[d] = u[d] ?? {}; u[d][provider] = (u[d][provider] ?? 0) + n
    fs.writeFileSync(FILE(), JSON.stringify(u))
  } catch { /* never block a request on bookkeeping */ }
}
export function usage(): { today: Record<string, number>; month: Record<string, number> } {
  let u: Record<string, Record<string, number>> = {}
  try { u = JSON.parse(fs.readFileSync(FILE(), 'utf8')) } catch { /* none */ }
  const d = day(), m = d.slice(0, 7), month: Record<string, number> = {}
  for (const [k, v] of Object.entries(u)) if (k.startsWith(m)) for (const [p, n] of Object.entries(v)) month[p] = (month[p] ?? 0) + n
  return { today: u[d] ?? {}, month }
}
