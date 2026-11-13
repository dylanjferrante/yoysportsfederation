/**
 * Score 2026-27 ySF matchups with the app's engine.
 *   npx tsx scripts/ysf-score.ts            # dry run: what changes vs the official (Fantrax) scores
 *   npx tsx scripts/ysf-score.ts --write    # write engine scores, standings; set score source = engine
 *   npx tsx scripts/ysf-score.ts --official # switch back: restore the official scores
 */
import { db } from '../src/db'
import { leagues, teams } from '../src/db/schema'
import { eq, sql } from 'drizzle-orm'

async function main() {
  const { runEngine, setScoreSource, recomputeRecords, ensureEngineSchema } = await import('../src/lib/ysf-engine')
  const [league] = await db.select().from(leagues).where(eq(leagues.id, 'ysf')).limit(1)
  const ab = Object.fromEntries((await db.select().from(teams).where(eq(teams.leagueId, 'ysf'))).map(t => [t.id, t.abbreviation]))
  if (process.argv.includes('--official')) {
    ensureEngineSchema()
    db.run(sql`UPDATE matchups SET home_score = official_home_score, away_score = official_away_score WHERE league_id = 'ysf' AND season = ${league.season} AND official_home_score IS NOT NULL`)
    for (const s of ['NFL', 'NHL', 'NBA']) recomputeRecords('ysf', league.season, s)
    setScoreSource('official'); console.log('Score source: official (ysffantasy.com / Fantrax)'); return
  }
  const write = process.argv.includes('--write')
  const res = await runEngine(league, { write })
  const done = res.filter(r => r.complete)
  const exact = done.filter(r => Math.abs(r.engine[0] - r.official[0]) < 0.006 && Math.abs(r.engine[1] - r.official[1]) < 0.006)
  const flips = done.filter(r => Math.sign(r.engine[0] - r.engine[1]) !== Math.sign(r.official[0] - r.official[1]))
  console.log(`Completed matchups: ${done.length} · identical to official ${exact.length} · different ${done.length - exact.length} · result flips ${flips.length}`)
  for (const r of done.filter(r => !exact.includes(r)).sort((a, b) => a.sport.localeCompare(b.sport) || a.period - b.period))
    console.log(`  ${flips.includes(r) ? 'FLIP' : '    '} ${r.sport} P${r.period}: ${ab[r.home]} ${r.official[0]}–${r.official[1]} ${ab[r.away]} (official) → ${r.engine[0]}–${r.engine[1]} (engine)`)
  const live = res.filter(r => !r.complete)
  console.log(`In progress: ${live.length} matchups${live.length ? ` (${[...new Set(live.map(r => `${r.sport} P${r.period}`))].join(', ')})` : ''}`)
  if (write) { setScoreSource('engine'); console.log('Written. Score source: engine') }
}
main().catch(e => { console.error(e); process.exit(1) })
