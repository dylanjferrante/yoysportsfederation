// The ySF rule book in code: each limit the Constitution & Bylaws and the Commission's resolutions set,
// with its source, plus the checks the roster, waiver and trade routes and the engine call.
//   Art. IV §A    FAAB $250 per league; ties go to the worse record; FAAB may be traded
//   Art. IV §B    no-trade window (deadline → end of playoffs) locks that league's players, picks and FAAB;
//                 48-hour review; bad-faith complaints; Commission veto (unanimous, 36 h); Federation
//                 override (⅔ excl. parties); Federation veto when a Commission club is a party (⅔)
//   Art. V        roster sizes; max 3 QB-eligible (ySFFL), 4 G-eligible (ySFHL), 13 P-eligible (ySFLB)
//   Comm. Res. VII taxi squads FL 3 · HL 4 · BA 3 · LB 5 and who may be on them
//   Comm. Notice II trade-deadline weeks (carried forward until the Commission sets new ones)
//   Fed. Res. III claim limits (BA 3, HL 4 per Mon–Sun week, from the Rookie Draft on); ySFLB SP 10 games per matchup
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { siteFeed } from '@/lib/ysf-data'

export const isYsf = (leagueId?: string | null) => leagueId === 'ysf'
export const LEAGUE_OF: Record<string, string> = { NFL: 'ySFFL', NHL: 'ySFHL', NBA: 'ySFBA', MLB: 'ySFLB' }
const FEED: Record<string, string> = { NFL: 'ysf_fl', NHL: 'ysf_hl', NBA: 'ysf_ba', MLB: 'ysf_lb' }

export const RULES = {
  taxi: { NFL: 3, NHL: 4, NBA: 3, MLB: 5 } as Record<string, number>,
  ir: { NFL: 2, NHL: 3, NBA: 3, MLB: 4 } as Record<string, number>,
  bench: { NFL: 7, NHL: 4, NBA: 5, MLB: 5 } as Record<string, number>,
  eligMax: { NFL: { QB: 3 }, NHL: { G: 4 }, MLB: { P: 13 } } as Record<string, Record<string, number>>,
  weeklyClaims: { NBA: 3, NHL: 4 } as Record<string, number>,
  spGamesPerWeek: 10,
  faab: 250,
  reviewHours: 48,
  vetoHours: 36,
  // Comm. Notice II: the week whose end is the deadline (ySFFL: the Wednesday after it)
  deadlineWeek: { NFL: 11, NHL: 16, NBA: 16, MLB: 17 } as Record<string, number>,
  // Rookie Draft start (claims before it don't count toward Fed. Res. III limits)
  rookieDraft: { NFL: '2026-07-25T16:00:00Z', NHL: '2026-07-25T16:00:00Z', NBA: '2026-07-25T16:00:00Z', MLB: '2026-11-22T17:00:00Z' } as Record<string, string>,
  commission: ['ACF', 'OYSC', 'RMCK'], // Art. II §A: Ferrante, Ogden, Shatunovsky
}

export function ensureRulesSchema() {
  for (const s of [
    `ALTER TABLE players ADD COLUMN pro_exp TEXT`,
    `ALTER TABLE trade_items ADD COLUMN faab_sport TEXT`, `ALTER TABLE trade_items ADD COLUMN faab_amount INTEGER`,
    `ALTER TABLE trades ADD COLUMN complaint_at TEXT`,
  ]) { try { db.run(sql.raw(s)) } catch { /* exists */ } }
  db.run(sql`CREATE TABLE IF NOT EXISTS ysf_trade_votes (trade_id TEXT NOT NULL, team_id TEXT NOT NULL, kind TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL, PRIMARY KEY (trade_id, team_id, kind))`)
}

ensureRulesSchema()

