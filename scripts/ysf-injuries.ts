/**
 * Injury and suspension designations for every player (ESPN's league injury reports, plus Tank01's NFL and NHL lists), so IR rules can be
 * enforced (Constitution fn. 5: IR needs an official designation; once it's lifted the player must come
 * off IR before the club can make other roster moves). Players not on a report are ACTIVE.
 * Records the sync time in app_settings 'injuries_synced_at' — the app only enforces on fresh data.
 *   npx tsx scripts/ysf-injuries.ts
 */
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const db = new Database(path.join(process.cwd(), 'data', 'nexus.db'))
const PATHS: Record<string, string> = { NFL: 'football/nfl', NHL: 'hockey/nhl', NBA: 'basketball/nba', MLB: 'baseball/mlb' }
const norm = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '')

async function main() {
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)`)
  for (const [sport, p] of Object.entries(PATHS)) {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${p}/injuries`)
    if (!r.ok) { console.log(`${sport}: ESPN ${r.status}, skipped`); continue }
    const d = await r.json() as any
    const inj = new Map<string, { status: string; note: string }>()
    for (const t of d.injuries ?? []) for (const i of t.injuries ?? []) {
      const name = i.athlete?.displayName; if (!name) continue
      inj.set(norm(name), { status: String(i.status ?? 'Out').replace(/-/g, ' ').replace(/\bIl\b/i, 'IL'), note: i.shortComment ?? i.longComment ?? '' })
    }
    // ESPN's report leaves out some long-term IR players; Tank01's player list (NFL, NHL) carries their designations
    try {
      const t = JSON.parse(fs.readFileSync(path.join('data', 'tank01-cache', `players_${sport}.json`), 'utf8'))
      for (const p of (Array.isArray(t) ? t : t.body ?? []) as any[]) {
        const des = p.injury?.designation; if (!des || inj.has(norm(p.longName ?? ''))) continue
        inj.set(norm(p.longName ?? ''), { status: String(des), note: p.injury?.description ?? '' })
      }
    } catch { /* no Tank01 list for this sport */ }
    const rows = db.prepare(`SELECT id, name FROM players WHERE sport = ?`).all(sport) as any[]
    const upd = db.prepare(`UPDATE players SET status = ?, injury_note = ? WHERE id = ?`)
    let n = 0
    db.transaction(() => { for (const pl of rows) { const x = inj.get(norm(pl.name)); upd.run(x?.status ?? 'ACTIVE', x?.note || null, pl.id); if (x) n++ } })()
    console.log(`${sport}: ${inj.size} on the injury report, ${n} matched`)
  }
  db.prepare(`INSERT INTO app_settings (key, value) VALUES ('injuries_synced_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(new Date().toISOString())
}
main().catch(e => { console.error(e); process.exit(1) })
