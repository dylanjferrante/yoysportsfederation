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
  // finished regular-season results up to that morning, oldest first
  history: { sport: string; week: number; h: string; a: string; hs: number; as: number }[]
  // the best performances left on a bench yesterday, per league
  bench: { sport: string; name: string; team: string | null; pos: string; pts: number; clubId: string }[]
  // each player's best single game (or ySFFL week) this season before yesterday, by league|name
  best: Map<string, number>
  // the coming ySFFL week's pairings, when the desk is writing ahead of it
  next: { sport: string; a: string; b: string }[]
  start: Record<string, number>                     // each league's first federation week
  curWeek: Record<string, number | null>            // the week that morning falls in
  lastWeek: Record<string, number | null>           // the last week finished before that morning
  weekMoves: MoveRow[]                              // the last seven days of moves
  faab: Record<string, Record<string, number>>      // FAAB left, per league and club
}

const code = (sp: string) => YSF_LEAGUES.find(l => l.sport === sp)?.code ?? sp
const n1 = (x: number) => x.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const n0 = (x: number) => Math.round(x).toLocaleString('en-US')
const pct = (x: number) => x >= 0.995 ? 'all but certain' : x < 0.005 ? 'under 1%' : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`
const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const say = (n: number) => words[n] ?? String(n)
// "an 88%", "an 11%", "a 51%"
const an = (t: string) => (/^(8|11[^0-9]|18[^0-9])/.test(t) ? 'an ' : 'a ') + t
// pick a phrasing that changes from day to day but stays the same for a given story on a given day
const pick = <T,>(seed: string, xs: T[]) => xs[[...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % xs.length]
const player = (p: { sport: string; name: string; team: string | null; pos: string }) => `${p.name} (${code(p.sport)}-${p.team || 'FA'}, ${p.pos.replace(/,/g, '/').replace(/\bDEF\b/g, 'D/ST')})`
const last = (name: string) => name.split(' ').slice(-1)[0]

// a club's current streak in a league ("won 4 straight" / "lost 3 in a row")
function streak(d: Desk, clubId: string, sport: string): { kind: 'W' | 'L'; n: number } | null {
  const rs = d.history.filter(m => m.sport === sport && (m.h === clubId || m.a === clubId)).map(m => (m.h === clubId ? m.hs > m.as : m.as > m.hs) ? 'W' : 'L')
  if (!rs.length) return null
  const lastR = rs[rs.length - 1] as 'W' | 'L'; let n = 0
  for (let i = rs.length - 1; i >= 0 && rs[i] === lastR; i--) n++
  return { kind: lastR, n }
}
const streakText = (st: { kind: 'W' | 'L'; n: number } | null) => !st || st.n < 2 ? '' : st.kind === 'W' ? `has won ${say(st.n)} straight` : `has lost ${say(st.n)} in a row`
const rowOf = (d: Desk, sport: string, clubId: string) => d.tables[sport]?.find(r => r.teamId === clubId)
// the season's high and low single-week club scores in a league so far
function extremes(d: Desk, sport: string) {
  const all = d.history.filter(m => m.sport === sport).flatMap(m => [{ c: m.h, s: m.hs, w: m.week }, { c: m.a, s: m.as, w: m.week }])
  if (!all.length) return null
  const hi = all.reduce((a, b) => b.s > a.s ? b : a), lo = all.reduce((a, b) => b.s < a.s ? b : a)
  const avg = all.reduce((a, b) => a + b.s, 0) / all.length
  return { hi, lo, avg }
}

function winChance(d: Desk, l: { sport: string; matchupId: string }, clubId: string): number | null {
  const wp = d.model?.leagues[l.sport]?.matchups[l.matchupId]
  if (!wp) return null
  const home = (l as any).home ?? db.all<{ h: string }>(sql`SELECT home_team_id h FROM matchups WHERE id = ${l.matchupId}`)[0]?.h
  return home === clubId ? wp.homeWin : 1 - wp.homeWin
}

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
    const ch = winChance(d, tight.l, hi)
    body.push(`The closest race of the week is in ${code(tight.l.sport)}, where ${C[hi]?.name} leads ${C[lo]?.name} by ${n1(tight.gap)} (${n1(Math.max(tight.l.a ?? 0, tight.l.b ?? 0))}–${n1(Math.min(tight.l.a ?? 0, tight.l.b ?? 0))}).` +
      (ch != null ? ` The ySF model makes it ${pct(ch)} for ${C[hi]?.abbreviation} to hold on.` : ''))
  }
  // a season high for the headliner?
  const prevBest = d.best.get(`${t.sport}|${t.name}`)
  if (prevBest != null && t.pts > prevBest) body.push(`It was a season high for ${last(t.name)}, topping the ${n1(prevBest)} he had managed before.`)
  // each league's day: its best line and how the week's races stand
  for (const sp of d.live.filter(x => x !== 'NFL' || d.perf.some(p => p.sport === 'NFL'))) {
    const bestHere = d.perf.filter(p => p.sport === sp && p !== t)[0]
    const races = d.pairings.flatMap(p => p.lines.filter(l => l.sport === sp && l.a != null && l.b != null).map(l => ({ p, l })))
    const leaders = races.map(({ p, l }) => (l.a ?? 0) >= (l.b ?? 0) ? p.a : p.b)
    const blow = races.map(({ p, l }) => ({ p, l, gap: Math.abs((l.a ?? 0) - (l.b ?? 0)) })).sort((x, y) => y.gap - x.gap)[0]
    const parts: string[] = []
    if (bestHere) parts.push(sp === t.sport ? `${last(t.name)} aside, ${player(bestHere)} was next best with ${n1(bestHere.pts)} for ${C[bestHere.clubId]?.name}` : `${player(bestHere)} led the way with ${n1(bestHere.pts)} for ${C[bestHere.clubId]?.name}`)
    if (blow && blow.gap > 0) {
      const [hi, lo] = (blow.l.a ?? 0) >= (blow.l.b ?? 0) ? [blow.p.a, blow.p.b] : [blow.p.b, blow.p.a]
      parts.push(`the most lopsided race has ${C[hi]?.abbreviation} ahead of ${C[lo]?.abbreviation} by ${n1(blow.gap)}`)
    }
    const t1 = d.tables[sp]?.[0], t2 = d.tables[sp]?.[1]
    const ledByLeader = t1 && leaders.includes(t1.teamId)
    if (parts.length || t1) body.push(`In ${code(sp)}, ${parts.join(', and ')}${parts.length ? '. ' : ''}${t1 ? `${C[t1.teamId]?.name} (${t1.rec}) ${ledByLeader ? 'is ahead in its matchup this week' : 'is behind in its matchup this week'}${t2 ? `, with ${C[t2.teamId]?.abbreviation} ${t2.gb ? `${t2.gb} back` : 'level on record'}` : ''}.` : ''}`)
  }
  // points left on the bench
  const b0 = d.bench.slice().sort((x, y) => y.pts / avg(y.sport) - x.pts / avg(x.sport))[0]
  if (b0 && b0.pts >= avg(b0.sport) * 0.8) body.push(`The one that got away: ${player(b0)} scored ${n1(b0.pts)} on ${C[b0.clubId]?.name}'s bench.`)
  for (const sp of d.live) {
    const t1 = d.tables[sp]?.[0], t2 = d.tables[sp]?.[1]
    if (t1 && t2) body.push(`${code(sp)} standings: ${C[t1.teamId]?.name} ${t1.l === 0 && t1.w > 2 ? `is still perfect at ${t1.rec}` : `leads at ${t1.rec}`}, ${t2.gb ? `${t2.gb} game${t2.gb === 1 ? '' : 's'} clear of ${C[t2.teamId]?.name}` : `level with ${C[t2.teamId]?.name} on record`}${(() => { const st = streakText(streak(d, t1.teamId, sp)); return st ? `; ${C[t1.teamId]?.abbreviation} ${st}` : '' })()}.`)
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
  // the matchups one by one, with records and what's at stake
  for (const { p, l } of live.slice(0, 6)) {
    const [hi, lo, hs, ls] = (l.a ?? 0) >= (l.b ?? 0) ? [p.a, p.b, l.a ?? 0, l.b ?? 0] : [p.b, p.a, l.b ?? 0, l.a ?? 0]
    const rh = rowOf(d, sp, hi), rl = rowOf(d, sp, lo)
    const pHi = winChance(d, l, hi)
    const verb = l.status === 'FINAL' ? (hs - ls < (hs + ls) * 0.03 ? 'held off' : 'beat') : hs === ls ? 'is level with' : hs - ls < (hs + ls) * 0.03 ? 'is narrowly ahead of' : 'leads'
    const stakes = rh && rl && Math.abs(rh.rk - rl.rk) <= 2 && Math.min(rh.rk, rl.rk) <= 6 ? ` — a meeting of the ${ord(Math.min(rh.rk, rl.rk))}- and ${ord(Math.max(rh.rk, rl.rk))}-place clubs` : ''
    body.push(`${C[hi]?.name}${rh ? ` (${rh.rec})` : ''} ${verb} ${C[lo]?.name}${rl ? ` (${rl.rec})` : ''}, ${n1(hs)}–${n1(ls)}${stakes}.` +
      (pHi != null && l.status !== 'FINAL' ? (pHi >= 0.995 ? ` The model considers that one settled.` : ` The model gives ${C[hi]?.abbreviation} ${an(pct(pHi))} chance to finish it off.`) : '') +
      (() => { const st = streakText(streak(d, hi, sp)); return st ? ` ${C[hi]?.abbreviation} ${st}.` : '' })())
  }
  // the season's marks
  const ex = extremes(d, sp)
  if (ex) body.push(`The season's high is ${n1(ex.hi.s)}, by ${C[ex.hi.c]?.name} in ${sp === 'NFL' ? 'Week' : 'Period'} ${ex.hi.w - (Math.min(...d.history.filter(m => m.sport === sp).map(m => m.week))) + 1}; the low is ${n1(ex.lo.s)}, by ${C[ex.lo.c]?.name}. Clubs are averaging ${n1(ex.avg)} a week.`)
  // the table in tiers
  if (tbl.length >= 9) {
    const top = tbl.slice(0, 6), out = tbl.slice(6)
    body.push(`The playoff line runs under ${ord(6)}: ${top.map(r => `${C[r.teamId]?.abbreviation} ${r.rec}`).join(', ')} are in a playoff spot today; ${out.map(r => `${C[r.teamId]?.abbreviation} ${r.rec}`).join(', ')} are chasing.` +
      (tbl[5] && tbl[6] ? ` ${C[tbl[6].teamId]?.name} is ${tbl[6].gb - tbl[5].gb ? `${tbl[6].gb - tbl[5].gb} game${tbl[6].gb - tbl[5].gb === 1 ? '' : 's'}` : 'a tiebreaker'} out of the last spot.` : ''))
  }
  // the coming ySFFL week for the leader
  if (sp === 'NFL' && d.next.length) {
    const nx = d.next.find(m => m.a === a.teamId || m.b === a.teamId)
    if (nx) { const o = nx.a === a.teamId ? nx.b : nx.a, ro = rowOf(d, sp, o); body.push(`Next up for ${C[a.teamId]?.abbreviation}: ${C[o]?.name}${ro ? ` (${ro.rec}, ${ord(ro.rk)})` : ''}.`) }
  }
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
  // the contenders, one by one: where they sit in each league and what the model expects
  for (const r of d.cup.slice(0, 4)) {
    const places = Object.entries(r.ranks).filter(([, v]) => v != null).map(([sp, v]) => `${ord(v!)} in ${code(sp)}`)
    const mc = m?.cup[r.teamId]
    const titles = m ? YSF_LEAGUES.map(l => ({ l, t: m.leagues[l.sport]?.clubs[r.teamId]?.title ?? 0 })).filter(x => x.t >= 0.1).map(x => `${pct(x.t)} to win ${x.l.code}`) : []
    body.push(`${C[r.teamId]?.name} (${r.pts} points): ${places.join(', ')}.` + (mc ? ` Projected to finish with ${n1(mc.exp)}${titles.length ? `, with ${titles.join(' and ')}` : ''}.` : ''))
  }
  // what a league is worth: the spread between first and last
  body.push(`Every league is worth 12 points to its champion and 1 to its last-place club, and the final standings after the playoffs are what count — a regular-season leader who stumbles in the bracket can lose as many as three points.`)
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
  // each side's haul, by this season's numbers, and how it fits
  const ppgOf = (g: { name: string; sport: string }) => g.name ? playerSeason(d, g.sport, g.name) : null
  for (const s of sides) {
    const got = s.gets.filter(g => g.name).map(g => ({ g, ps: ppgOf(g) }))
    const gave = sides.filter(o => o !== s).flatMap(o => o.gets).filter(g => g.name).map(g => ({ g, ps: ppgOf(g) }))
    const sum = (xs: { ps: PlayerSeason | null }[]) => xs.reduce((a, x) => a + (x.ps?.ppg ?? 0), 0)
    const lines = got.filter(x => x.ps).map(x => `${x.g.name} (${n1(x.ps!.ppg)} a game, ${x.ps!.posRank ? `${ord(x.ps!.posRank)} of ${x.ps!.posCount} ${x.ps!.position}s` : 'limited sample'})`)
    if (lines.length) body.push(`For ${C[s.teamId].abbreviation}: ${lines.join('; ')}. In all, ${C[s.teamId].abbreviation} takes on ${n1(sum(got))} points per game and sends out ${n1(sum(gave))}.`)
    for (const x of got.filter(x => x.ps)) {
      const dep = depth(d, s.teamId, x.g.sport, x.ps!.position).filter(y => y.name !== x.g.name)
      const better = dep.filter(y => y.ppg > x.ps!.ppg).length
      body.push(better === 0 ? `${last(x.g.name)} becomes ${C[s.teamId].abbreviation}'s top ${x.ps!.position} by points per game.` : `${last(x.g.name)} slots in as ${C[s.teamId].abbreviation}'s ${ord(better + 1)}-best ${x.ps!.position}.`)
    }
  }
  for (const s of sides) {
    const ranks = d.cup.find(r => r.teamId === s.teamId)
    if (ranks) body.push(`${C[s.teamId].abbreviation} is ${ord(ranks.rk)} in the Cup race with ${ranks.pts} points.`)
  }
  return { slot: `trade:${t.id}`, kind: 'trade', sport: 'MOVES', writer: 'hank', headline: star ? `${C[star.to].abbreviation} lands ${star.g.name} in trade with ${C[sides.find(s => s.teamId !== star.to)?.teamId ?? '']?.abbreviation ?? 'a rival'}` : `${sides.map(s => C[s.teamId].abbreviation).join(', ')} make a deal`, dek: `Who got what in the deal between ${names.join(' and ')}.`, body, clubs: sides.map(s => C[s.teamId].abbreviation) }
}

