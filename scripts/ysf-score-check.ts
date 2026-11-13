/**
 * Score 2026-27 ySF periods from Tank01 box scores with the app's ySF scoring, using Fantrax's
 * recorded lineups, and compare with Fantrax: per player-period (and per day in the daily leagues)
 * and per club total against the official matchup scores.
 *   npx tsx scripts/ysf-score-check.ts [NFL|NHL|NBA] [--detail]
 */
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const db = new Database(path.join(process.cwd(), 'data', 'nexus.db'), { readonly: true })
const SEASON = '2026-27'
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '')

async function main() {
  const { loadGameLines } = await import('../src/lib/ysf-gamelines')
  const only = process.argv.find(a => /^(NFL|NHL|NBA)$/.test(a))
  const detail = process.argv.includes('--detail')
  const league = db.prepare(`SELECT scoring_settings, sport_schedule FROM leagues WHERE id='ysf'`).get() as any
  const scoringAll = JSON.parse(league.scoring_settings)
  // --fantrax-rules: score D/ST yards 300-349 as Fantrax does (+2) to compare like for like
  if (process.argv.includes('--fantrax-rules')) for (const t of scoringAll.NFL.yardsAllowedTiers) if (t.min === 300) t.points = 2
  const proTeams = JSON.parse(fs.readFileSync('scripts/data/pro-teams.json', 'utf8'))
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
  const feed: Record<string, any> = {}
  for (const [sp, k] of [['NFL', 'ysf_fl'], ['NHL', 'ysf_hl'], ['NBA', 'ysf_ba']]) feed[sp] = await (await fetch(`https://ysffantasy.com/data/league_${k}.json`)).json()

  for (const sport of (['NFL', 'NHL', 'NBA'] as const).filter(s => !only || s === only)) {
    const scoring = scoringAll[sport] ?? {}
    const lines = loadGameLines(sport, '2026-09-01', today, scoring)
    // Tank01 lines by normalized name (+ team), and team defenses by team
    const byNameTeam = new Map<string, typeof lines>(), byName = new Map<string, Set<string>>(), dst = new Map<string, typeof lines>()
    for (const g of lines) {
      if (g.dstTeam) { dst.set(g.dstTeam, [...(dst.get(g.dstTeam) ?? []), g]); continue }
      const k = norm(g.name)
      byNameTeam.set(k + '|' + g.team, [...(byNameTeam.get(k + '|' + g.team) ?? []), g])
      byName.set(k, (byName.get(k) ?? new Set()).add(g.tankId))
    }
    const linesOf = (name: string, team: string | null) => {
      if (/ D\/ST$/.test(name)) { const city = name.replace(/ D\/ST$/, ''); const ab = proTeams.NFL?.[city] ?? city; return dst.get(ab === 'LAR' ? 'LAR' : ab) ?? dst.get(ab.replace('WAS', 'WSH')) ?? null }
      const k = norm(name)
      const ids = byName.get(k)
      // one Tank01 player by that name: all his games, whichever team (traded players)
      if (ids?.size === 1) return lines.filter(g => !g.dstTeam && norm(g.name) === k)
      return team ? byNameTeam.get(k + '|' + team) ?? null : null
    }
    // NFL periods' dates from the ySF schedule
    const pm = feed[sport].schedule_meta.periods as Record<string, { start: string; end: string; complete: boolean }>
    const rows = db.prepare(`SELECT f.period, f.date, f.matchup_period, f.team_id, f.name, f.pro_team, f.slot, f.status, f.fpts, f.fx_player_id, m.tank_id FROM fantrax_player_periods f LEFT JOIN player_id_map m ON m.sport = f.sport AND m.fx_id = f.fx_player_id WHERE f.season=? AND f.sport=?`).all(SEASON, sport) as any[]
    if (sport === 'NHL') { const nm = new Map((db.prepare(`SELECT fx_id, nhl_id FROM player_id_map WHERE sport='NHL' AND nhl_id IS NOT NULL`).all() as any[]).map(r => [r.fx_id, 'nhl:' + r.nhl_id])); for (const r of rows) r.tank_id = nm.get(r.fx_player_id) ?? r.tank_id }
    const byTank = new Map<string, typeof lines>(); for (const g of lines) byTank.set(g.tankId, [...(byTank.get(g.tankId) ?? []), g])
    let ok = 0, off = 0, unmatched = 0, zeroBoth = 0
    const diffs: any[] = [], unm = new Map<string, number>()
    const club = new Map<string, number>()
    for (const r of rows) {
      let from: string, to: string
      if (sport === 'NFL') { const p = pm[String(r.period)]; if (!p?.complete) continue; from = p.start; to = p.end }
      else { if (!r.date || r.date >= today) continue; from = to = r.date }
      const ls = r.tank_id ? (byTank.get(r.tank_id) ?? []) : linesOf(r.name, r.pro_team)
      const ours = ls ? ls.filter(g => g.date >= from && g.date <= to).reduce((s, g) => s + g.pts, 0) : null
      const fx = r.fpts ?? 0
      if (ours == null) { if (fx !== 0) { unmatched++; unm.set(`${r.name} (${r.pro_team})`, (unm.get(`${r.name} (${r.pro_team})`) ?? 0) + 1) } else zeroBoth++ }
      else if (Math.abs(ours - fx) <= 0.051) { ok++; if (Math.abs(ours - fx) > 0.001 && detail) console.log('  TINY', r.name, r.period, r.date, ours.toFixed(3), fx) }
      else { off++; diffs.push({ name: r.name, team: r.pro_team, slot: r.slot, p: r.period, date: r.date, ours: +ours.toFixed(2), fx }) }
      if (r.status === '1' && r.matchup_period) { const k = `${r.matchup_period}|${r.team_id}`; club.set(k, (club.get(k) ?? 0) + (ours ?? 0)) }
    }
    // club totals vs official scores
    const sched = Object.fromEntries(JSON.parse(league.sport_schedule).map((s: any) => [s.sport, s.startWeek]))
    let cOk = 0, cOff = 0; const cDiffs: string[] = []
    for (const m of db.prepare(`SELECT week, home_team_id h, away_team_id a, home_score hs, away_score as_ FROM matchups WHERE league_id='ysf' AND season=? AND sport=? AND is_complete=1 AND away_team_id IS NOT NULL`).all(SEASON, sport) as any[]) {
      const mp = m.week - sched[sport] + 1
      for (const [t, sc] of [[m.h, m.hs], [m.a, m.as_]]) { const v = club.get(`${mp}|${t}`); if (v == null) continue; if (Math.abs(v - sc) <= 0.051) cOk++; else { cOff++; cDiffs.push(`P${mp} ${String(t).slice(0, 6)} ours ${v.toFixed(2)} official ${sc}`) } }
    }
    console.log(`\n${sport}: ${lines.length} game lines · player-periods match ${ok} · differ ${off} · no Tank01 line ${unmatched} (both zero ${zeroBoth}) · club totals match ${cOk}/${cOk + cOff}`)
    const top = [...unm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}×${v}`)
    if (top.length) console.log('  unmatched:', top.join(', '))
    for (const d of diffs.slice(0, detail ? 60 : 12)) console.log('  DIFF', JSON.stringify(d))
    for (const c of cDiffs.slice(0, 6)) console.log('  CLUB', c)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
