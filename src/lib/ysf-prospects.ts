// Baseball prospects for the ySFLB rookie draft: each player's season at every level (MLB, Triple-A,
// Double-A, High-A, Single-A, Rookie) from MLB's public stats feed (statsapi.mlb.com), matched by MLB
// player id (players.external_id), with his age, his highest level, a combined stat line and a ySF
// prospect score. About 15 calls a run; the scheduler runs it daily.
//
// The score (higher is better, 0–100, 50 is an average High-A regular) weighs the level he mostly played
// at, how young he is for that level, and how well he produced against that level's average — OPS for
// hitters, strikeout-minus-walk rate for pitchers — trusted more as the sample grows.
import { db } from '@/db'
import { sql } from 'drizzle-orm'

const API = 'https://statsapi.mlb.com/api/v1'
// sportId → level, its weight, and a typical age there
const LEVELS: { id: number; level: string; w: number; age: number }[] = [
  { id: 1, level: 'MLB', w: 5, age: 28 }, { id: 11, level: 'AAA', w: 4, age: 26 }, { id: 12, level: 'AA', w: 3, age: 24 },
  { id: 13, level: 'A+', w: 2, age: 22.5 }, { id: 14, level: 'A', w: 1, age: 21.5 }, { id: 16, level: 'ROK', w: 0, age: 20 },
]

export type Prospect = {
  playerId: string; level: string; age: number | null; kind: 'H' | 'P'; score: number
  line: Record<string, number | string>   // H: PA AVG HR SB OPS · P: IP ERA WHIP K9
  org: string | null                      // his MLB organization (CLE), from the club he played for
  levels: string[]
}

export function ensureProspectSchema() {
  db.run(sql`CREATE TABLE IF NOT EXISTS ysf_prospects (player_id TEXT PRIMARY KEY, season TEXT NOT NULL, level TEXT NOT NULL, age REAL,
    kind TEXT NOT NULL, score REAL NOT NULL, line TEXT NOT NULL, levels TEXT NOT NULL, updated TEXT NOT NULL)`)
  try { db.run(sql`ALTER TABLE ysf_prospects ADD COLUMN org TEXT`) } catch { /* already there */ }
}

const get = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json() as Promise<any> }
const ipNum = (ip: string | number) => { const [w, f] = String(ip ?? '0').split('.'); return Number(w) + (Number(f ?? 0) / 3) }
const r3 = (x: number) => Math.round(x * 1000) / 1000