// ── move analysis ───────────────────────────────────────────────────────────
type PlayerSeason = { gp: number; ppg: number; points: number; posRank: number | null; posCount: number; position: string }
function playerSeason(d: Desk, sport: string, name: string): PlayerSeason | null {
  const r = db.all<{ gp: number; points: number; position: string }>(sql`SELECT s.gp, s.points, p.position FROM player_season_stats s JOIN players p ON p.id = s.player_id
    WHERE s.league_id = ${YSF_LEAGUE_ID} AND s.season = ${d.season} AND p.sport = ${sport} AND p.name = ${name} LIMIT 1`)[0]
  if (!r || !r.gp) return null
  const ppg = r.points / r.gp
  const peers = db.all<{ ppg: number }>(sql`SELECT s.points * 1.0 / s.gp ppg FROM player_season_stats s JOIN players p ON p.id = s.player_id
    WHERE s.league_id = ${YSF_LEAGUE_ID} AND s.season = ${d.season} AND p.sport = ${sport} AND p.position = ${r.position} AND s.gp >= 3`)
  const posRank = peers.length ? peers.filter(x => x.ppg > ppg).length + 1 : null
  return { gp: r.gp, ppg, points: r.points, posRank, posCount: peers.length, position: r.position }
}
// a club's players at a position, best first, by points per game
function depth(d: Desk, clubId: string, sport: string, position: string) {
  return db.all<{ name: string; ppg: number; slot: string }>(sql`SELECT p.name, s.points * 1.0 / s.gp ppg, r.slot FROM rosters r JOIN players p ON p.id = r.player_id
    JOIN player_season_stats s ON s.player_id = p.id AND s.league_id = ${YSF_LEAGUE_ID} AND s.season = ${d.season} AND s.gp > 0
    WHERE r.team_id = ${clubId} AND p.sport = ${sport} AND (p.position = ${position} OR p.eligible_positions LIKE ${'%"' + position + '"%'})
    ORDER BY ppg DESC`)
}
// a player's time with a club: first and last appearance, starts, points as a starter, and how many
// times the club has signed him
function tenure(d: Desk, clubId: string, sport: string, name: string) {
  const r = db.all<{ first: string | null; last: string | null; rows: number; starts: number; pts: number | null; seasons: number }>(sql`
    SELECT MIN(NULLIF(date, '')) first, MAX(NULLIF(date, '')) last, COUNT(*) rows, SUM(status = '1') starts,
      SUM(CASE WHEN status = '1' THEN COALESCE(engine_pts, fpts, 0) END) pts, COUNT(DISTINCT season) seasons
    FROM fantrax_player_periods WHERE team_id = ${clubId} AND sport = ${sport} AND name = ${name}`)[0]
  const signings = db.all<{ n: number }>(sql`SELECT COUNT(*) n FROM activity WHERE league_id = ${YSF_LEAGUE_ID} AND team_id = ${clubId}
    AND json_extract(data, '$.player') = ${name} AND json_extract(data, '$.kind') IN ('SIGNED', 'CLAIMED', 'DRAFTED', 'TRADED')`)[0]?.n ?? 0
  return r && r.rows ? { ...r, signings } : null
}
const fmtDay = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

