/**
 * Load the Fantrax history pulled from the owner's signed-in browser (data/fantrax-history/
 * <fantraxLeagueId>/<season>_<LG>.json) into two tables:
 *
 *   fantrax_player_periods  every rostered player, every Fantrax period (NFL: week; NHL/NBA/MLB:
 *                           day): club, slot, status (1 active · 2 bench · 3 IR · 9 taxi), Fantrax
 *                           fantasy points and stat line, mapped to our clubs and ySF matchup periods.
 *   fantrax_transactions    claims, drops, trades and lineup changes as Fantrax recorded them.
 *
 * Read-only toward Fantrax; idempotent (re-running replaces a league-season's rows).
 *   npx tsx scripts/fantrax/import-history.ts
 */
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const DIR = path.join(ROOT, 'data', 'fantrax-history')
const db = new Database(path.join(ROOT, 'data', 'nexus.db'))
db.pragma('journal_mode = WAL')

db.exec(`
CREATE TABLE IF NOT EXISTS fantrax_player_periods (
  season TEXT NOT NULL, sport TEXT NOT NULL, fx_league_id TEXT NOT NULL, period INTEGER NOT NULL,
  date TEXT, matchup_period INTEGER, team_id TEXT, fx_team_id TEXT NOT NULL,
  fx_player_id TEXT NOT NULL, name TEXT, pro_team TEXT, positions TEXT, slot TEXT, status TEXT,
  fpts REAL, opp TEXT, stats TEXT,
  PRIMARY KEY (fx_league_id, period, fx_team_id, fx_player_id)
);
CREATE INDEX IF NOT EXISTS fpp_matchup ON fantrax_player_periods(season, sport, matchup_period, team_id);
CREATE TABLE IF NOT EXISTS fantrax_trades (
  season TEXT NOT NULL, sport TEXT NOT NULL, fx_league_id TEXT NOT NULL, seq INTEGER NOT NULL, tx_set TEXT,
  from_team_id TEXT, to_team_id TEXT, fx_player_id TEXT, name TEXT, pro_team TEXT, positions TEXT,
  pick TEXT, note TEXT, date TEXT, executed INTEGER, deleted INTEGER,
  PRIMARY KEY (fx_league_id, seq)
);
CREATE TABLE IF NOT EXISTS fantrax_transactions (
  season TEXT NOT NULL, sport TEXT NOT NULL, fx_league_id TEXT NOT NULL, view TEXT NOT NULL, seq INTEGER NOT NULL,
  tx_set TEXT, code TEXT, claim_type TEXT, result TEXT, executed INTEGER, deleted INTEGER,
  team_id TEXT, fx_team_id TEXT, fx_player_id TEXT, name TEXT, pro_team TEXT, positions TEXT,
  date TEXT, period TEXT, cells TEXT,
  PRIMARY KEY (fx_league_id, view, seq)
);`)

const SPORT: Record<string, string> = { FL: 'NFL', HL: 'NHL', BA: 'NBA', LB: 'MLB' }
const FEED: Record<string, string> = { FL: 'ysf_fl', HL: 'ysf_hl', BA: 'ysf_ba', LB: 'ysf_lb' }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

async function json(url: string) { try { const r = await fetch(url); return r.ok ? await r.json() : null } catch { return null } }