// ── Positions ────────────────────────────────────────────────────────────────
// "players with QB / G / P eligibility": any listed position counts, not just the primary one
export function eligTokens(position: string | null, eligible: string | string[] | null): Set<string> {
  const list = [position ?? '', ...(Array.isArray(eligible) ? eligible : (() => { try { return JSON.parse(eligible ?? '[]') } catch { return String(eligible ?? '').split(/[,/]/) } })())]
  const out = new Set<string>()
  for (const p of list) for (const t of String(p).split(/[,/]/)) { const x = t.trim().toUpperCase(); if (!x) continue; out.add(x); if (x === 'SP' || x === 'RP') out.add('P') }
  return out
}
export function eligCapError(sport: string, roster: { position: string | null; eligible: any }[]): string | null {
  for (const [pos, max] of Object.entries(RULES.eligMax[sport] ?? {})) {
    const n = roster.filter(p => eligTokens(p.position, p.eligible).has(pos)).length
    if (n > max) return `${LEAGUE_OF[sport]} allows at most ${max} ${pos}-eligible players on a roster (Art. V) — this would make ${n}`
  }
  return null
}

// ── Taxi squad eligibility (Comm. Res. VII) ─────────────────────────────────
export type TaxiCheck = { ok: boolean; why: string }
export function taxiCheck(sport: string, proExp: string | null): TaxiCheck {
  let e: any = null; try { e = JSON.parse(proExp ?? 'null') } catch { /* none */ }
  if (sport === 'NFL' || sport === 'NBA') {
    if (e?.years == null) return { ok: false, why: `no ${sport} experience on record — the Commission must confirm` }
    return e.years < 1 ? { ok: true, why: `${sport} rookie` } : { ok: false, why: `${e.years} year${e.years === 1 ? '' : 's'} of ${sport} experience (taxi needs under 1)` }
  }
  if (sport === 'NHL') {
    const gp = e?.gp ?? 0
    return gp <= 84 ? { ok: true, why: `${gp} NHL games` } : { ok: false, why: `${gp} NHL games (taxi allows 84 or fewer)` }
  }
  if (sport === 'MLB') {
    if (!e?.debut) return { ok: true, why: 'no MLB service time' }
    return e.maxDays < 172 ? { ok: true, why: `at most ${e.maxDays} MLB service days` }
      : { ok: false, why: `debuted ${e.debut}; up to ${e.maxDays} service days possible — the Commission must confirm under 1 year` }
  }
  return { ok: true, why: '' }
}

// ── Claim weeks (Fed. Res. III): Monday 12:00am ET → Sunday 11:59pm ET ───────
const etParts = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(p => [p.type, p.value]))
export function etMidnightUtc(y: number, m: number, d: number): Date {
  for (const off of [4, 5]) { const t = new Date(Date.UTC(y, m - 1, d, off)); if (etParts(t).hour === '00') return t }
  return new Date(Date.UTC(y, m - 1, d, 5))
}
export function claimWeek(now = new Date()): { start: Date; end: Date } {
  const p = etParts(now)
  const back = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday)
  const day = new Date(Date.UTC(+p.year, +p.month - 1, +p.day - back))
  const start = etMidnightUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate())
  const nx = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 7))
  return { start, end: etMidnightUtc(nx.getUTCFullYear(), nx.getUTCMonth() + 1, nx.getUTCDate()) }
}
// claims (free-agent adds + waiver wins) a club has made this week in a league, from the app's log
export function claimsUsed(leagueId: string, teamId: string, sport: string, now = new Date()): number {
  const { start } = claimWeek(now)
  const from = new Date(Math.max(start.getTime(), Date.parse(RULES.rookieDraft[sport] ?? '1970-01-01')))
  const rows = db.all<{ message: string; created_at: string }>(sql`SELECT message, created_at FROM activity WHERE league_id = ${leagueId} AND team_id = ${teamId} AND type IN ('ROSTER', 'WAIVER')`)
  return rows.filter(r => {
    const t = Date.parse(r.created_at.includes('T') ? r.created_at : r.created_at.replace(' ', 'T') + 'Z')
    return t >= from.getTime() && r.message.includes(`(${sport})`) && /\b(added|claimed)\b/.test(r.message)
  }).length
}
export function claimLimitError(leagueId: string, teamId: string, sport: string, now = new Date()): string | null {
  const max = RULES.weeklyClaims[sport]
  if (!max) return null
  const used = claimsUsed(leagueId, teamId, sport, now)
  return used >= max ? `${LEAGUE_OF[sport]} allows ${max} player claims per week (Fed. Res. III) — you've made ${used} since Monday` : null
}

