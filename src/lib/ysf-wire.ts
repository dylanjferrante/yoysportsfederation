// The ySF News wire desk: full stories written straight from the league's data — no API key needed.
// Each story is a set of facts turned into newspaper paragraphs (who leads, by how much, who scored
// what, what changed). When ANTHROPIC_API_KEY is set, ysf-news.ts hands the same assignments to the
// staff writers instead; this desk is what runs otherwise.
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { YSF_LEAGUES } from '@/lib/ysf'
import type { ClubInfo, CupRow, LeagueRow, MoveRow, TradeRow, Pairing } from '@/lib/ysf-data'
import type { ModelOut } from '@/lib/ysf-model'

export type Story = { slot: string; kind: string; sport: string | null; writer: string; headline: string; dek: string; body: string[]; clubs: string[] }
export type Desk = {
  day: string; dayName: string; season: string
  clubs: Record<string, ClubInfo>; cup: CupRow[]; tables: Record<string, LeagueRow[]>; live: string[]
  pairings: Pairing[]; moves: MoveRow[]; trades: TradeRow[]; model: ModelOut | null
  perf: { sport: string; name: string; team: string | null; pos: string; pts: number; clubId: string; date: string | null }[]
}

const code = (sp: string) => YSF_LEAGUES.find(l => l.sport === sp)?.code ?? sp
const n1 = (x: number) => x.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const n0 = (x: number) => Math.round(x).toLocaleString('en-US')
const pct = (x: number) => x >= 0.995 ? 'all but certain' : x < 0.005 ? 'under 1%' : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`
const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const say = (n: number) => words[n] ?? String(n)
// pick a phrasing that changes from day to day but stays the same for a given story on a given day
const pick = <T,>(seed: string, xs: T[]) => xs[[...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % xs.length]
const player = (p: { sport: string; name: string; team: string | null; pos: string }) => `${p.name} (${code(p.sport)}-${p.team || 'FA'}, ${p.pos.replace(/,/g, '/').replace(/\bDEF\b/g, 'D/ST')})`
const last = (name: string) => name.split(' ').slice(-1)[0]

function scoreOf(d: Desk, clubId: string, sport: string) {
  for (const p of d.pairings) {
    const l = p.lines.find(x => x.sport === sport)
    if (!l || (p.a !== clubId && p.b !== clubId)) continue
    const mine = p.a === clubId ? l.a : l.b, theirs = p.a === clubId ? l.b : l.a
    return { opp: p.a === clubId ? p.b : p.a, mine: mine ?? 0, theirs: theirs ?? 0, status: l.status, label: l.label, matchupId: l.matchupId }
  }
  return null
}

// ── the daily wrap ──────────────────────────────────────────────────────────
function dailyWrap(d: Desk): Story | null {
  const C = d.clubs
  const avg = (sp: string) => { const xs = d.perf.filter(p => p.sport === sp).map(p => p.pts); return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length) }
  const top = [...d.perf].sort((a, b) => b.pts / avg(b.sport) - a.pts / avg(a.sport)).slice(0, 6)
  if (!top.length) return null
  const playedOn = top[0].date ? new Date(top[0].date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) : null
  const t = top[0], club = C[t.clubId], sc = scoreOf(d, t.clubId, t.sport), opp = sc ? C[sc.opp] : null
  const lead = sc ? sc.mine - sc.theirs : 0
  const headline = sc
    ? lead > 0 ? `${last(t.name)}'s ${n1(t.pts)} puts ${club.abbreviation} up on ${opp?.abbreviation} in ${code(t.sport)}` : `${last(t.name)} posts ${n1(t.pts)}, but ${club.abbreviation} still trails ${opp?.abbreviation}`
    : `${last(t.name)} leads the Federation with ${n1(t.pts)} points`
  const body: string[] = []
  body.push(`${player(t)} put up ${n1(t.pts)} fantasy points${playedOn ? ` on ${playedOn}` : ' in the ySFFL week just ended'}, the standout line in the Federation, for ${club.name}.` +
    (sc ? ` ${club.abbreviation} ${lead > 0 ? `leads ${opp?.name} ${n1(sc.mine)}–${n1(sc.theirs)}` : lead < 0 ? `trails ${opp?.name} ${n1(sc.mine)}–${n1(sc.theirs)}` : `is level with ${opp?.name} at ${n1(sc.mine)}`} in ${code(t.sport)} ${sc.label}.` : ''))
  const rest = top.slice(1, 4)
  if (rest.length) body.push(`${pick(d.day + 'r', ['Close behind:', 'Also worth noting:', 'The rest of the leaderboard:'])} ${rest.map(p => `${player(p)} with ${n1(p.pts)} for ${C[p.clubId]?.abbreviation}`).join('; ')}.`)
  // the tightest and widest matchups still being played
  const lines = d.pairings.flatMap(p => p.lines.filter(l => l.status === 'LIVE' && l.a != null && l.b != null).map(l => ({ p, l, gap: Math.abs((l.a ?? 0) - (l.b ?? 0)), rel: Math.abs((l.a ?? 0) - (l.b ?? 0)) / Math.max(1, (l.a ?? 0) + (l.b ?? 0)) })))
  const tight = [...lines].sort((a, b) => a.rel - b.rel)[0]
  if (tight) {
    const [hi, lo] = (tight.l.a ?? 0) >= (tight.l.b ?? 0) ? [tight.p.a, tight.p.b] : [tight.p.b, tight.p.a]
    const wp = d.model?.leagues[tight.l.sport]?.matchups[tight.l.matchupId]
    body.push(`The closest race of the week is in ${code(tight.l.sport)}, where ${C[hi]?.name} leads ${C[lo]?.name} by ${n1(tight.gap)} (${n1(Math.max(tight.l.a ?? 0, tight.l.b ?? 0))}–${n1(Math.min(tight.l.a ?? 0, tight.l.b ?? 0))}).` +
      (wp ? ` The ySF model makes it ${pct(tight.p.a === hi ? wp.homeWin : 1 - wp.homeWin)} for ${C[hi]?.abbreviation} to hold on.` : ''))
  }
  for (const sp of d.live) {
    const t1 = d.tables[sp]?.[0], t2 = d.tables[sp]?.[1]
    if (t1 && t2) body.push(`${code(sp)}: ${C[t1.teamId]?.name} ${t1.l === 0 && t1.w > 2 ? `is still perfect at ${t1.rec}` : `leads at ${t1.rec}`}, ${t2.gb ? `${t2.gb} game${t2.gb === 1 ? '' : 's'} clear of ${C[t2.teamId]?.abbreviation}` : `level with ${C[t2.teamId]?.abbreviation} on record`}.`)
  }
  return { slot: `daily:${d.day}`, kind: 'daily', sport: null, writer: 'hank', headline, dek: `${playedOn ?? 'The weekend'}'s best performances and where every race stands this ${d.dayName} morning.`, body, clubs: [club.abbreviation, opp?.abbreviation].filter(Boolean) as string[] }
}