async function main() {
  // club identity: Fantrax team name → ysf owner id → our team id (owners were imported as <ysf_id>@ysf.local)
  const nameToYsf: Record<string, string> = { 'Ogden Rovers S.C.': 'd_ogden', 'Ogden-upon-York S.C.': 'd_ogden' }
  const feeds: Record<string, any> = {}
  for (const lg of Object.keys(FEED)) {
    feeds[`2026-27_${lg}`] = await json(`https://ysffantasy.com/data/league_${FEED[lg]}.json`)
    feeds[`2025-26_${lg}`] = await json(`https://ysffantasy.com/data/archives/2025-26/${FEED[lg]}.json`)
  }
  for (const f of Object.values(feeds)) {
    for (const v of Object.values<any>(f?.rosters ?? {})) if (v.fantrax_name && v.ysf_id) nameToYsf[v.fantrax_name] = v.ysf_id
    for (const s of f?.standings ?? []) if (s.team_name && s.ysf_id) nameToYsf[s.team_name] = s.ysf_id
  }
  // full player names ("Hurts, Jalen" → "Jalen Hurts"); Fantrax's lineup pages only give "J. Hurts"
  const fullName: Record<string, string> = {}
  for (const sp of ['NFL', 'NHL', 'NBA', 'MLB']) {
    const ids = await json(`https://www.fantrax.com/fxea/general/getPlayerIds?sport=${sp}`)
    for (const [id, v] of Object.entries<any>(ids ?? {})) { const n = String(v?.name ?? ''); if (n && n !== 'Team') fullName[id] = n.includes(', ') ? n.split(', ').reverse().join(' ') : n }
  }
  const teamOf: Record<string, string> = {}
  for (const r of db.prepare(`SELECT t.id, u.email FROM teams t JOIN users u ON u.id = t.user_id WHERE t.league_id = 'ysf'`).all() as any[]) teamOf[r.email.replace('@ysf.local', '')] = r.id

  const club = (_: string | undefined, name?: string) => { const y = name ? nameToYsf[name] : undefined; return y ? teamOf[y] ?? null : null }
  const insP = db.prepare(`INSERT OR REPLACE INTO fantrax_player_periods VALUES (@season,@sport,@lid,@period,@date,@mp,@team,@fxteam,@pid,@name,@pro,@pos,@slot,@status,@fpts,@opp,@stats)`)
  const insT = db.prepare(`INSERT OR REPLACE INTO fantrax_transactions VALUES (@season,@sport,@lid,@view,@seq,@set,@code,@ct,@rc,@ex,@del,@team,@fxteam,@pid,@name,@pro,@pos,@date,@period,@cells)`)

  // trades with their draft picks and the Commission's notes (data/fantrax-history/*/trades_all.json)
  const MONI: Record<string, number> = Object.fromEntries(MON.map((m, i) => [m, i]))
  const isoOf = (s: string | null) => { const m = s && /(\w{3}) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2})(AM|PM)/.exec(s); if (!m) return null; let h = +m[4] % 12; if (m[6] === 'PM') h += 12; return `${m[3]}-${String(MONI[m[1]] + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}T${String(h).padStart(2, '0')}:${m[5]}:00` }
  for (const lid of fs.readdirSync(DIR)) {
    const tf = path.join(DIR, lid, 'trades_all.json')
    if (!fs.existsSync(tf)) continue
    const all = JSON.parse(fs.readFileSync(tf, 'utf8')).data as Record<string, any[]>
    const ins = db.prepare(`INSERT OR REPLACE INTO fantrax_trades VALUES (@season,@sport,@lid,@seq,@set,@from,@to,@pid,@name,@pro,@pos,@pick,@note,@date,@ex,@del)`)
    let n = 0
    db.transaction(() => {
      for (const [key, rows] of Object.entries(all)) {
        const [flid, tag] = key.split(':')
        const [, stag, lg] = /^(\d{4}(?:-\d{2})?)_(FL|HL|BA|LB)$/.exec(tag)!
        const season = stag.length === 4 ? `${+stag - 1}-${stag.slice(2)}` : stag
        db.prepare(`DELETE FROM fantrax_trades WHERE fx_league_id = ?`).run(flid)
        let last: string | null = null
        rows.forEach((r: any, i: number) => {
          const date = isoOf(r.date) ?? last; last = date
          ins.run({ season, sport: SPORT[lg], lid: flid, seq: i, set: r.set, from: club(undefined, r.from), to: club(undefined, r.to), pid: r.id, name: r.id ? (fullName[r.id] ?? r.n) : null, pro: r.tm, pos: r.pos, pick: r.pick, note: r.note, date, ex: r.ex ? 1 : 0, del: r.del ? 1 : 0 })
          n++
        })
      }
    })()
    console.log(`trades: ${n} rows (players and picks)`)
  }
  for (const lid of fs.readdirSync(DIR)) {
    const files = fs.readdirSync(path.join(DIR, lid)).filter(f => f.endsWith('.json')).sort()
    for (const file of files) {
      const m = /^(\d{4}(?:-\d{2})?)_(FL|HL|BA|LB)(_tx)?\.json$/.exec(file)
      if (!m) continue
      const [, tag, lg, txOnly] = m
      const season = tag.length === 4 ? `${+tag - 1}-${tag.slice(2)}` : tag        // MLB 2025 belongs to the 2024-25 season
      const sport = SPORT[lg]
      const d = JSON.parse(fs.readFileSync(path.join(DIR, lid, file), 'utf8'))
      // calendar year for "Tue Sep 29"-style labels: MLB seasons sit in one year; the others span two
      const y0 = parseInt(season.slice(0, 4))
      const mlbYear = sport === 'MLB' ? (tag.length === 4 ? +tag : y0 + 1) : null
      const yearOf = (mon: number) => mlbYear ?? (mon >= 6 ? y0 : y0 + 1)
      const feed = feeds[`${season}_${lg}`]
      const periods = Object.entries<any>(feed?.schedule_meta?.periods ?? {}).map(([p, v]) => ({ p: +p, s: v.start, e: v.end }))
      const mpOf = (date: string | null, fxPeriod: number) => sport === 'NFL' ? fxPeriod : (date ? periods.find(x => x.s <= date && date <= x.e)?.p ?? null : null)
      const teams: Record<string, string> = Object.fromEntries((d.meta?.teams ?? []).map((t: any) => [t.id, t.name]))
      const posMap: Record<string, string> = Object.fromEntries(Object.entries<any>(d.meta?.leagueInfo?.positionMap ?? {}).map(([k, v]) => [k, v.shortName]))
      const club = (fxTeamId: string | undefined, name?: string) => { const n = name ?? (fxTeamId ? teams[fxTeamId] : undefined); const y = n ? nameToYsf[n] : undefined; return y ? teamOf[y] ?? null : null }
      const unmapped = new Set<string>()

      let rows = 0
      db.transaction(() => {
        if (!txOnly) {
          db.prepare(`DELETE FROM fantrax_player_periods WHERE fx_league_id = ?`).run(lid)
          for (const [k, chunk] of Object.entries<any>(d)) {
            if (!k.startsWith('rosters_')) continue
            for (const [pStr, blob] of Object.entries<any>(chunk)) {
              const period = +pStr
              let date: string | null = null
              const dm = /\((?:\w{3} )?(\w{3}) (\d{1,2})\)/.exec(blob.label ?? '')
              if (sport !== 'NFL' && dm) { const mon = MON.indexOf(dm[1]); date = `${yearOf(mon)}-${String(mon + 1).padStart(2, '0')}-${dm[2].padStart(2, '0')}` }
              const mp = mpOf(date, period)
              for (const t of blob.teams) {
                const team = club(t.teamId); if (!team) unmapped.add(teams[t.teamId] ?? t.teamId)
                for (const tab of t.tabs) {
                  const fi = tab.h.indexOf('FPts'), oi = tab.h.indexOf('Opp')
                  for (const r of tab.rows) {
                    if (!r.id) continue
                    const stats: Record<string, string> = {}
                    tab.h.forEach((h: string, i: number) => { if (i !== fi && i !== oi && h !== 'Age' && h !== 'Bye' && r.c[i] !== '') stats[stats[h] !== undefined ? `${h}#${i}` : h] = r.c[i] })
                    const fpts = fi >= 0 && r.c[fi] !== '' && !isNaN(+r.c[fi]) ? +r.c[fi] : null
                    insP.run({ season, sport, lid, period, date, mp, team, fxteam: t.teamId, pid: r.id, name: String(r.id).includes('#') ? `${r.n} D/ST` : fullName[r.id] ?? r.n, pro: r.tm ?? null, pos: r.pos ?? null,
                      slot: posMap[r.slot] ?? r.slot ?? null, status: String(r.st), fpts, opp: oi >= 0 ? String(r.c[oi] ?? '').replace('<br/>', ' ') : null, stats: JSON.stringify(stats) })
                    rows++
                  }
                }
              }
            }
          }
        }
        let tx = 0
        for (const view of ['CLAIM_DROP', 'TRADE', 'LINEUP_CHANGE']) {
          const list = d[`tx_${view}`]; if (!list) continue
          db.prepare(`DELETE FROM fantrax_transactions WHERE fx_league_id = ? AND view = ?`).run(lid, view)
          // Fantrax shows the date once per group; carry it down to the group's other rows
          let lastDate = ''
          list.forEach((r: any, i: number) => {
            const c = r.cells ?? {}; if (c.date) lastDate = c.date
            insT.run({ season, sport, lid, view, seq: i, set: r.set ?? null, code: r.tc ?? null, ct: r.ct ?? null, rc: r.rc ?? null, ex: r.ex ? 1 : 0, del: r.del ? 1 : 0,
              team: club(c.teamId, c.team ?? c.to), fxteam: c.teamId ?? null, pid: r.id ?? null, name: (r.id && fullName[r.id]) ?? r.n ?? null, pro: r.tm ?? null, pos: r.pos ?? null,
              date: c.date || lastDate, period: c.week ?? c.weekOrPeriod ?? null, cells: JSON.stringify(c) })
            tx++
          })
        }
        console.log(`${lid} ${file}: ${season} ${sport} · ${rows} player-periods · ${tx} transactions${unmapped.size ? ` · UNMAPPED clubs: ${[...unmapped].join(', ')}` : ''}`)
      })()
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
