// Run the ySF projection model (players → clubs → matchups → 10,000 seasons) and store the results.
// The scheduler runs it hourly; --summary prints the headline numbers.
import { runModel } from '../src/lib/ysf-model'
import { db } from '../src/db'
import { sql } from 'drizzle-orm'

async function main() {
  const t = Date.now()
  const m = await runModel(Number(process.env.YSF_MODEL_SIMS ?? 10000))
  console.log(`model: ${((Date.now() - t) / 1000).toFixed(1)}s, ${m.sims} sims`)
  if (!process.argv.includes('--summary')) return
  const ab = new Map(db.all<{ id: string; a: string }>(sql`SELECT id, abbreviation a FROM teams WHERE league_id = 'ysf'`).map(r => [r.id, r.a]))
  console.log('CUP', Object.entries(m.cup).sort((a, b) => b[1].win - a[1].win).map(([t, c]) => `${ab.get(t)} ${(c.win * 100).toFixed(1)}% exp ${c.exp}`).join(' | '))
  for (const [sp, L] of Object.entries(m.leagues)) console.log(sp, Object.entries(L.clubs).sort((a, b) => b[1].title - a[1].title).slice(0, 4).map(([t, c]) => `${ab.get(t)} mu ${c.mu} po ${(c.playoff * 100).toFixed(0)}% title ${(c.title * 100).toFixed(1)}%`).join(' | '))
  const n = db.all<{ n: number }>(sql`SELECT COUNT(*) n FROM ysf_player_proj`)[0].n
  console.log('player projections stored:', n)
  console.log(db.all(sql`SELECT p.name, p.sport, j.week, j.games, j.pts, j.source FROM ysf_player_proj j JOIN players p ON p.id = j.player_id ORDER BY j.pts DESC LIMIT 6`))
}
main().then(() => process.exit(0), e => { console.error(e); process.exit(1) })
