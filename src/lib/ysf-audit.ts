// Rule audit for the League Office: every current roster and this season's Fantrax claims checked
// against the rule book in ysf-rules.ts, plus each league's no-trade window and trades under review.
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { RULES, LEAGUE_OF, eligTokens, taxiCheck, hasDesignation, injuriesFresh, inSeason, claimWeek, etMidnightUtc, tradeWindow, taxiRemoved, taxiSlots, irSlots, eligMax, weeklyClaims, rookieDraftAt, type Window } from '@/lib/ysf-rules'

export type Finding = { sport: string; teamId: string; rule: string; source: string; detail: string }
const MON: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 }

// "Name (ySFxx-TEAM, POS/POS)"
export function playerLabel(sport: string, name: string, team: string | null, position: string | null, eligible: string | null) {
  const pos = [...eligTokens(position, eligible)].filter(p => !(sport === 'MLB' && p === 'P' && (position === 'SP' || position === 'RP')) && !/^(UTIL|UT|FLX|SKT|BN|IR|TAXI)$/.test(p))
  return `${name} (${LEAGUE_OF[sport]}${team ? `-${team}` : ''}, ${pos.join('/') || position || '—'})`
}

export async function auditLeague(season0?: string): Promise<{ findings: Finding[]; windows: Window[] }> {
  const season = season0 || (db.all<{ s: string }>(sql`SELECT season s FROM leagues WHERE id = 'ysf'`)[0]?.s ?? '')
  const rows = db.all<any>(sql`SELECT r.team_id t, r.player_id pid, r.sport, r.slot, p.name, p.real_team_abbr team, p.position, p.eligible_positions elig, p.status, p.pro_exp exp
    FROM rosters r JOIN teams tm ON tm.id = r.team_id JOIN players p ON p.id = r.player_id WHERE tm.league_id = 'ysf'`)
  const cfg = JSON.parse(db.all<{ s: string }>(sql`SELECT roster_settings s FROM leagues WHERE id = 'ysf'`)[0]?.s ?? '{}') as Record<string, Record<string, number>>
  const out: Finding[] = []
  const groups = new Map<string, any[]>()
  for (const r of rows) groups.set(`${r.t}|${r.sport}`, [...(groups.get(`${r.t}|${r.sport}`) ?? []), r])
  const fresh = injuriesFresh()
  const season_: Record<string, boolean> = {}
  for (const s of ['NFL', 'NHL', 'NBA', 'MLB']) season_[s] = await inSeason(s)

  for (const [k, list] of groups) {
    const [teamId, sport] = k.split('|')
    const label = (r: any) => playerLabel(sport, r.name, r.team, r.position, r.elig)
    for (const [pos, max] of Object.entries(eligMax(sport))) {
      const n = list.filter(r => eligTokens(r.position, r.elig).has(pos)).length
      if (n > max) out.push({ sport, teamId, rule: `Max ${max} ${pos}-eligible`, source: 'Art. V', detail: `${n} rostered` })
    }
    const taxi = list.filter(r => r.slot === 'TAXI')
    if (taxi.length > taxiSlots(sport)) out.push({ sport, teamId, rule: `Taxi Squad max ${taxiSlots(sport)}`, source: 'Comm. Res. VII', detail: `${taxi.length} on the Taxi Squad` })
    for (const r of taxi) {
      const c = taxiCheck(sport, r.exp); if (!c.ok) out.push({ sport, teamId, rule: 'Taxi Squad eligibility', source: 'Comm. Res. VII', detail: `${label(r)}: ${c.why}` })
      if (taxiRemoved(teamId, r.name, r.pid, sport, season)) out.push({ sport, teamId, rule: 'Placed back on the Taxi Squad', source: 'Comm. Res. VII', detail: `${label(r)} was taken off the Taxi Squad earlier this season` })
      // first went on this club's Taxi Squad after the season's first scoring period (the lock)
      const first = db.all<{ p: number; d: string | null }>(sql`SELECT MIN(period) p, MIN(date) d FROM fantrax_player_periods WHERE season = ${season} AND sport = ${sport} AND team_id = ${teamId} AND name = ${r.name} AND status = '9'`)[0]
      if (first?.p != null && first.p > 1) out.push({ sport, teamId, rule: 'Placed on the Taxi Squad after the lock', source: 'Comm. Res. VII', detail: `${label(r)} went on the Taxi Squad ${first.d ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(first.d + 'T12:00:00Z')) : `in week ${first.p}`}` })
    }
    const ir = list.filter(r => ['IR', 'IL', 'DL'].includes(r.slot))
    if (ir.length > irSlots(sport)) out.push({ sport, teamId, rule: `IR max ${irSlots(sport)}`, source: 'Art. V', detail: `${ir.length} on IR` })
    if (fresh && season_[sport]) for (const r of ir) if (!hasDesignation(r.status)) out.push({ sport, teamId, rule: 'IR needs a designation', source: 'Art. V fn. 5', detail: `${label(r)} is no longer injured` })
    const activeMax = Object.entries(cfg[sport] ?? {}).reduce((a, [s, n]) => a + (['IR', 'IL', 'DL', 'TAXI'].includes(s) ? 0 : n), 0)
    const active = list.filter(r => !['IR', 'IL', 'DL', 'TAXI'].includes(r.slot)).length
    if (activeMax && active > activeMax) out.push({ sport, teamId, rule: `Active roster max ${activeMax}`, source: 'Art. V', detail: `${active} active` })
  }

  // Fed. Res. III: Fantrax claims per Monday–Sunday week (ET), from the Rookie Draft on
  const claims = db.all<any>(sql`SELECT sport, team_id t, date FROM fantrax_transactions WHERE season = ${season} AND code = 'CLAIM' AND result = 'EXECUTED' AND team_id IS NOT NULL AND sport IN ('NBA', 'NHL', 'MLB')`)
  const weeks = new Map<string, number>()
  for (const c of claims) {
    const m = /(\w{3}) (\d+), (\d{4}), (\d+):(\d+)(AM|PM)/.exec(c.date ?? ''); if (!m) continue
    const day = etMidnightUtc(+m[3], MON[m[1]], +m[2])
    const at = new Date(day.getTime() + (((+m[4] % 12) + (m[6] === 'PM' ? 12 : 0)) * 60 + +m[5]) * 60_000)
    if (at < (rookieDraftAt(c.sport) ?? new Date(0))) continue
    const wk = claimWeek(at).start.toISOString()
    weeks.set(`${c.sport}|${c.t}|${wk}`, (weeks.get(`${c.sport}|${c.t}|${wk}`) ?? 0) + 1)
  }
  for (const [k, n] of weeks) {
    const [sport, teamId, wk] = k.split('|')
    if (!weeklyClaims(sport) || n <= weeklyClaims(sport)) continue
    const d = new Date(wk), e = new Date(d.getTime() + 6 * 86_400_000)
    const f = (x: Date, y = false) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', ...(y ? { year: 'numeric' } : {}) }).format(x)
    out.push({ sport, teamId, rule: `Max ${weeklyClaims(sport)} claims per week`, source: 'Fed. Res. III', detail: `${n} claims, ${f(d)}–${f(e, true)}` })
  }

  const windows: Window[] = []
  for (const s of ['NFL', 'NHL', 'NBA', 'MLB']) windows.push(await tradeWindow(s))
  return { findings: out, windows }
}
