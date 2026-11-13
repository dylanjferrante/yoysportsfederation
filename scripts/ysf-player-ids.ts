/**
 * Link Fantrax player IDs to Tank01 player IDs (the box-score source) for each sport, by
 * RotoWire ID where both carry one, else full name + team, else a unique full name.
 * Writes the player_id_map table. One Tank01 call per sport (the player list, cached on disk).
 *   npx tsx scripts/ysf-player-ids.ts [--refresh]
 */
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
for (const line of (fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const HOST: Record<string, string> = {
  NFL: process.env.TANK01_HOST_NFL || 'tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com',
  NBA: process.env.TANK01_HOST_NBA || 'tank01-fantasy-stats.p.rapidapi.com',
  NHL: process.env.TANK01_HOST_NHL || 'tank01-nhl-live-in-game-real-time-statistics-nhl.p.rapidapi.com',
  MLB: process.env.TANK01_HOST_MLB || 'tank01-mlb-live-in-game-real-time-statistics.p.rapidapi.com',
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '')
const db = new Database(path.join(ROOT, 'data', 'nexus.db'))
db.exec(`CREATE TABLE IF NOT EXISTS player_id_map (sport TEXT NOT NULL, fx_id TEXT NOT NULL, tank_id TEXT NOT NULL, method TEXT, name TEXT, PRIMARY KEY (sport, fx_id))`)

async function tankList(sport: string): Promise<any[]> {
  const f = path.join(ROOT, 'data', 'tank01-cache', `players_${sport}.json`)
  if (fs.existsSync(f) && !process.argv.includes('--refresh')) return JSON.parse(fs.readFileSync(f, 'utf8'))
  const r = await fetch(`https://${HOST[sport]}/get${sport}PlayerList`, { headers: { 'x-rapidapi-key': process.env.TANK01_RAPIDAPI_KEY!, 'x-rapidapi-host': HOST[sport] } })
  if (!r.ok) throw new Error(`Tank01 ${sport} player list → ${r.status}`)
  const j: any = await r.json(); const body = j?.body ?? j
  const list = Array.isArray(body) ? body : Object.values(body ?? {})
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(list))
  return list
}

async function main() {
  const ins = db.prepare(`INSERT OR REPLACE INTO player_id_map VALUES (?,?,?,?,?)`)
  for (const sport of ['NFL', 'NHL', 'NBA', 'MLB']) {
    const tank = await tankList(sport)
    const fx = await (await fetch(`https://www.fantrax.com/fxea/general/getPlayerIds?sport=${sport}`)).json() as Record<string, any>
    const rwKey = Object.keys(tank[0] ?? {}).find(k => /rotowire/i.test(k))
    const byRw = new Map<string, any>(), byNameTeam = new Map<string, any>(), byName = new Map<string, any[]>()
    for (const p of tank) {
      const id = String(p.playerID ?? ''); if (!id) continue
      if (rwKey && p[rwKey]) byRw.set(String(p[rwKey]), p)
      const n = norm(String(p.longName ?? ''))
      byNameTeam.set(n + '|' + String(p.team ?? '').toUpperCase(), p)
      byName.set(n, [...(byName.get(n) ?? []), p])
    }
    let rw = 0, nt = 0, nu = 0, none = 0
    db.transaction(() => {
      for (const [fxId, v] of Object.entries(fx)) {
        if (String(fxId).includes('#')) continue   // team entries (D/ST): matched by team
        const name = String(v.name ?? '').includes(', ') ? String(v.name).split(', ').reverse().join(' ') : String(v.name ?? '')
        let p: any, how = ''
        if (v.rotowireId && byRw.has(String(v.rotowireId))) { p = byRw.get(String(v.rotowireId)); how = 'rotowire'; rw++ }
        else if ((p = byNameTeam.get(norm(name) + '|' + String(v.team ?? '').toUpperCase()))) { how = 'name+team'; nt++ }
        else if (byName.get(norm(name))?.length === 1) { p = byName.get(norm(name))![0]; how = 'name'; nu++ }
        else { none++; continue }
        ins.run(sport, fxId, String(p.playerID), how, name)
      }
    })()
    console.log(`${sport}: ${tank.length} Tank01 players (rotowire field: ${rwKey ?? 'none'}) · linked by RotoWire ${rw}, name+team ${nt}, name ${nu} · unlinked ${none}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
