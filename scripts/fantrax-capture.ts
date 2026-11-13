/**
 * Capture each club's current Fantrax lineup (public API, no sign-in) into fantrax_player_periods for
 * the scoring period it applies to — a day in ySFHL/ySFBA/ySFLB, a week in ySFFL — so the engine
 * scores the lineups owners actually set. Run it often on game days (every 15 minutes): a player's
 * slot counts as last captured before his game locks. Never overwrites a period Fantrax has scored.
 *   npx tsx scripts/fantrax-capture.ts
 */
import Database from 'better-sqlite3'
import path from 'path'

const db = new Database(path.join(process.cwd(), 'data', 'nexus.db'))
const LEAGUES = [
  { lid: 'mdn52erdmk5yfqy1', sport: 'NFL', season: '2026-27', feed: 'ysf_fl' },
  { lid: '1n5fh626mo74zpk8', sport: 'NHL', season: '2026-27', feed: 'ysf_hl' },
  { lid: 'so0jdm53mnx7mjpf', sport: 'NBA', season: '2026-27', feed: 'ysf_ba' },
  { lid: 'bu5hr6kymulg8g9i', sport: 'MLB', season: '2026-27', feed: 'ysf_lb' },
]
const STATUS: Record<string, string> = { ACTIVE: '1', RESERVE: '2', INJURED_RESERVE: '3', MINORS: '9' }
const j = async (u: string) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} → ${r.status}`); return r.json() as Promise<any> }
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

async function main() {
  const teamOf = new Map((db.prepare(`SELECT DISTINCT fx_team_id f, team_id t FROM fantrax_player_periods WHERE team_id IS NOT NULL`).all() as any[]).map(r => [r.f, r.t]))
  const ins = db.prepare(`INSERT INTO fantrax_player_periods (season, sport, fx_league_id, period, date, matchup_period, team_id, fx_team_id, fx_player_id, name, pro_team, positions, slot, status, fpts, opp, stats)
    VALUES (@season,@sport,@lid,@period,@date,@mp,@team,@fxteam,@pid,@name,@pro,@pos,@slot,@status,NULL,NULL,NULL)
    ON CONFLICT(fx_league_id, period, fx_team_id, fx_player_id) DO UPDATE SET slot = excluded.slot, status = excluded.status WHERE fantrax_player_periods.fpts IS NULL`)
  const names: Record<string, Record<string, any>> = {}
  const known = new Map((db.prepare(`SELECT fx_player_id f, MAX(name) n FROM fantrax_player_periods GROUP BY fx_player_id`).all() as any[]).map(r => [r.f, r.n]))
  for (const L of LEAGUES) {
    const r = await j(`https://www.fantrax.com/fxea/general/getTeamRosters?leagueId=${L.lid}`)
    const period = Number(r.period)
    const feed = await j(`https://ysffantasy.com/data/league_${L.feed}.json`)
    const periods = Object.entries<any>(feed?.schedule_meta?.periods ?? {}).map(([p, v]) => ({ p: +p, start: v.start, end: v.end }))
    let date: string | null = null, mp: number | null = null
    if (L.sport === 'NFL') mp = period
    else {
      // daily leagues: Fantrax period 1 is the season's first day
      const p1 = (db.prepare(`SELECT date FROM fantrax_player_periods WHERE fx_league_id = ? AND period = 1 LIMIT 1`).get(L.lid) as any)?.date
      if (!p1) { console.log(`${L.sport}: no period-1 date on record yet, skipped`); continue }
      const d = new Date(p1 + 'T12:00:00'); d.setDate(d.getDate() + period - 1); date = iso(d)
      mp = periods.find(x => x.start <= date! && date! <= x.end)?.p ?? null
    }
    names[L.sport] ??= await j(`https://www.fantrax.com/fxea/general/getPlayerIds?sport=${L.sport}`)
    const nm = names[L.sport]
    let n = 0
    db.transaction(() => {
      for (const [fxTeam, t] of Object.entries<any>(r.rosters ?? {})) for (const it0 of t.rosterItems ?? []) {
        // the roster feed lists D/STs by team id ("20080"); the player index and history key them "20080#1090"
        const it = !String(it0.id).includes('#') && nm[`${it0.id}#1090`] ? { ...it0, id: `${it0.id}#1090` } : it0
        const p = nm[it.id] ?? {}
        const name = String(p.name ?? it.id).includes(', ') ? String(p.name).split(', ').reverse().join(' ') : String(p.name ?? it.id)
        ins.run({ season: L.season, sport: L.sport, lid: L.lid, period, date, mp, team: teamOf.get(fxTeam) ?? null, fxteam: fxTeam, pid: it.id,
          name: known.get(it.id) ?? (String(it.id).includes('#') ? `${p.teamName ?? name} D/ST` : name), pro: p.team ?? null, pos: p.position ?? it.position ?? null, slot: it.position ?? null, status: STATUS[it.status] ?? it.status })
        n++
      }
    })()
    console.log(`${L.sport}: period ${period}${date ? ` (${date})` : ''} · matchup period ${mp ?? '—'} · ${n} roster spots captured`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