// the analysis paragraphs for one move: the player's season, where he ranks, how he fits; for a release,
// his history with the club
function moveAnalysis(d: Desk, m: MoveRow): string[] {
  const C = d.clubs, L = code(m.sport), club = C[m.teamId], out: string[] = []
  const ps = playerSeason(d, m.sport, m.player)
  const name = `${m.player} (${L}-${m.team || 'FA'}, ${m.pos})`
  if (m.kind === 'CLAIMED' || m.kind === 'SIGNED') {
    if (ps) {
      out.push(`${last(m.player)} has averaged ${n1(ps.ppg)} fantasy points a game over ${say(ps.gp)} games this season` + (ps.posRank ? `, ${ord(ps.posRank)} among ${ps.posCount} ${ps.position}s with at least three games.` : '.'))
      const dep = depth(d, m.teamId, m.sport, ps.position).filter(x => x.name !== m.player)
      if (dep.length) {
        const better = dep.filter(x => x.ppg > ps.ppg).length
        out.push(better === 0 ? `He immediately becomes ${club?.abbreviation}'s most productive ${ps.position} by points per game, ahead of ${dep[0].name} (${n1(dep[0].ppg)}).`
          : `On ${club?.abbreviation}'s roster he slots in behind ${dep.slice(0, better).slice(0, 2).map(x => `${x.name} (${n1(x.ppg)})`).join(' and ')} at ${ps.position}${better > 2 ? `, and ${say(better - 2)} more` : ''} — depth more than a lineup change, for now.`)
      } else out.push(`${club?.name} had no other ${ps.position} with games this season; ${last(m.player)} fills a hole.`)
    } else out.push(`${name} has not played a game in ${L} this season, so this is a bet on what comes next rather than what has happened.`)
    if (m.bid) {
      const bids = d.weekMoves.concat(d.moves).filter(x => x.sport === m.sport && x.bid).map(x => x.bid!)
      const big = bids.filter(b => b > m.bid!).length
      const left = d.faab[m.sport]?.[m.teamId]
      out.push(`The $${m.bid} bid ${big === 0 ? 'is the biggest on the wire in recent days' : `ranks behind ${say(big)} bigger recent bids`}${left != null ? `, and leaves ${club?.abbreviation} with $${left} of FAAB` : ''}.`)
    }
  } else {
    const t = tenure(d, m.teamId, m.sport, m.player)
    if (t) {
      const since = t.first ? fmtDay(t.first) : null
      out.push(`${last(m.player)} ${t.signings > 1 ? `ends his ${ord(t.signings)} stint with ${club?.name}` : `leaves ${club?.name}`}${since ? `, where he first appeared on ${since}` : ''}${t.seasons > 1 ? ` and spent parts of ${say(t.seasons)} seasons` : ''}.` +
        (t.starts ? ` He started ${say(t.starts)} time${t.starts === 1 ? '' : 's'} for ${club?.abbreviation} and scored ${n1(t.pts ?? 0)} points in those starts.` : ` He never cracked ${club?.abbreviation}'s starting lineup.`))
    }
    if (ps) out.push(`This season he has averaged ${n1(ps.ppg)} points a game over ${say(ps.gp)} games${ps.posRank ? ` (${ord(ps.posRank)} of ${ps.posCount} ${ps.position}s)` : ''} — ${ps.posRank && ps.posRank <= Math.max(5, ps.posCount * 0.25) ? `numbers another club may well want` : 'numbers that made him expendable'}.`)
  }
  return out
}

