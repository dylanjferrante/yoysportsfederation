/**
 * ySFHL stats from the NHL's official feed (api-web.nhle.com — free, no key).
 * For every final regular-season/playoff game: the box score (shots, hits, blocks, goalie saves,
 * goals against, decision) and the play-by-play (every goal and assist with its strength, so
 * power-play and short-handed points are exact). One summary file per game in data/nhl-cache.
 * Also links Fantrax player IDs to NHL player IDs (player_id_map.nhl_id).
 *   npx tsx scripts/nhl-sync.ts [--from=2026-09-29] [--to=YYYY-MM-DD]
 */
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const DIR = path.join(ROOT, 'data', 'nhl-cache')
const API = 'https://api-web.nhle.com/v1'
const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const etToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let calls = 0
async function get(p: string): Promise<any> {
  for (let a = 0; a < 4; a++) {
    await sleep(120); calls++
    try { const r = await fetch(`${API}${p}`, { headers: { 'User-Agent': 'ysf-app' } }); if (r.ok) return await r.json(); if (r.status === 404) return null } catch { /* retry */ }
    await sleep(1500 * (a + 1))
  }
  throw new Error(`NHL ${p}: failed`)
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')

export type NhlLine = { id: number; name: string; team: string; pos: string; g: number; a: number; sog: number; hit: number; blk: number; ppg: number; ppa: number; shg: number; sha: number
  goalie?: { sv: number; ga: number; dec: string | null; toi: string } }

async function game(id: number, date: string, away: string, home: string) {
  const [box, pbp] = await Promise.all([get(`/gamecenter/${id}/boxscore`), get(`/gamecenter/${id}/play-by-play`)])
  if (!box || !pbp) return null
  const names = new Map<number, string>((pbp.rosterSpots ?? []).map((p: any) => [p.playerId, `${p.firstName?.default ?? ''} ${p.lastName?.default ?? ''}`.trim()]))
  const lines = new Map<number, NhlLine>()
  const blank = (id: number, team: string, pos: string): NhlLine => ({ id, name: names.get(id) ?? '', team, pos, g: 0, a: 0, sog: 0, hit: 0, blk: 0, ppg: 0, ppa: 0, shg: 0, sha: 0 })
  for (const [side, team] of [['awayTeam', away], ['homeTeam', home]] as const) {
    const s = box.playerByGameStats?.[side] ?? {}
    for (const p of [...(s.forwards ?? []), ...(s.defense ?? [])]) { const l = blank(p.playerId, team, p.position); l.sog = p.sog ?? 0; l.hit = p.hits ?? 0; l.blk = p.blockedShots ?? 0; lines.set(p.playerId, l) }
    for (const p of s.goalies ?? []) {
      if (!p.toi || p.toi === '00:00') continue
      const l = blank(p.playerId, team, 'G'); l.goalie = { sv: p.saves ?? 0, ga: p.goalsAgainst ?? 0, dec: p.decision ?? null, toi: p.toi }; lines.set(p.playerId, l)
    }
  }
  // goals and assists with their strength, from the play-by-play (situationCode: away G, away skaters, home skaters, home G)
  const awayId = pbp.awayTeam?.id
  for (const e of pbp.plays ?? []) {
    if (e.typeDescKey !== 'goal' || e.periodDescriptor?.periodType === 'SO') continue
    const d = e.details ?? {}, sc = String(e.situationCode ?? '1551')
    // a pulled goalie's extra attacker isn't a power play (nor is the other side short-handed)
    const ag = +sc[0], as = +sc[1] - (ag ? 0 : 1), hs = +sc[2] - (+sc[3] ? 0 : 1)
    const mine = d.eventOwnerTeamId === awayId ? as : hs, theirs = d.eventOwnerTeamId === awayId ? hs : as
    const st = mine > theirs ? 'pp' : mine < theirs ? 'sh' : 'ev'
    const team = d.eventOwnerTeamId === awayId ? away : home
    const credit = (pid: number | undefined, kind: 'g' | 'a') => {
      if (!pid) return
      const l = lines.get(pid) ?? blank(pid, team, '?'); lines.set(pid, l)
      l[kind]++
      if (st === 'pp') l[kind === 'g' ? 'ppg' : 'ppa']++
      if (st === 'sh') l[kind === 'g' ? 'shg' : 'sha']++
    }
    credit(d.scoringPlayerId, 'g'); credit(d.assist1PlayerId, 'a'); credit(d.assist2PlayerId, 'a')
  }
  return { id, date, away, home, outcome: box.gameOutcome?.lastPeriodType ?? 'REG', lines: [...lines.values()] }
}

// games in progress: re-fetched every run into data/nhl-cache/live (removed once the game is final)
const LIVE = path.join(DIR, 'live')
async function live() {
  fs.mkdirSync(LIVE, { recursive: true })
  const date = etToday()
  const sc = await get(`/score/${date}`)
  const keep = new Set<string>()
  let n = 0
  for (const g of sc?.games ?? []) {
    if (![2, 3].includes(g.gameType) || !['LIVE', 'CRIT'].includes(g.gameState)) continue
    const name = `${date.replace(/-/g, '')}_${g.awayTeam.abbrev}@${g.homeTeam.abbrev}_${g.id}.json`
    const out = await game(g.id, date, g.awayTeam.abbrev, g.homeTeam.abbrev)
    if (out) { fs.writeFileSync(path.join(LIVE, name), JSON.stringify({ ...out, live: true, period: g.periodDescriptor?.number ?? null, clock: g.clock?.timeRemaining ?? null, intermission: !!g.clock?.inIntermission })); keep.add(name); n++ }
  }
  for (const f of fs.readdirSync(LIVE)) if (!keep.has(f)) fs.unlinkSync(path.join(LIVE, f))
  console.log(`NHL official live: ${n} games in progress`)
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true })
  if (process.argv.includes('--live')) return live()
  // finals are cached for good, so a routine run only looks back 3 days; --from 2026-09-29 backfills
  const back = new Date(etToday() + 'T12:00:00'); back.setDate(back.getDate() - 3)
  const from = arg('from') ?? `${back.getFullYear()}-${String(back.getMonth() + 1).padStart(2, '0')}-${String(back.getDate()).padStart(2, '0')}`, to = arg('to') ?? etToday()
  let fetched = 0, cached = 0
  for (let d = new Date(from + 'T12:00:00'); d <= new Date(to + 'T12:00:00'); d.setDate(d.getDate() + 1)) {
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const sc = await get(`/score/${date}`)
    for (const g of sc?.games ?? []) {
      if (![2, 3].includes(g.gameType) || !['OFF', 'FINAL'].includes(g.gameState)) continue
      const f = path.join(DIR, `${date.replace(/-/g, '')}_${g.awayTeam.abbrev}@${g.homeTeam.abbrev}_${g.id}.json`)
      if (fs.existsSync(f)) { cached++; continue }
      const out = await game(g.id, date, g.awayTeam.abbrev, g.homeTeam.abbrev)
      if (out) { fs.writeFileSync(f, JSON.stringify(out)); fetched++ }
    }
  }
  // link Fantrax players to NHL ids by full name (+ team when names repeat)
  const db = new Database(path.join(ROOT, 'data', 'nexus.db'))
  try { db.exec(`ALTER TABLE player_id_map ADD COLUMN nhl_id TEXT`) } catch { /* exists */ }
  type R = { id: number; teams: Set<string>; pos: Set<string>; first: string; last: string }
  const reg = new Map<string, R[]>(), byLast = new Map<string, R[]>()
  for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.json'))) for (const l of (JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).lines as NhlLine[])) {
    const k = norm(l.name); const list = reg.get(k) ?? []; let e = list.find(x => x.id === l.id)
    if (!e) { const [first, ...rest] = l.name.split(' '); e = { id: l.id, teams: new Set(), pos: new Set(), first: norm(first), last: norm(rest.join(' ')) }; list.push(e); byLast.set(e.last, [...(byLast.get(e.last) ?? []), e]) }
    e.teams.add(l.team); e.pos.add(l.pos === 'G' ? 'G' : l.pos === 'D' ? 'D' : 'F'); reg.set(k, list)
  }
  const fx = db.prepare(`SELECT fx_player_id id, name, pro_team team, MAX(positions) positions FROM fantrax_player_periods WHERE sport = 'NHL' GROUP BY fx_player_id`).all() as any[]
  const up = db.prepare(`INSERT INTO player_id_map (sport, fx_id, tank_id, method, name, nhl_id) VALUES ('NHL', ?, '', 'nhl', ?, ?) ON CONFLICT(sport, fx_id) DO UPDATE SET nhl_id = excluded.nhl_id`)
  let linked = 0; const miss: string[] = []
  db.transaction(() => { for (const p of fx) {
    // same full name; when names repeat (two Elias Petterssons), the one with the right team and position;
    // else same last name, first initial and team (Dmitry/Dmitri Voronkov, Daniel/Dan Vladar)
    const grp = String(p.positions ?? '').includes('G') ? 'G' : /^D\b|,D\b|^D$/.test(String(p.positions ?? '')) && !/[CLRW]/.test(String(p.positions ?? '')) ? 'D' : 'F'
    const list = reg.get(norm(p.name)) ?? []
    const [pf, ...pr] = String(p.name).split(' ')
    const hit = (list.length === 1 ? list[0] : list.find(x => x.teams.has(p.team) && x.pos.has(grp)) ?? list.find(x => x.pos.has(grp)))
      ?? (byLast.get(norm(pr.join(' '))) ?? []).find(x => x.first[0] === norm(pf)[0] && x.teams.has(p.team))
    if (hit) { up.run(p.id, p.name, String(hit.id)); linked++ } else if (list.length || true) miss.push(`${p.name} (${p.team})`)
  } })()
  console.log(`NHL official: ${fetched} games fetched, ${cached} already cached, ${calls} requests · ${linked} Fantrax players linked to NHL ids · unlinked ${miss.length}${miss.length ? ': ' + miss.slice(0, 12).join(', ') : ''}`)
}
main().catch(e => { console.error(e); process.exit(1) })
