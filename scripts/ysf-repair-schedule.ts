/**
 * Make a league's 2026-27 matchups match the official Fantrax schedule (ysffantasy.com feed): who plays
 * whom each week, the scores and which are final — then recompute the standings. Existing matchups are
 * updated in place week by week (their ids, and links to them, stay the same).
 *   npx tsx scripts/ysf-repair-schedule.ts NFL           (shows what would change)
 *   npx tsx scripts/ysf-repair-schedule.ts NFL --write   (makes the changes)
 */
import Database from 'better-sqlite3'
import path from 'path'
import { nanoid } from 'nanoid'

const sport = (process.argv[2] ?? '').toUpperCase()
const write = process.argv.includes('--write')
const KEY: Record<string, string> = { NFL: 'ysf_fl', NHL: 'ysf_hl', NBA: 'ysf_ba', MLB: 'ysf_lb' }
if (!KEY[sport]) { console.error('Usage: npx tsx scripts/ysf-repair-schedule.ts NFL|NHL|NBA|MLB [--write]'); process.exit(1) }

async function main() {
  const db = new Database(path.join(process.cwd(), 'data', 'nexus.db'))
  const feed = await (await fetch(`${process.env.YSF_BASE || 'https://ysffantasy.com'}/data/league_${KEY[sport]}.json`)).json() as any
  const league = db.prepare(`SELECT season, sport_schedule FROM leagues WHERE id = 'ysf'`).get() as { season: string; sport_schedule: string }
  const start = (JSON.parse(league.sport_schedule) as { sport: string; startWeek: number }[]).find(s => s.sport === sport)?.startWeek
  if (!start) throw new Error(`no ${sport} schedule`)
  const byAbbr = new Map((db.prepare(`SELECT id, abbreviation FROM teams WHERE league_id = 'ysf'`).all() as { id: string; abbreviation: string }[]).map(t => [t.abbreviation, t.id]))
  // the feed spells some abbreviations with Cyrillic look-alikes (RMСК): fold them to Latin letters
  const latin = (x: string) => x.replace(/[\u0410\u0412\u0415\u041A\u041C\u041D\u041E\u0420\u0421\u0422\u0425]/g, c => ({ '\u0410': 'A', '\u0412': 'B', '\u0415': 'E', '\u041A': 'K', '\u041C': 'M', '\u041D': 'H', '\u041E': 'O', '\u0420': 'P', '\u0421': 'C', '\u0422': 'T', '\u0425': 'X' } as Record<string, string>)[c])
  // ysf ids → clubs through the Cup projection feed (clean abbreviations), then the league feed's own
  const cup = await (await fetch(`${process.env.YSF_BASE || 'https://ysffantasy.com'}/data/fed_cup_projection.json`)).json().catch(() => null) as any
  const cupAbbr = new Map<string, string>((cup?.teams ?? []).map((t: any) => [t.team, t.abbr]))
  const club = new Map<string, string>((feed.teams as any[]).map(t => [t.ysf_id, byAbbr.get(cupAbbr.get(t.ysf_id) ?? '') ?? byAbbr.get(latin(t.short))!]))
  const want = (feed.matchups as any[]).filter(m => m.home_ysf_id && m.away_ysf_id).map(m => ({
    week: start + m.period - 1, h: club.get(m.home_ysf_id)!, a: club.get(m.away_ysf_id)!, hs: m.home_score ?? 0, as: m.away_score ?? 0, done: m.complete ? 1 : 0, po: m.is_playoff ? 1 : 0,
  }))
  const miss = want.find(m => !m.h || !m.a); if (miss) throw new Error(`a feed club has no match in the app (week ${miss.week})` + JSON.stringify((feed.teams as any[]).map(t => [t.ysf_id, t.short, club.get(t.ysf_id) ?? null])))
  const have = db.prepare(`SELECT id, week, home_team_id h, away_team_id a, home_score hs, away_score as_, is_complete done, is_playoff po FROM matchups WHERE league_id = 'ysf' AND season = ? AND sport = ? ORDER BY week, id`).all(league.season, sport) as any[]
  const weeks = [...new Set([...want.map(m => m.week), ...have.map(m => m.week)])].sort((a, b) => a - b)
  const upd = db.prepare(`UPDATE matchups SET home_team_id = ?, away_team_id = ?, home_score = ?, away_score = ?, is_complete = ?, is_playoff = ? WHERE id = ?`)
  const ins = db.prepare(`INSERT INTO matchups (id, league_id, sport, season, week, home_team_id, away_team_id, home_score, away_score, is_complete, is_playoff) VALUES (?, 'ysf', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const del = db.prepare(`DELETE FROM matchups WHERE id = ?`)
  let changed = 0, added = 0, removed = 0
  const ops: (() => void)[] = []
  for (const w of weeks) {
    const W = want.filter(m => m.week === w), H = have.filter(m => m.week === w)
    // keep a matchup that already has the right pair; give the rest of the week's ids to the remaining pairs
    const key = (h: string, a: string) => [h, a].sort().join('|')
    const free = H.filter(x => !W.some(m => key(m.h, m.a) === key(x.h, x.a ?? '')))
    for (const m of W) {
      const same = H.find(x => key(m.h, m.a) === key(x.h, x.a ?? ''))
      const target = same ?? free.shift()
      if (target) {
        // only the pairing is corrected; a matchup that already has the right clubs keeps the app's own
        // scores (the scoring engine's) — a re-paired one takes the official scores until the engine rescores it
        if (!same) { changed++; console.log(`week ${w}: ${target.h}–${target.a} → ${m.h}–${m.a}`); ops.push(() => upd.run(m.h, m.a, m.hs, m.as, m.done, m.po, target.id)) }
        else if (same.h !== m.h) ops.push(() => db.prepare(`UPDATE matchups SET home_team_id = ?, away_team_id = ?, home_score = away_score, away_score = home_score WHERE id = ?`).run(m.h, m.a, same.id))
      } else { added++; ops.push(() => ins.run(nanoid(), sport, league.season, w, m.h, m.a, m.hs, m.as, m.done, m.po)) }
    }
    for (const x of free) { removed++; ops.push(() => del.run(x.id)) }
  }
  console.log(`${sport}: ${changed} to update, ${added} to add, ${removed} to remove`)
  if (!write) return
  db.transaction(() => ops.forEach(f => f()))()
  // standings from the corrected results
  const { recomputeRecords } = await import('../src/lib/ysf-engine')
  recomputeRecords('ysf', league.season, sport)
  console.log('written; standings recomputed')
}
main().then(() => process.exit(0), e => { console.error(e); process.exit(1) })