// a story for a notable move: a real FAAB bid, or the release of a player who started for the club
function moveStory(d: Desk, m: MoveRow): Story | null {
  const C = d.clubs, L = code(m.sport), club = C[m.teamId]
  if (!club || !m.player) return null
  const add = m.kind === 'CLAIMED' || m.kind === 'SIGNED'
  const t = add ? null : tenure(d, m.teamId, m.sport, m.player)
  const notable = add ? (m.bid ?? 0) >= 15 : (t?.starts ?? 0) >= 5
  if (!notable) return null
  // the other half of the move: the release that made room for an add, or the add a release made room for
  const isAdd = (x: MoveRow) => x.kind === 'CLAIMED' || x.kind === 'SIGNED'
  const paired = d.moves.find(x => x.teamId === m.teamId && x.sport === m.sport && x !== m && isAdd(x) !== add && Math.abs(Date.parse(x.when) - Date.parse(m.when)) < 60_000 && x.player)
  const body = [
    add ? `${club.name} ${m.bid ? `won ${m.player} (${L}-${m.team || 'FA'}, ${m.pos}) on waivers with a $${m.bid} bid` : `signed ${m.player} (${L}-${m.team || 'FA'}, ${m.pos})`}${paired && !(paired.kind === 'CLAIMED' || paired.kind === 'SIGNED') ? `, releasing ${paired.player} to make room` : ''}.`
        : `${club.name} has released ${m.player} (${L}-${m.team || 'FA'}, ${m.pos})${paired && (paired.kind === 'CLAIMED' || paired.kind === 'SIGNED') ? ` to make room for ${paired.player}` : ''}.`,
    ...moveAnalysis(d, m),
    ...(paired ? moveAnalysis(d, paired) : []),
  ]
  const r = rowOf(d, m.sport, m.teamId)
  if (r) body.push(`${club.abbreviation} is ${r.rec} and ${ord(r.rk)} in ${L}.`)
  return { slot: `move:${m.id}`, kind: 'move', sport: m.sport, writer: 'hank', headline: add ? `${club.abbreviation} ${m.bid ? `pays $${m.bid} for` : 'signs'} ${last(m.player)}${paired && !(paired.kind === 'CLAIMED' || paired.kind === 'SIGNED') ? `, cuts ${last(paired.player)}` : ''}` : `${club.abbreviation} parts ways with ${last(m.player)}`,
    dek: add ? `What ${m.player} brings to ${club.name}, and where he fits.` : `${m.player}'s time with ${club.name}, by the numbers.`, body, clubs: [club.abbreviation] }
}