// ── a league notebook ───────────────────────────────────────────────────────
function notebook(d: Desk, sp: string): Story | null {
  const C = d.clubs, tbl = d.tables[sp]
  if (!tbl?.length) return null
  const L = code(sp), [a, b] = tbl, bottom = tbl[tbl.length - 1]
  const odds = d.model?.leagues[sp]?.clubs
  const fav = odds ? Object.entries(odds).sort((x, y) => y[1].title - x[1].title)[0] : null
  const lines = d.pairings.flatMap(p => p.lines.filter(l => l.sport === sp).map(l => ({ p, l })))
  const perf = d.perf.filter(p => p.sport === sp).slice(0, 3)
  const unbeaten = tbl.filter(r => r.l === 0 && r.w > 0), winless = tbl.filter(r => r.w === 0 && r.l > 0)
  // the day's angle: the leader, the best performance, or the closest race — whichever the day picks
  // among those the data supports — so the notebook reads differently from one morning to the next
  const close = lines.filter(x => x.l.a != null && x.l.b != null && x.l.status !== 'UPCOMING')
    .map(x => ({ ...x, gap: Math.abs((x.l.a ?? 0) - (x.l.b ?? 0)) })).sort((x, y) => x.gap - y.gap)[0]
  const angles = ['leader', ...(perf.length ? ['performer'] : []), ...(close ? ['close'] : [])]
  const angle = pick(d.day + sp + 'angle', angles)
  const A = C[a.teamId]?.abbreviation
  let headline = '', feature = a.teamId
  if (angle === 'performer') {
    const p0 = perf[0]; feature = p0.clubId
    headline = pick(d.day + sp + 'h', [`${last(p0.name)}'s ${n1(p0.pts)} leads the way in ${L}`, `${last(p0.name)} drops ${n1(p0.pts)} for ${C[p0.clubId]?.abbreviation}`, `${C[p0.clubId]?.abbreviation} gets ${n1(p0.pts)} from ${last(p0.name)}`])
  } else if (angle === 'close' && close) {
    const [hi, lo] = (close.l.a ?? 0) >= (close.l.b ?? 0) ? [close.p.a, close.p.b] : [close.p.b, close.p.a]; feature = hi
    const rel = close.gap / Math.max(1, ((close.l.a ?? 0) + (close.l.b ?? 0)) / 2), fin = close.l.status === 'FINAL'
    headline = close.gap < 0.05 ? `${C[hi]?.abbreviation} and ${C[lo]?.abbreviation} dead even in ${L} ${close.l.label}`
      : `${C[hi]?.abbreviation} ${fin ? (rel < 0.03 ? 'edges' : 'beats') : rel < 0.03 ? 'clings to lead over' : 'leads'} ${C[lo]?.abbreviation}${fin ? '' : ` by ${n1(close.gap)}`} in ${L}${fin ? `, ${n1(Math.max(close.l.a ?? 0, close.l.b ?? 0))}–${n1(Math.min(close.l.a ?? 0, close.l.b ?? 0))}` : ''}`
  } else {
    headline = unbeaten.length === 1 ? pick(d.day + sp, [`${A} stays perfect at ${a.rec}`, `${A} improves to ${a.rec} atop ${L}`, `Nobody has solved ${A} at ${a.rec}`])
      : a.gb === 0 && b && b.gb === 0 ? `${A} and ${C[b.teamId]?.abbreviation} tied atop ${L} at ${a.rec}` : `${A} leads ${L} by ${b?.gb ?? 0} at ${a.rec}`
  }
  const body: string[] = []
  body.push(`${C[a.teamId]?.name} ${unbeaten.length === 1 ? `is the last unbeaten club in ${L} at ${a.rec}` : `tops ${L} at ${a.rec}`}, with ${n1(a.pf)} points for` + (b ? `; ${C[b.teamId]?.name} is ${b.gb ? `${b.gb} game${b.gb === 1 ? '' : 's'} back at ${b.rec}` : `level on record at ${b.rec}, behind only on points (${n1(b.pf)})`}.` : '.'))
  const live = lines.filter(x => x.l.a != null && x.l.b != null)
  if (live.length) {
    const label = live[0].l.label
    body.push(`${label}${live[0].l.status === 'FINAL' ? ' ended' : ' so far'}: ` + live.map(({ p, l }) => {
      const [hi, lo, hs, ls] = (l.a ?? 0) >= (l.b ?? 0) ? [p.a, p.b, l.a ?? 0, l.b ?? 0] : [p.b, p.a, l.b ?? 0, l.a ?? 0]
      return `${C[hi]?.abbreviation} ${n1(hs)}, ${C[lo]?.abbreviation} ${n1(ls)}`
    }).join('; ') + '.')
  }
  if (perf.length) body.push(`${pick(d.day + sp + 'p', ['Top performers:', 'The best lines:', 'Who delivered:'])} ${perf.map(p => `${player(p)}, ${n1(p.pts)} for ${C[p.clubId]?.abbreviation}`).join('; ')}.`)
  if (fav) body.push(`The ySF model makes ${C[fav[0]]?.name} the title favorite at ${pct(fav[1].title)}` + (odds ? `, and gives ${say(Object.values(odds).filter(c => c.playoff >= 0.9).length)} clubs a 90% or better chance at the playoffs.` : '.'))
  if (winless.length) body.push(`Still looking for a first win: ${winless.map(r => C[r.teamId]?.name).join(', ')}.`)
  else body.push(`At the bottom, ${C[bottom.teamId]?.name} sits ${ord(bottom.rk)} at ${bottom.rec}.`)
  return { slot: `nb:${sp}:${d.day}`, kind: 'notebook', sport: sp, writer: 'hank', headline, dek: `${L} notebook: the table, this week's scores and the best performances.`, body, clubs: [...new Set([C[feature]?.abbreviation, C[a.teamId]?.abbreviation, b ? C[b.teamId]?.abbreviation : ''])].filter(Boolean) as string[] }
}