// ── No-trade windows (Art. IV §B(2), Comm. Notice II) ────────────────────────
export type Window = { sport: string; deadline: Date | null; reopens: Date | null; locked: boolean }
const endOfEtDay = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); const n = new Date(Date.UTC(y, m - 1, d + 1)); return new Date(etMidnightUtc(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate()).getTime() - 60_000) }
const addDays = (ymd: string, n: number) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }
export async function tradeWindow(sport: string, now = new Date()): Promise<Window> {
  const feed = await siteFeed<any>(`league_${FEED[sport]}.json`)
  const ps = Object.entries<any>(feed?.schedule_meta?.periods ?? {}).map(([k, v]) => ({ n: +k, ...v })).sort((a, b) => a.n - b.n)
  const wk = ps.find(p => p.n === RULES.deadlineWeek[sport])
  if (!wk?.end) return { sport, deadline: null, reopens: null, locked: false }
  let dl = wk.end as string
  if (sport === 'NFL') { while (new Date(dl + 'T12:00:00Z').getUTCDay() !== 3) dl = addDays(dl, 1) } // the Wednesday following
  const regular = ps.filter(p => !p.is_playoff && p.end)
  const playoffs = ps.filter(p => p.is_playoff)
  const lastPo = playoffs.map(p => p.end).filter(Boolean).sort().pop() ?? (regular.length ? addDays(regular[regular.length - 1].end, 7 * playoffs.length) : null)
  const deadline = endOfEtDay(dl), reopens = lastPo ? endOfEtDay(lastPo) : null
  return { sport, deadline, reopens, locked: now > deadline && (!reopens || now <= reopens) }
}
export async function lockedSports(sports: Iterable<string>, now = new Date()): Promise<string[]> {
  const out: string[] = []
  for (const s of new Set(sports)) if ((await tradeWindow(s, now)).locked) out.push(s)
  return out
}