// ── league story types ──────────────────────────────────────────────────────
const unit = (sp: string) => sp === 'NFL' ? 'Week' : 'Period'
const weekNo = (d: Desk, sp: string, w: number) => w - (d.start[sp] ?? 1) + 1
function periodStars(d: Desk, sp: string, w: number, n = 4) {
  return db.all<{ name: string; team: string | null; pos: string; clubId: string; pts: number }>(sql`
    SELECT name, MAX(pro_team) team, MAX(COALESCE(positions, '')) pos, team_id clubId, SUM(COALESCE(engine_pts, fpts, 0)) pts FROM fantrax_player_periods
    WHERE season = ${d.season} AND sport = ${sp} AND matchup_period = ${weekNo(d, sp, w)} AND status = '1'
    GROUP BY name, team_id ORDER BY pts DESC LIMIT ${n}`).map(p => ({ ...p, sport: sp }))
}

// RECAP — the week just finished: every result, the best performers, the table after it
function recap(d: Desk, sp: string): Story | null {
  const C = d.clubs, w = d.lastWeek[sp], L = code(sp), tbl = d.tables[sp]
  if (w == null || !tbl?.length) return null
  const res = d.history.filter(m => m.sport === sp && m.week === w)
  if (!res.length) return null
  const rk = (id: string) => tbl.find(r => r.teamId === id)?.rk ?? 12
  const games = res.map(m => { const [win, lose, ws, ls] = m.hs >= m.as ? [m.h, m.a, m.hs, m.as] : [m.a, m.h, m.as, m.hs]; return { win, lose, ws, ls, gap: ws - ls } })
  const upset = [...games].filter(g => rk(g.win) - rk(g.lose) >= 4).sort((x, y) => (rk(y.win) - rk(y.lose)) - (rk(x.win) - rk(x.lose)))[0]
  const top = [...games].sort((x, y) => y.ws - x.ws)[0], close = [...games].sort((x, y) => x.gap - y.gap)[0]
  const stars = periodStars(d, sp, w)
  const n = weekNo(d, sp, w), lead = tbl[0]
  const angle = pick(d.day + sp + 'recap', [upset ? 'upset' : 'top', 'top', ...(close.gap < (close.ws + close.ls) * 0.02 ? ['close'] : [])])
  const headline = angle === 'upset' && upset ? `${C[upset.win]?.abbreviation} stuns ${C[upset.lose]?.abbreviation} in ${L} ${unit(sp)} ${n}`
    : angle === 'close' ? `${C[close.win]?.abbreviation} survives ${C[close.lose]?.abbreviation} by ${n1(close.gap)}`
    : `${C[top.win]?.abbreviation}'s ${n1(top.ws)} leads ${L} ${unit(sp)} ${n}`
  const body: string[] = []
  const lede = angle === 'upset' && upset ? upset : angle === 'close' ? close : top
  body.push(`${C[lede.win]?.name} beat ${C[lede.lose]?.name} ${n1(lede.ws)}–${n1(lede.ls)} in ${L} ${unit(sp)} ${n}` +
    (angle === 'upset' ? `, a win for the ${ord(rk(lede.win))}-place club over the ${ord(rk(lede.lose))}.` : angle === 'close' ? `, the closest result of the week.` : `, the best score of the week.`))
  for (const g of games.filter(g => g !== lede)) body.push(`${C[g.win]?.name} (${rowOf(d, sp, g.win)?.rec ?? ''}) beat ${C[g.lose]?.name} (${rowOf(d, sp, g.lose)?.rec ?? ''}), ${n1(g.ws)}–${n1(g.ls)}.`)
  if (stars.length) body.push(`The week's best: ${stars.map(p => `${player(p)}, ${n1(p.pts)} for ${C[p.clubId]?.abbreviation}`).join('; ')}.`)
  const all = games.flatMap(g => [g.ws, g.ls]), avg = all.reduce((a, b) => a + b, 0) / all.length, ex = extremes(d, sp)
  body.push(`Clubs averaged ${n1(avg)} this week${ex ? `, against ${n1(ex.avg)} for the season` : ''}; ${C[top.win]?.name}'s ${n1(top.ws)} was the high${ex && top.ws >= ex.hi.s ? ', and a new season best' : ''}.`)
  body.push(`${C[lead.teamId]?.name} leads at ${lead.rec}` + (tbl[1] ? `, ${tbl[1].gb ? `${tbl[1].gb} game${tbl[1].gb === 1 ? '' : 's'}` : 'no games'} ahead of ${C[tbl[1].teamId]?.name}` : '') + `. The last playoff spot belongs to ${C[tbl[5]?.teamId]?.name ?? '—'} (${tbl[5]?.rec ?? ''}).`)
  return { slot: `recap:${sp}:${d.day}`, kind: 'recap', sport: sp, writer: 'walt', headline, dek: `${L} ${unit(sp)} ${n} in review: every result, the best performances, and the table after it.`, body, clubs: [C[lede.win]?.abbreviation, C[lede.lose]?.abbreviation].filter(Boolean) as string[] }
}