// ── the Cup race ────────────────────────────────────────────────────────────
function cupUpdate(d: Desk): Story | null {
  const C = d.clubs, m = d.model
  if (!d.cup.length) return null
  const [a, b, c] = d.cup
  const odds = m ? Object.entries(m.cup).sort((x, y) => y[1].win - x[1].win) : []
  const fav = odds[0], second = odds[1]
  const headline = fav ? `${C[fav[0]]?.abbreviation} ${pct(fav[1].win)} to win the Cup` : `${C[a.teamId]?.abbreviation} leads the Cup race`
  const body: string[] = []
  body.push(`${C[a.teamId]?.name} leads the Federation Cup with ${a.pts} points from ${say(Object.values(a.ranks).filter(x => x != null).length)} leagues, ${a.pts - b.pts} ahead of ${C[b.teamId]?.name}${c ? ` and ${a.pts - c.pts} ahead of ${C[c.teamId]?.name}` : ''}.`)
  if (fav && m) {
    body.push(`Ten thousand simulated seasons give ${C[fav[0]]?.name} a ${pct(fav[1].win)} chance at the Cup, with ${n1(fav[1].exp)} projected points (give or take ${n1(fav[1].sd)}).` +
      (second ? ` ${C[second[0]]?.name} is next at ${pct(second[1].win)}.` : ''))
    const gap = d.cup.map(r => ({ r, mc: m.cup[r.teamId] })).filter(x => x.mc).sort((x, y) => (y.mc.exp - y.r.pts) - (x.mc.exp - x.r.pts))[0]
    if (gap) body.push(`The model likes ${C[gap.r.teamId]?.name} most for the rest of the way: ${gap.r.pts} points now, ${n1(gap.mc.exp)} projected — ${n1(gap.mc.exp - gap.r.pts)} still to come, the most of any club.`)
  }
  body.push(`The table: ${d.cup.slice(0, 6).map(r => `${ord(r.rk)} ${C[r.teamId]?.abbreviation} ${r.pts}`).join(', ')}.`)
  const pending = YSF_LEAGUES.filter(l => !d.live.includes(l.sport)).map(l => l.code)
  if (pending.length) body.push(`${pending.join(' and ')} ${pending.length > 1 ? 'have' : 'has'} not started, and ${pending.length > 1 ? 'are' : 'is'} worth up to 12 more points per club.`)
  return { slot: `cup:${d.day}`, kind: 'analysis', sport: 'CUP', writer: 'june', headline, dek: `Where the Federation Cup stands, and what the model expects from here.`, body, clubs: [a, b].map(r => C[r.teamId]?.abbreviation).filter(Boolean) as string[] }
}

