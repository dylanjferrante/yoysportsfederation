/**
 * Recompute player projections from REAL ingested stats (no API calls).
 *
 *   npm run stats:project            # season 2025-26
 *   npm run stats:project 2026-27
 *
 * Tank01 has no fantasy-point projections for NBA/NHL/MLB, so each player is
 * projected from the mean of their own real per-week stat lines. The scheduled
 * cron (/api/cron/stats) does this automatically after each ingest; this is for
 * manual/local runs.
 */
import { deriveProjections } from '../src/lib/livestats'

async function main() {
  const season = process.argv[2] || '2025-26'
  const r = await deriveProjections(season)
  console.log(`Derived projections for ${r.updated} players from real stats (season ${season}).`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