// THIS WEEK — the matchups ahead, with records, the model's odds and the players to watch
function thisWeek(d: Desk, sp: string): Story | null {
  const C = d.clubs, w = d.curWeek[sp], L = code(sp), tbl = d.tables[sp] ?? []
  if (w == null) return null
  const games = db.all<{ id: string; h: string; a: string }>(sql`SELECT id, home_team_id h, away_team_id a FROM matchups WHERE league_id = ${YSF_LEAGUE_ID} AND season = ${d.season} AND sport = ${sp} AND week = ${w} AND away_team_id IS NOT NULL`)
  if (!games.length) return null
  const rk = (id: string) => tbl.find(r => r.teamId === id)?.rk ?? 12
  const feature = [...games].sort((x, y) => (rk(x.h) + rk(x.a)) - (rk(y.h) + rk(y.a)))[0]
  const n = weekNo(d, sp, w)
  const body: string[] = []
  const odds = (g: { id: string; h: string }) => winChance(d, { sport: sp, matchupId: g.id, home: g.h } as any, g.h)
  const fo = odds(feature)
  body.push(`The game of the week in ${L} ${unit(sp)} ${n} is ${C[feature.h]?.name} (${rowOf(d, sp, feature.h)?.rec ?? '0-0'}, ${ord(rk(feature.h))}) against ${C[feature.a]?.name} (${rowOf(d, sp, feature.a)?.rec ?? '0-0'}, ${ord(rk(feature.a))}).` +
    (fo != null ? ` The ySF model makes it ${Math.round(fo * 100)}–${100 - Math.round(fo * 100)} ${fo >= 0.5 ? C[feature.h]?.abbreviation : C[feature.a]?.abbreviation}.` : ''))
  for (const g of games.filter(g => g !== feature)) {
    const o = odds(g), fav = o == null ? null : o >= 0.5 ? g.h : g.a, p = o == null ? null : Math.max(o, 1 - o)
    body.push(`${C[g.h]?.name} (${rowOf(d, sp, g.h)?.rec ?? '0-0'}) meets ${C[g.a]?.name} (${rowOf(d, sp, g.a)?.rec ?? '0-0'})` + (fav && p != null ? `; ${C[fav]?.abbreviation} is favored at ${Math.round(p * 100)}%.` : '.'))
  }
  // players to watch: the week's biggest projections from the player model
  const watch = d.model ? db.all<{ name: string; team: string | null; pos: string; clubId: string; pts: number; games: number }>(sql`
    SELECT p.name, p.real_team_abbr team, p.position pos, r.team_id clubId, j.pts, j.games FROM ysf_player_proj j JOIN players p ON p.id = j.player_id
    JOIN rosters r ON r.player_id = p.id AND r.team_id IN (SELECT id FROM teams WHERE league_id = ${YSF_LEAGUE_ID})
    WHERE j.season = ${d.season} AND j.week = ${w} AND p.sport = ${sp} ORDER BY j.pts DESC LIMIT 3`) : []
  if (watch.length) body.push(`Players to watch: ${watch.map(p => `${player({ ...p, sport: sp })}, projected for ${n1(p.pts)}${sp !== 'NFL' ? ` over ${say(p.games)} games` : ''} for ${C[p.clubId]?.abbreviation}`).join('; ')}.`)
  const lead = tbl[0]
  if (lead) body.push(`${C[lead.teamId]?.name} takes a ${lead.rec} record into the week${tbl[1] ? `, ${tbl[1].gb ? `${tbl[1].gb} game${tbl[1].gb === 1 ? '' : 's'}` : 'level on record but'} ahead of ${C[tbl[1].teamId]?.name}` : ''}.`)
  return { slot: `week:${sp}:${d.day}`, kind: 'preview', sport: sp, writer: 'june', headline: `${L} ${unit(sp)} ${n}: ${C[feature.h]?.abbreviation} vs. ${C[feature.a]?.abbreviation} headlines the week`, dek: `The matchups, the odds and the players to watch in ${L} ${unit(sp)} ${n}.`, body, clubs: [C[feature.h]?.abbreviation, C[feature.a]?.abbreviation].filter(Boolean) as string[] }
}