// ── the transactions wire ───────────────────────────────────────────────────
function movesWire(d: Desk): Story | null {
  const C = d.clubs, mv = d.moves.filter(m => m.player && ['CLAIMED', 'SIGNED', 'DROPPED', 'RELEASED'].includes(m.kind))
  if (mv.length < 2) return null
  const claims = mv.filter(m => m.kind === 'CLAIMED' || m.kind === 'SIGNED'), drops = mv.filter(m => m.kind === 'DROPPED' || m.kind === 'RELEASED')
  const big = [...claims].sort((a, b) => (b.bid ?? 0) - (a.bid ?? 0))[0]
  const busiest = Object.entries(mv.reduce((a, m) => ({ ...a, [m.teamId]: (a[m.teamId] ?? 0) + 1 }), {} as Record<string, number>)).sort((a, b) => b[1] - a[1])[0]
  const p = (m: MoveRow) => `${m.player} (${code(m.sport)}-${m.team || 'FA'}, ${m.pos})`
  const body: string[] = []
  body.push(`${say(claims.length)[0].toUpperCase() + say(claims.length).slice(1)} player${claims.length === 1 ? '' : 's'} joined new clubs and ${say(drops.length)} ${drops.length === 1 ? 'was' : 'were'} let go in the last day.` +
    (big?.bid ? ` The biggest bid: ${C[big.teamId]?.name} paid $${big.bid} for ${p(big)}.` : ''))
  if (busiest && busiest[1] > 1) body.push(`${C[busiest[0]]?.name} was the busiest club, with ${say(busiest[1])} moves.`)
  for (const sp of YSF_LEAGUES.map(l => l.sport)) {
    const m = mv.filter(x => x.sport === sp)
    if (m.length) body.push(`${code(sp)}: ${m.slice(0, 6).map(x => `${C[x.teamId]?.abbreviation} ${x.kind === 'CLAIMED' ? `claimed ${p(x)}${x.bid ? ` ($${x.bid})` : ''}` : x.kind === 'SIGNED' ? `signed ${p(x)}` : `released ${p(x)}`}`).join('; ')}.`)
  }
  return { slot: `moves:${d.day}`, kind: 'report', sport: 'MOVES', writer: 'hank', headline: big?.bid ? `${C[big.teamId]?.abbreviation} pays $${big.bid} for ${last(big.player)}` : `${C[busiest[0]]?.abbreviation} works the wire`, dek: 'Claims, signings and releases across the Federation.', body, clubs: [big ? C[big.teamId]?.abbreviation : '', C[busiest[0]]?.abbreviation].filter(Boolean) as string[] }
}

