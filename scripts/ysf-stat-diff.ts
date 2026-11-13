/** Which stats does Tank01 report differently from Fantrax? Per stat column, how many player-days disagree. */
import Database from 'better-sqlite3'
const db = new Database('data/nexus.db', { readonly: true })
async function main() {
  const { loadGameLines, toFantraxStats } = await import('../src/lib/ysf-gamelines')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
  for (const sport of ['NHL', 'NBA'] as const) {
    const L = loadGameLines(sport, '2026-09-01', today, {})
    const by = new Map<string, Record<string, number>>()
    for (const g of L) { const k = g.tankId + '|' + g.date; const s = by.get(k) ?? {}; for (const [a, v] of Object.entries(g.stats)) s[a] = (s[a] ?? 0) + v; by.set(k, s) }
    const rows = db.prepare(`SELECT f.date, f.stats, m.tank_id FROM fantrax_player_periods f JOIN player_id_map m ON m.sport=f.sport AND m.fx_id=f.fx_player_id WHERE f.season='2026-27' AND f.sport=? AND f.date < ?`).all(sport, today) as any[]
    const tally: Record<string, [number, number]> = {}; const ex: Record<string, string[]> = {}
    for (const r of rows) {
      const fx = JSON.parse(r.stats || '{}'); const t = by.get(r.tank_id + '|' + r.date); if (!t) continue
      if (!Number(fx.GP)) continue
      const ours = toFantraxStats(sport, t)
      for (const [k, v] of Object.entries(ours)) { if (!(k in fx)) continue; const a = Number(v), b = Number(fx[k]); tally[k] ??= [0, 0]; tally[k][Math.abs(a - b) < 0.01 ? 0 : 1]++; if (Math.abs(a - b) >= 0.01) (ex[k] ??= []).length < 3 && ex[k].push(`${r.date} ours ${a} fx ${b}`) }
    }
    console.log(sport, Object.entries(tally).map(([k, [ok, bad]]) => `${k} ${bad}/${ok + bad}`).join(' · '))
    for (const [k, e] of Object.entries(ex)) console.log('   ', k, e.join(' | '))
  }
}
main()