// ON THE WIRE — a league's week of claims, signings and releases, and who has FAAB left
function onTheWire(d: Desk, sp: string): Story | null {
  const C = d.clubs, L = code(sp)
  const mv = d.weekMoves.filter(m => m.sport === sp && m.player && ['CLAIMED', 'SIGNED', 'DROPPED', 'RELEASED'].includes(m.kind))
  if (mv.length < 2) return null
  const adds = mv.filter(m => m.kind === 'CLAIMED' || m.kind === 'SIGNED'), cuts = mv.filter(m => m.kind === 'DROPPED' || m.kind === 'RELEASED')
  const bids = adds.filter(m => m.bid).sort((a, b) => (b.bid ?? 0) - (a.bid ?? 0))
  const busy = Object.entries(mv.reduce((a, m) => ({ ...a, [m.teamId]: (a[m.teamId] ?? 0) + 1 }), {} as Record<string, number>)).sort((a, b) => b[1] - a[1])
  const p = (m: MoveRow) => `${m.player} (${L}-${m.team || 'FA'}, ${m.pos})`
  const body: string[] = []
  body.push(`${say(adds.length)[0].toUpperCase() + say(adds.length).slice(1)} players joined ${L} rosters this week and ${say(cuts.length)} were let go.` + (bids[0] ? ` The biggest bid: ${C[bids[0].teamId]?.name} spent $${bids[0].bid} on ${p(bids[0])}.` : ''))
  if (bids.length > 1) body.push(`Other winning bids: ${bids.slice(1, 6).map(m => `${C[m.teamId]?.abbreviation} $${m.bid} for ${p(m)}`).join('; ')}.`)
  const free = adds.filter(m => !m.bid)
  if (free.length) body.push(`Signed straight off the wire: ${free.slice(0, 6).map(m => `${p(m)} to ${C[m.teamId]?.abbreviation}`).join('; ')}.`)
  if (cuts.length) body.push(`Released: ${cuts.slice(0, 8).map(m => `${p(m)} by ${C[m.teamId]?.abbreviation}`).join('; ')}.`)
  if (busy[0] && busy[0][1] > 2) body.push(`${C[busy[0][0]]?.name} was the busiest club with ${say(busy[0][1])} moves${busy[1] && busy[1][1] > 2 ? `, ahead of ${C[busy[1][0]]?.name} (${busy[1][1]})` : ''}.`)
  const f = d.faab[sp] ? Object.entries(d.faab[sp]).sort((a, b) => b[1] - a[1]) : []
  if (f.length) body.push(`FAAB left: ${f.slice(0, 3).map(([t, v]) => `${C[t]?.abbreviation} $${v}`).join(', ')} have the most to spend; ${f.slice(-2).map(([t, v]) => `${C[t]?.abbreviation} $${v}`).join(' and ')} the least.`)
  return { slot: `wire:${sp}:${d.day}`, kind: 'wire', sport: sp, writer: 'hank', headline: bids[0] ? `${C[bids[0].teamId]?.abbreviation} spends $${bids[0].bid} on ${last(bids[0].player)} as ${L} wire heats up` : `${C[busy[0][0]]?.abbreviation} leads a busy week on the ${L} wire`, dek: `${L}'s week of claims, signings and releases, and who still has money to spend.`, body, clubs: [bids[0] ? C[bids[0].teamId]?.abbreviation : '', C[busy[0][0]]?.abbreviation].filter(Boolean) as string[] }
}

// POWER RANKINGS — all twelve, one by one
function powerRankings(d: Desk, sp: string): Story | null {
  const C = d.clubs, L = code(sp), tbl = d.tables[sp]
  if (!tbl?.length || !d.history.some(m => m.sport === sp)) return null
  const odds = d.model?.leagues[sp]?.clubs
  const pfRank = new Map([...tbl].sort((a, b) => b.pf - a.pf).map((r, i) => [r.teamId, i + 1]))
  const score = (r: LeagueRow) => (r.w / Math.max(1, r.w + r.l)) * 0.5 + (1 - (pfRank.get(r.teamId)! - 1) / 11) * 0.35 + (odds?.[r.teamId]?.title ?? 0) * 0.15 * 4
  const ranked = [...tbl].sort((a, b) => score(b) - score(a))
  const lastRes = (t: string) => { const m = [...d.history].reverse().find(x => x.sport === sp && (x.h === t || x.a === t)); if (!m) return ''; const mine = m.h === t ? m.hs : m.as, theirs = m.h === t ? m.as : m.hs, o = m.h === t ? m.a : m.h; return `${mine > theirs ? 'beat' : 'lost to'} ${C[o]?.abbreviation} ${n1(mine)}–${n1(theirs)} last time out` }
  const body = ranked.map((r, i) => {
    const st = streakText(streak(d, r.teamId, sp))
    const bits = [`${r.rec}`, `${ord(pfRank.get(r.teamId)!)} in points`, odds?.[r.teamId] ? `${pct(odds[r.teamId].title)} title odds` : ''].filter(Boolean).join(', ')
    return `${i + 1}. ${C[r.teamId]?.name} (${bits}). ${C[r.teamId]?.abbreviation} ${lastRes(r.teamId)}${st ? ` and ${st}` : ''}.`
  })
  const top = ranked[0]
  return { slot: `rank:${sp}:${d.day}`, kind: 'rankings', sport: sp, writer: 'rico', headline: `${L} Power Rankings: ${C[top.teamId]?.abbreviation} on top${ranked[0].teamId !== tbl[0].teamId ? `, ahead of the standings leader` : ''}`, dek: `All twelve ${L} clubs, ranked on record, scoring and the model's view of the rest of the season.`, body, clubs: ranked.slice(0, 2).map(r => C[r.teamId]?.abbreviation).filter(Boolean) as string[] }
}