// ── a trade ─────────────────────────────────────────────────────────────────
function tradeStory(d: Desk, t: TradeRow): Story {
  const C = d.clubs, sides = t.sides.filter(s => C[s.teamId])
  const names = sides.map(s => C[s.teamId].name)
  const star = sides.flatMap(s => s.gets.filter(g => g.name).map(g => ({ g, to: s.teamId })))[0]
  const body = [`${names.join(' and ')} have completed a trade.`, ...sides.map(s => `${C[s.teamId].name} gets ${s.gets.map(g => g.name ? `${g.name} (${code(g.sport)}-${g.team || 'FA'}, ${g.pos})` : '').filter(Boolean).join(', ') || 'future considerations'}.`)]
  for (const s of sides) {
    const ranks = d.cup.find(r => r.teamId === s.teamId)
    if (ranks) body.push(`${C[s.teamId].abbreviation} is ${ord(ranks.rk)} in the Cup race with ${ranks.pts} points.`)
  }
  return { slot: `trade:${t.id}`, kind: 'trade', sport: 'MOVES', writer: 'hank', headline: star ? `${C[star.to].abbreviation} lands ${star.g.name} in trade with ${C[sides.find(s => s.teamId !== star.to)?.teamId ?? '']?.abbreviation ?? 'a rival'}` : `${sides.map(s => C[s.teamId].abbreviation).join(', ')} make a deal`, dek: `Who got what in the deal between ${names.join(' and ')}.`, body, clubs: sides.map(s => C[s.teamId].abbreviation) }
}