// ── Trade review (Art. IV §B(4)–(6), Comm. Notice IV) ────────────────────────
export function commissionTeamIds(): string[] {
  return db.all<{ id: string }>(sql`SELECT id FROM teams WHERE league_id = 'ysf' AND abbreviation IN (${sql.join(RULES.commission.map(a => sql`${a}`), sql`, `)})`).map(r => r.id)
}
export type ReviewState = {
  reviewEnds: string | null; complaintAt: string | null; vetoEnds: string | null
  commissionParty: boolean; voters: string[]; needed: number
  vetoes: string[]; overrides: string[]; outcome: 'REVIEW' | 'VETOED' | 'CLEARED'
}
// Who decides and how many votes it takes, given the trade's parties and the votes cast so far
export function reviewState(trade: { id: string; reviewDeadline?: string | null; review_deadline?: string | null; complaint_at?: string | null; complaintAt?: string | null }, parties: string[], now = new Date()): ReviewState {
  ensureRulesSchema()
  const all = db.all<{ id: string }>(sql`SELECT id FROM teams WHERE league_id = 'ysf'`).map(r => r.id)
  const comm = commissionTeamIds()
  const commissionParty = parties.some(p => comm.includes(p))
  const nonParties = all.filter(t => !parties.includes(t))
  // Commission clubs not in the deal decide unanimously; with a Commission club in the deal, ⅔ of the other clubs
  const voters = commissionParty ? nonParties : comm.filter(t => !parties.includes(t))
  const needed = commissionParty ? Math.ceil(nonParties.length * 2 / 3) : voters.length
  const votes = db.all<{ team_id: string; kind: string }>(sql`SELECT team_id, kind FROM ysf_trade_votes WHERE trade_id = ${trade.id}`)
  const vetoes = votes.filter(v => v.kind === 'VETO' && voters.includes(v.team_id)).map(v => v.team_id)
  const overrides = votes.filter(v => v.kind === 'OVERRIDE' && nonParties.includes(v.team_id)).map(v => v.team_id)
  const reviewEnds = trade.reviewDeadline ?? trade.review_deadline ?? null
  const complaintAt = (db.all<{ c: string | null }>(sql`SELECT complaint_at c FROM trades WHERE id = ${trade.id}`)[0]?.c) ?? null
  const vetoEnds = complaintAt ? new Date(Date.parse(complaintAt) + RULES.vetoHours * 3_600_000).toISOString() : null
  const vetoed = vetoes.length >= needed && needed > 0
  const overridden = vetoed && !commissionParty && overrides.length >= Math.ceil(nonParties.length * 2 / 3)
  const pastReview = !!reviewEnds && now.getTime() >= Date.parse(reviewEnds)
  const pastVeto = !vetoEnds || now.getTime() >= Date.parse(vetoEnds)
  const outcome = vetoed && !overridden ? 'VETOED' : pastReview && (pastVeto || vetoed) ? 'CLEARED' : 'REVIEW'
  return { reviewEnds, complaintAt, vetoEnds, commissionParty, voters, needed, vetoes, overrides, outcome }
}

// ── Injured reserve (Constitution fn. 5) ─────────────────────────────────────
// IR needs an official injury or suspension designation; once it's lifted the player must come off IR
// before the club can make other roster moves. Enforced only in season and on injury data under 36 h old.
export const hasDesignation = (status?: string | null) => !!status && !/^(active|healthy)$/i.test(status.trim())
export function injuriesFresh(now = new Date()): boolean {
  try { const v = db.all<{ value: string }>(sql`SELECT value FROM app_settings WHERE key = 'injuries_synced_at'`)[0]?.value; return !!v && now.getTime() - Date.parse(v) < 36 * 3_600_000 } catch { return false }
}
export async function inSeason(sport: string, now = new Date()): Promise<boolean> {
  const feed = await siteFeed<any>(`league_${FEED[sport]}.json`)
  const ps = Object.values<any>(feed?.schedule_meta?.periods ?? {}).filter(p => p.start && p.end)
  if (!ps.length) return false
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now)
  return ps.some(p => p.start <= today) && ps.some(p => p.end >= today)
}
export async function irLockError(teamId: string, sport: string, exceptRosterId?: string): Promise<string | null> {
  if (!injuriesFresh() || !(await inSeason(sport))) return null
  const bad = db.all<{ rid: string; name: string }>(sql`SELECT r.id rid, p.name FROM rosters r JOIN players p ON p.id = r.player_id
    WHERE r.team_id = ${teamId} AND r.sport = ${sport} AND r.slot IN ('IR', 'IL', 'DL') AND (p.status IS NULL OR lower(trim(p.status)) IN ('active', 'healthy'))`)
    .filter(r => r.rid !== exceptRosterId)
  return bad.length ? `${bad.map(b => b.name).join(', ')} ${bad.length > 1 ? 'are' : 'is'} no longer injured — move ${bad.length > 1 ? 'them' : 'him'} off IR before making other roster moves (Constitution, Art. V fn. 5)` : null
}

// ── Starting-pitcher games (Fed. Res. III) ───────────────────────────────────
export const spCap = (startYmd: string, endYmd: string) => Math.round(RULES.spGamesPerWeek * ((Date.parse(endYmd) - Date.parse(startYmd)) / 86_400_000 + 1) / 7)