// tidy: no doubled periods after names that end in one ("Mitchel B.J.C..")
const tidy = (t: string) => t.replace(/\.\.(?=\s|$)/g, '.').replace(/\.\.\s*\(/g, '. (')
// one-sentence lines read like a wire printout: join related lines into paragraphs of two or three
function paragraphs(lines: string[]): string[] {
  const out: string[] = []
  let cur: string[] = []
  const kind = (t: string) => /^\S.* \(\d+-\d+\) (leads|is level|is narrowly|beat|held off)/.test(t) ? 'match' : /^ySF\w\w standings:/.test(t) ? 'table' : /^(In ySF|The one that got away|It was a season high)/.test(t) ? 'color' : 'solo'
  for (const t of lines) {
    const k = kind(t), prev = cur.length ? kind(cur[cur.length - 1]) : null
    if (cur.length && (k === 'solo' || k !== prev || cur.length >= 3)) { out.push(cur.join(' ')); cur = [] }
    cur.push(t)
  }
  if (cur.length) out.push(cur.join(' '))
  return out
}
export function deskStories(d: Desk): Story[] {
  // the rhythm of the week: the daily wrap and moves every day; ySFFL's notebook after its games
  // (Tuesday) and before the weekend (Friday); the daily leagues' notebooks every day; the Cup race
  // Monday and Thursday; a story for every trade
  const dow = new Date(d.day + 'T12:00:00Z').getUTCDay()
  // each league's beat (0 = Sunday): Recap after its week, This Week as the next one opens, On the
  // Wire after waivers, a midweek Notebook, Power Rankings at the weekend
  const BEAT: Record<string, Record<string, number[]>> = {
    NFL: { recap: [2], week: [4], wire: [3], notebook: [1, 5], rank: [6] },
    NHL: { recap: [1], week: [1], wire: [4], notebook: [2, 3, 5, 6], rank: [0] },
    NBA: { recap: [1], week: [1], wire: [5], notebook: [2, 3, 4, 6], rank: [0] },
    MLB: { recap: [1], week: [1], wire: [2], notebook: [3, 4, 5, 6], rank: [0] },
  }
  const on = (sp: string, k: string) => BEAT[sp]?.[k]?.includes(dow)
  const leagues = YSF_LEAGUES.map(l => l.sport).filter(sp => d.live.includes(sp) || d.curWeek[sp] != null)
  const out: (Story | null)[] = [dailyWrap(d), dow === 1 || dow === 4 ? cupUpdate(d) : null]
  for (const sp of leagues) {
    if (on(sp, 'recap')) out.push(recap(d, sp))
    if (on(sp, 'week')) out.push(thisWeek(d, sp))
    if (on(sp, 'wire')) out.push(onTheWire(d, sp))
    if (on(sp, 'notebook') && d.live.includes(sp)) out.push(notebook(d, sp))
    if (on(sp, 'rank')) out.push(powerRankings(d, sp))
  }
  // the day's two most notable moves get their own stories: the biggest bids, or the releases of the
  // players who had given their clubs the most (points as a starter, against the league's weekly average)
  const avgWk = (sp: string) => extremes(d, sp)?.avg || 100
  const scored = d.moves.filter(m => m.player).map(m => {
    const add = m.kind === 'CLAIMED' || m.kind === 'SIGNED'
    const t = add ? null : tenure(d, m.teamId, m.sport, m.player)
    return { m, score: add ? (m.bid ?? 0) / 10 : ((t?.pts ?? 0) / avgWk(m.sport)) * 3 }
  }).filter(x => x.score >= 1.5).sort((a, b) => b.score - a.score)
  const seen = new Set<string>()
  for (const { m } of scored) { if (seen.size >= 2 || seen.has(m.teamId + m.sport)) continue; const st = moveStory(d, m); if (st) { out.push(st); seen.add(m.teamId + m.sport) } }
  for (const t of d.trades) out.push(tradeStory(d, t))
  return out.filter((s): s is Story => !!s).map(s => ({ ...s, headline: tidy(s.headline), dek: tidy(s.dek), body: paragraphs(s.body.map(tidy)) }))
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
      p.lines.push({ sport: L.sport, label: `${L.sport === 'NFL' ? 'Week' : 'Period'} ${m.week - start + 1}`, status: final ? 'FINAL' : 'LIVE', a: m.h === x ? hs : as, b: m.h === x ? as : hs, matchupId: m.id, home: m.h } as any)
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
    start: Object.fromEntries(YSF_LEAGUES.map(L => [L.sport, sched.find(s => s.sport === L.sport)?.startWeek ?? 1])),
    curWeek: Object.fromEntries(YSF_LEAGUES.map(L => [L.sport, ms.find(m => m.sport === L.sport && !m.po && span(season, L.sport, m.week).start <= day && day <= span(season, L.sport, m.week).end)?.week ?? null])),
    lastWeek: Object.fromEntries(YSF_LEAGUES.map(L => { const ws = ms.filter(m => m.sport === L.sport && !m.po && span(season, L.sport, m.week).end < day).map(m => m.week); return [L.sport, ws.length ? Math.max(...ws) : null] })),
    weekMoves: moves.filter(m => m.season === season && Date.parse(m.when) >= Date.parse(addDay(day, -7) + 'T05:00:00Z') && Date.parse(m.when) < t1),
    faab: (() => { const o: Record<string, Record<string, number>> = {}; for (const r of db.all<{ sport: string; t: string; f: number | null }>(sql`SELECT sport, team_id t, faab_remaining f FROM team_records WHERE league_id = ${YSF_LEAGUE_ID} AND season = ${season}`)) (o[r.sport] ??= {})[r.t] = r.f ?? 0; return o })(),
    history: ms.filter(m => !m.po && span(season, m.sport, m.week).end < day).sort((x, y) => x.week - y.week).map(m => ({ sport: m.sport, week: m.week, h: m.h, a: m.a!, hs: m.hs ?? 0, as: m.as_ ?? 0 })),
    bench: db.all<{ sport: string; name: string; team: string | null; pos: string; pts: number; clubId: string }>(sql`
      SELECT * FROM (SELECT sport, name, pro_team team, COALESCE(positions, '') pos, COALESCE(engine_pts, fpts) pts, team_id clubId,
        ROW_NUMBER() OVER (PARTITION BY sport ORDER BY COALESCE(engine_pts, fpts) DESC) n FROM fantrax_player_periods
        WHERE season = ${season} AND status = '2' AND date = ${addDay(day, -1)}) WHERE n <= 2 AND pts > 0`),
    best: new Map(db.all<{ k: string; m: number }>(sql`SELECT sport || '|' || name k, MAX(COALESCE(engine_pts, fpts)) m FROM fantrax_player_periods
      WHERE season = ${season} AND status = '1' AND (date < ${addDay(day, -1)} AND date != '' OR (sport = 'NFL' AND date = ''))
      GROUP BY sport, name`).map(r => [r.k, r.m])),
    next: (() => {
      const cur = ms.filter(m => m.sport === 'NFL' && !m.po).find(m => { const sp = span(season, 'NFL', m.week); return sp.start <= day && day <= sp.end })
      return cur ? ms.filter(m => m.sport === 'NFL' && m.week === cur.week).map(m => ({ sport: 'NFL', a: m.h, b: m.a! })) : []
    })(),
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