export async function pullProspects(season = String(new Date().getMonth() >= 2 ? new Date().getFullYear() : new Date().getFullYear() - 1)) {
  ensureProspectSchema()
  // MLB ids of the app's baseball players
  const ours = new Map(db.all<{ id: string; ext: string }>(sql`SELECT id, external_id ext FROM players WHERE sport = 'MLB' AND external_id IS NOT NULL`).map(p => [String(p.ext), p.id]))
  // each club → its MLB organization's code, in the app's spelling
  const FIX: Record<string, string> = { AZ: 'ARI', CWS: 'CHW' }
  const orgAbbr = new Map<number, string>()
  for (const t of (await get(`${API}/teams?sportId=1&season=${season}`))?.teams ?? []) orgAbbr.set(t.id, FIX[t.abbreviation] ?? t.abbreviation)
  const clubOrg = new Map<number, string>(orgAbbr)
  for (const t of (await get(`${API}/teams?sportIds=11,12,13,14,16&season=${season}`))?.teams ?? []) if (t.parentOrgId && orgAbbr.has(t.parentOrgId)) clubOrg.set(t.id, orgAbbr.get(t.parentOrgId)!)
  type Acc = { h: Record<string, number>[]; p: Record<string, number>[]; top: number; levels: Set<string>; org: string | null }
  const acc = new Map<string, Acc>()
  const lg: Record<string, { pa: number; ops: number; bf: number; kbb: number }> = {}
  for (const L of LEVELS) for (const group of ['hitting', 'pitching'] as const) {
    const j = await get(`${API}/stats?stats=season&group=${group}&sportId=${L.id}&season=${season}&playerPool=ALL&limit=10000`)
    for (const s of j?.stats?.[0]?.splits ?? []) {
      const ext = String(s.player?.id ?? ''), st = s.stat ?? {}
      const l = (lg[L.level] ??= { pa: 0, ops: 0, bf: 0, kbb: 0 })
      if (group === 'hitting') { const pa = Number(st.plateAppearances ?? 0); l.pa += pa; l.ops += pa * Number(st.ops ?? 0) }
      else { const bf = Number(st.battersFaced ?? 0); l.bf += bf; l.kbb += Number(st.strikeOuts ?? 0) - Number(st.baseOnBalls ?? 0) }
      if (!ours.has(ext)) continue
      const a = acc.get(ext) ?? { h: [], p: [], top: -1, levels: new Set<string>(), org: null }
      a.org = clubOrg.get(Number(s.team?.id)) ?? a.org
      const row = { lvl: L.w, pa: Number(st.plateAppearances ?? 0), ab: Number(st.atBats ?? 0), h: Number(st.hits ?? 0), hr: Number(st.homeRuns ?? 0), sb: Number(st.stolenBases ?? 0),
        bb: Number(st.baseOnBalls ?? 0), hbp: Number(st.hitByPitch ?? 0), sf: Number(st.sacFlies ?? 0), tb: Number(st.totalBases ?? 0),
        ip: ipNum(st.inningsPitched), er: Number(st.earnedRuns ?? 0), k: Number(st.strikeOuts ?? 0), ph: Number(st.hits ?? 0), pbb: Number(st.baseOnBalls ?? 0), bf: Number(st.battersFaced ?? 0) }
      if (group === 'hitting' && row.pa > 0) a.h.push(row)
      if (group === 'pitching' && row.bf > 0) a.p.push(row)
      if ((group === 'hitting' ? row.pa : row.bf) > 0) { a.top = Math.max(a.top, L.w); a.levels.add(L.level) }
      acc.set(ext, a)
    }
  }
  const lgOps = (lvl: string) => lg[lvl]?.pa ? lg[lvl].ops / lg[lvl].pa : 0.72
  const lgKbb = (lvl: string) => lg[lvl]?.bf ? lg[lvl].kbb / lg[lvl].bf : 0.13

  // ages, 150 players a call
  const exts = [...acc.keys()], age = new Map<string, number>()
  for (let i = 0; i < exts.length; i += 150) {
    const j = await get(`${API}/people?personIds=${exts.slice(i, i + 150).join(',')}`)
    for (const p of j?.people ?? []) if (p.currentAge != null) age.set(String(p.id), Number(p.currentAge))
  }

  const now = new Date().toISOString()
  const ins = (p: Prospect) => db.run(sql`INSERT OR REPLACE INTO ysf_prospects (player_id, season, level, age, kind, score, line, levels, updated, org)
    VALUES (${p.playerId}, ${season}, ${p.level}, ${p.age}, ${p.kind}, ${p.score}, ${JSON.stringify(p.line)}, ${JSON.stringify(p.levels)}, ${now}, ${p.org})`)
  let n = 0
  for (const [ext, a] of acc) {
    const sum = (rows: Record<string, number>[], k: string) => rows.reduce((t, r) => t + (r[k] ?? 0), 0)
    const pa = sum(a.h, 'pa'), bf = sum(a.p, 'bf')
    const kind: 'H' | 'P' = bf > pa ? 'P' : 'H'
    // his level: where he did most of his work this season (a September call-up doesn't make him an MLB regular)
    const rows = kind === 'H' ? a.h : a.p, key = kind === 'H' ? 'pa' : 'bf'
    const byLvl = new Map<number, number>(); for (const r of rows) byLvl.set(r.lvl, (byLvl.get(r.lvl) ?? 0) + r[key])
    const main = [...byLvl.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0])[0]
    const top = LEVELS.find(L => L.w === main?.[0])
    if (!top) continue
    const ag = age.get(ext) ?? null
    const young = ag != null ? top.age - ag : 0
    let line: Prospect['line'], perf: number
    if (kind === 'H') {
      const ab = sum(a.h, 'ab'), h = sum(a.h, 'h'), bb = sum(a.h, 'bb'), hbp = sum(a.h, 'hbp'), sf = sum(a.h, 'sf'), tb = sum(a.h, 'tb')
      const obp = (h + bb + hbp) / Math.max(1, ab + bb + hbp + sf), slg = tb / Math.max(1, ab), ops = obp + slg
      line = { PA: pa, AVG: r3(h / Math.max(1, ab)).toFixed(3).replace(/^0/, ''), HR: sum(a.h, 'hr'), SB: sum(a.h, 'sb'), OPS: r3(ops).toFixed(3).replace(/^0/, '') }
      // production against the level's average, trusted fully at 300 PA
      const atTop = a.h.filter(r => r.lvl === top.w), topPa = sum(atTop, 'pa')
      const topOps = topPa ? ((sum(atTop, 'h') + sum(atTop, 'bb') + sum(atTop, 'hbp')) / Math.max(1, sum(atTop, 'ab') + sum(atTop, 'bb') + sum(atTop, 'hbp') + sum(atTop, 'sf')) + sum(atTop, 'tb') / Math.max(1, sum(atTop, 'ab'))) : ops
      perf = (topOps - lgOps(top.level)) * 100 * Math.min(1, pa / 300)
    } else {
      const ip = sum(a.p, 'ip'), er = sum(a.p, 'er'), k = sum(a.p, 'k'), bbp = sum(a.p, 'pbb'), hh = sum(a.p, 'ph')
      line = { IP: Math.round(ip * 10) / 10, ERA: (er * 9 / Math.max(0.1, ip)).toFixed(2), WHIP: ((hh + bbp) / Math.max(0.1, ip)).toFixed(2), K9: (k * 9 / Math.max(0.1, ip)).toFixed(1) }
      perf = ((k - bbp) / Math.max(1, bf) - lgKbb(top.level)) * 100 * 1.2 * Math.min(1, bf / 350)
    }
    const score = Math.round(Math.max(0, Math.min(100, 50 + 6 * (top.w - 2) + 3 * young + perf)) * 10) / 10
    ins({ playerId: ours.get(ext)!, org: a.org, level: top.level, age: ag, kind, score, line, levels: LEVELS.filter(L => a.levels.has(L.level)).map(L => L.level) })
    n++
  }
  return { season, players: n }
}

export function prospectsFor(ids: string[]): Map<string, Prospect> {
  ensureProspectSchema()
  const out = new Map<string, Prospect>()
  if (!ids.length) return out
  for (let i = 0; i < ids.length; i += 500) {
    for (const r of db.all<any>(sql`SELECT * FROM ysf_prospects WHERE player_id IN ${ids.slice(i, i + 500)}`))
      out.set(r.player_id, { playerId: r.player_id, org: r.org ?? null, level: r.level, age: r.age, kind: r.kind, score: r.score, line: JSON.parse(r.line), levels: JSON.parse(r.levels) })
  }
  return out
}