// tidy: no doubled periods after names that end in one ("Mitchel B.J.C..")
const tidy = (t: string) => t.replace(/\.\.(?=\s|$)/g, '.').replace(/\.\.\s*\(/g, '. (')
export function deskStories(d: Desk): Story[] {
  // the rhythm of the week: the daily wrap and moves every day; ySFFL's notebook after its games
  // (Tuesday) and before the weekend (Friday); the daily leagues' notebooks every day; the Cup race
  // Monday and Thursday; a story for every trade
  const dow = new Date(d.day + 'T12:00:00Z').getUTCDay()
  const out: (Story | null)[] = [dailyWrap(d), dow === 1 || dow === 4 ? cupUpdate(d) : null,
    ...d.live.filter(sp => sp !== 'NFL' || dow === 2 || dow === 5).map(sp => notebook(d, sp)), movesWire(d)]
  for (const t of d.trades) out.push(tradeStory(d, t))
  return out.filter((s): s is Story => !!s).map(s => ({ ...s, headline: tidy(s.headline), dek: tidy(s.dek), body: s.body.map(tidy) }))
}

// yesterday's best fantasy performances (daily leagues) and the latest ySFFL week, with clubs
export function topPerformances(season: string, yesterday: string, nflPeriod: number | null = null) {
  return db.all<{ sport: string; name: string; team: string | null; pos: string; pts: number; clubId: string; date: string | null }>(sql`
    SELECT * FROM (SELECT sport, name, pro_team team, COALESCE(positions, '') pos, COALESCE(engine_pts, fpts) pts, team_id clubId, NULLIF(date, '') date,
      ROW_NUMBER() OVER (PARTITION BY sport ORDER BY COALESCE(engine_pts, fpts) DESC) n FROM fantrax_player_periods
      WHERE season = ${season} AND status = '1' AND ((date = ${yesterday}) OR (sport = 'NFL' AND matchup_period = COALESCE(${nflPeriod}, (SELECT MAX(matchup_period) FROM fantrax_player_periods WHERE season = ${season} AND sport = 'NFL' AND engine_pts IS NOT NULL)))))
    WHERE n <= 8 ORDER BY pts DESC`).filter(p => p.pts > 0)
}

// ── the desk as of any morning (for today, and for writing back issues) ─────
import { weekDateRange } from '@/lib/defaults'
import { safeParse } from '@/lib/utils'
import { YSF_LEAGUE_ID } from '@/lib/ysf'
import { loadClubs, loadMoves } from '@/lib/ysf-data'
import { loadModel } from '@/lib/ysf-model'

const isoDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d)
const addDay = (day: string, n: number) => { const t = new Date(day + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
// a week's first and last day for a league (ySFFL runs Tuesday–Monday)
function span(season: string, sport: string, w: number) {
  const r = weekDateRange(season, w), shift = sport === 'NFL' ? 1 : 0
  const s = new Date(r.start.getFullYear(), r.start.getMonth(), r.start.getDate() + shift), e = new Date(r.end.getFullYear(), r.end.getMonth(), r.end.getDate() + shift)
  const f = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  return { start: f(s), end: f(e) }
}

export async function buildDesk(league: any, day: string, live = false): Promise<Desk> {
  const season = league.season
  const clubs = await loadClubs(league.id)
  const ids = Object.keys(clubs)
  const sched = safeParse<{ sport: string; startWeek: number }[]>(league.sportSchedule, [])
  const ms = db.all<{ id: string; sport: string; week: number; h: string; a: string | null; hs: number | null; as_: number | null; po: number }>(sql`
    SELECT id, sport, week, home_team_id h, away_team_id a, home_score hs, away_score as_, is_playoff po FROM matchups WHERE league_id = ${YSF_LEAGUE_ID} AND season = ${season} AND away_team_id IS NOT NULL`)
  const tables: Record<string, LeagueRow[]> = {}, liveSports: string[] = []
  const pairs = new Map<string, Pairing>()
  for (const L of YSF_LEAGUES) {
    const sm = ms.filter(m => m.sport === L.sport && !m.po)
    const done = sm.filter(m => span(season, L.sport, m.week).end < day)
    const rec = new Map(ids.map(t => [t, { w: 0, l: 0, pf: 0 }]))
    for (const m of done) {
      const h = rec.get(m.h), a = rec.get(m.a!); if (!h || !a) continue
      h.pf += m.hs ?? 0; a.pf += m.as_ ?? 0
      if ((m.hs ?? 0) > (m.as_ ?? 0)) { h.w++; a.l++ } else if ((m.as_ ?? 0) > (m.hs ?? 0)) { a.w++; h.l++ }
    }
    if (done.length) liveSports.push(L.sport)
    const ranked = [...rec.entries()].sort((x, y) => (y[1].w - x[1].w) || (y[1].pf - x[1].pf))
    const lead = ranked[0]?.[1]
    tables[L.sport] = ranked.map(([t, r], i) => ({ teamId: t, rk: i + 1, rec: `${r.w}-${r.l}`, w: r.w, l: r.l, gb: lead ? ((lead.w - r.w) + (r.l - lead.l)) / 2 : 0, pf: r.pf, faab: 0, fed: done.length ? ids.length - i : 0, po: 0, title: 0 }))
    // this week's matchups as they stood that morning: finished weeks final; daily leagues from the
    // lineup history up to the day before; ySFFL once its week is over
    const start = sched.find(s => s.sport === L.sport)?.startWeek ?? 1
    for (const m of sm) {
      const sp = span(season, L.sport, m.week)
      if (!(sp.start <= day && day <= addDay(sp.end, 1))) continue
      const final = sp.end < day
      let hs = m.hs ?? 0, as = m.as_ ?? 0
      if (!final && !live) {
        const part = (tid: string) => db.all<{ p: number | null }>(sql`SELECT SUM(COALESCE(engine_pts, fpts, 0)) p FROM fantrax_player_periods WHERE season = ${season} AND sport = ${L.sport} AND team_id = ${tid} AND matchup_period = ${m.week - start + 1} AND status = '1' AND date < ${day} AND date != ''`)[0]?.p ?? 0
        if (L.sport === 'NFL') { hs = 0; as = 0 } else { hs = part(m.h); as = part(m.a!) }
      }
      if (!final && !hs && !as) continue
      const [x, y] = [m.h, m.a!].sort(), key = x + '|' + y
      const p = pairs.get(key) ?? { a: x, b: y, lines: [], summary: '' }
      p.lines.push({ sport: L.sport, label: `${L.sport === 'NFL' ? 'Week' : 'Period'} ${m.week - start + 1}`, status: final ? 'FINAL' : 'LIVE', a: m.h === x ? hs : as, b: m.h === x ? as : hs, matchupId: m.id })
      pairs.set(key, p)
    }
  }
  const cup: CupRow[] = ids.map(t => {
    const ranks: Record<string, number | null> = {}; let pts = 0, w = 0, l = 0
    for (const sp of liveSports) { const r = tables[sp].find(x => x.teamId === t)!; ranks[sp] = r.rk; pts += r.fed; w += r.w; l += r.l }
    return { teamId: t, rk: 0, pts, rec: `${w}-${l}`, w, l, ranks, cupPct: 0, exp: 0 }
  }).sort((a, b) => b.pts - a.pts || (b.w - b.l) - (a.w - a.l)).map((r, i) => ({ ...r, rk: i + 1 }))
  const { moves, trades } = await loadMoves(league.id, season)
  const t0 = Date.parse(addDay(day, -1) + 'T05:00:00Z'), t1 = Date.parse(day + 'T05:00:00Z'), tt = Date.parse(addDay(day, -1) + 'T05:00:00Z')
  return {
    day, dayName: new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }), season,
    clubs, cup, tables, live: liveSports, pairings: [...pairs.values()],
    moves: moves.filter(m => m.season === season && Date.parse(m.when) >= t0 && Date.parse(m.when) < t1),
    trades: trades.filter(t => t.season === season && Date.parse(t.when) >= tt && Date.parse(t.when) < t1),
    model: live ? loadModel() : null,
    // ySFFL performances on Tuesdays, from the week that ended the night before
    perf: (() => {
      const nflStart = sched.find(s => s.sport === 'NFL')?.startWeek ?? 1
      const ended = [...new Set(ms.filter(m => m.sport === 'NFL').map(m => m.week))].find(w => span(season, 'NFL', w).end === addDay(day, -1))
      const tue = new Date(day + 'T12:00:00Z').getUTCDay() === 2
      return topPerformances(season, addDay(day, -1), ended != null ? ended - nflStart + 1 : -1).filter(p => p.sport !== 'NFL' || (tue && ended != null))
    })(),
  }
}
export { isoDay, addDay }
