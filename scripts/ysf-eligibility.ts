/**
 * Pro experience for taxi-squad eligibility (Comm. Res. VII): stores players.pro_exp as JSON
 *   NFL { years }            — Tank01 "exp" (R = 0)
 *   NBA { years }            — ESPN athletes "experience.years", matched by name
 *   NHL { gp }               — career NHL regular-season games (NHL stats API, skaters + goalies)
 *   MLB { debut, maxDays }   — MLB debut date; maxDays is the most MLB service days possible since then
 *                              (every regular-season day from debut on), so maxDays < 172 proves < 1 year.
 *   npx tsx scripts/ysf-eligibility.ts
 */
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

const db = new Database(path.join(process.cwd(), 'data', 'nexus.db'))
if (!(db.prepare(`PRAGMA table_info(players)`).all() as any[]).some(c => c.name === 'pro_exp')) db.exec(`ALTER TABLE players ADD COLUMN pro_exp TEXT`)
const j = async (u: string) => { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }); if (!r.ok) throw new Error(`${u} → ${r.status}`); return r.json() as Promise<any> }
const tank = (s: string) => { const d = JSON.parse(fs.readFileSync(path.join('data', 'tank01-cache', `players_${s}.json`), 'utf8')); return (Array.isArray(d) ? d : d.body ?? []) as any[] }
const norm = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '')
const set = db.prepare(`UPDATE players SET pro_exp = ? WHERE sport = ? AND external_id = ?`)
const setByName = db.prepare(`UPDATE players SET pro_exp = ? WHERE sport = ? AND id = ?`)

// MLB regular seasons (opening day → final day); service time only accrues inside these
const MLB_SEASONS: Record<number, [string, string]> = {
  2015: ['2015-04-05', '2015-10-04'], 2016: ['2016-04-03', '2016-10-02'], 2017: ['2017-04-02', '2017-10-01'], 2018: ['2018-03-29', '2018-10-01'],
  2019: ['2019-03-20', '2019-09-29'], 2020: ['2020-07-23', '2020-09-27'], 2021: ['2021-04-01', '2021-10-03'], 2022: ['2022-04-07', '2022-10-05'],
  2023: ['2023-03-30', '2023-10-01'], 2024: ['2024-03-20', '2024-09-30'], 2025: ['2025-03-18', '2025-09-28'], 2026: ['2026-03-25', '2026-09-27'],
}
const days = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1)
function maxServiceDays(debut: string, today = new Date().toISOString().slice(0, 10)) {
  const y0 = Number(debut.slice(0, 4))
  if (y0 < 2015) return 999
  let n = 0
  for (let y = y0; y <= Number(today.slice(0, 4)); y++) {
    const s = MLB_SEASONS[y]; if (!s) continue
    const from = debut > s[0] ? debut : s[0], to = today < s[1] ? today : s[1]
    if (from <= to) n += days(from, to)
  }
  return n
}

async function main() {
  // NFL
  let n = 0
  db.transaction(() => { for (const p of tank('NFL')) { if (p.exp == null) continue; set.run(JSON.stringify({ years: p.exp === 'R' ? 0 : Number(p.exp) || 0 }), 'NFL', String(p.playerID)); n++ } })()
  console.log(`NFL: ${n} players`)

  // NHL — career games from the NHL's own stats (all seasons aggregated)
  const gp = new Map<number, number>()
  for (const kind of ['skater', 'goalie']) {
    const d = await j(`https://api.nhle.com/stats/rest/en/${kind}/summary?isAggregate=true&isGame=false&limit=-1&start=0&cayenneExp=gameTypeId=2%20and%20seasonId%3E=19171918%20and%20seasonId%3C=20302031`)
    for (const r of d.data ?? []) gp.set(r.playerId, (gp.get(r.playerId) ?? 0) + (r.gamesPlayed ?? 0))
  }
  n = 0
  db.transaction(() => { for (const p of tank('NHL')) { const id = Number(p.nhlComID); if (!id) continue; set.run(JSON.stringify({ gp: gp.get(id) ?? 0 }), 'NHL', String(p.playerID)); n++ } })()
  console.log(`NHL: ${n} players (${gp.size} with NHL games)`)

  // MLB — debut dates for everyone who has appeared since 2015; anyone else has no MLB service
  const debut = new Map<number, string | null>()
  for (let y = 2015; y <= new Date().getFullYear(); y++) {
    const d = await j(`https://statsapi.mlb.com/api/v1/sports/1/players?season=${y}`)
    for (const p of d.people ?? []) if (!debut.has(p.id) || (p.mlbDebutDate && !debut.get(p.id))) debut.set(p.id, p.mlbDebutDate ?? null)
  }
  // minor leaguers (Triple-A down to Single-A) join the player pool so they can be taken in the ySFLB Rookie Draft
  const have = new Set((db.prepare(`SELECT external_id FROM players WHERE sport = 'MLB'`).all() as any[]).map(r => String(r.external_id)))
  const addP = db.prepare(`INSERT INTO players (id, external_id, name, sport, position, eligible_positions, real_team, real_team_abbr, status, is_rookie) VALUES (?, ?, ?, 'MLB', ?, ?, '', '', 'ACTIVE', 1)`)
  let added = 0
  const season = new Date().getMonth() >= 10 ? new Date().getFullYear() : new Date().getFullYear() - 1
  for (const sid of [11, 12, 13, 14]) {
    const d = await j(`https://statsapi.mlb.com/api/v1/sports/${sid}/players?season=${season}`)
    db.transaction(() => { for (const p of d.people ?? []) {
      if (have.has(String(p.id)) || p.mlbDebutDate) continue
      const pos = p.primaryPosition?.abbreviation === 'P' ? 'P' : p.primaryPosition?.abbreviation === 'TWP' ? 'P' : (p.primaryPosition?.abbreviation ?? 'UT')
      addP.run(`mlb-${p.id}`, String(p.id), p.fullName, pos, JSON.stringify(pos === 'P' ? ['SP', 'RP'] : [pos]))
      have.add(String(p.id)); added++
    } })()
  }
  console.log(`MiLB: ${added} prospects added`)
  n = 0
  const mlb = db.prepare(`SELECT external_id FROM players WHERE sport = 'MLB'`).all() as any[]
  db.transaction(() => {
    for (const p of mlb) {
      const d = debut.get(Number(p.external_id))
      set.run(JSON.stringify(d ? { debut: d, maxDays: maxServiceDays(d) } : { debut: null, maxDays: 0 }), 'MLB', p.external_id); n++
    }
  })()
  console.log(`MLB: ${n} players`)

  // NBA — ESPN experience, matched by name (Tank01's NBA list carries no experience)
  const espn = new Map<string, number>()
  for (let page = 1; page < 30; page++) {
    const d = await j(`https://sports.core.api.espn.com/v3/sports/basketball/nba/athletes?limit=1000&page=${page}`)
    for (const a of d.items ?? []) if (a.experience?.years != null) { const k = norm(a.fullName ?? ''); if (!espn.has(k) || a.active) espn.set(k, a.experience.years) }
    if (page >= (d.pageCount ?? 1)) break
  }
  n = 0
  const nba = db.prepare(`SELECT id, name FROM players WHERE sport = 'NBA'`).all() as any[]
  db.transaction(() => { for (const p of nba) { const y = espn.get(norm(p.name)); if (y == null) continue; setByName.run(JSON.stringify({ years: y }), 'NBA', p.id); n++ } })()
  console.log(`NBA: ${n}/${nba.length} players matched`)
}
main().catch(e => { console.error(e); process.exit(1) })
