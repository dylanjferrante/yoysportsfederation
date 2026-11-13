// The ySF projection model, in four layers, all from the app's own data:
//
//   1. PLAYERS — every player's projected fantasy points and stat line for any week. A per-game rate
//      from this season, shrunk toward his position's average until he has a sample (fewer games =
//      more weight on the average), blended with his last three weeks, discounted for injury status,
//      times the games his pro team plays that week. ySFFL blends in Tank01's weekly projection.
//   2. CLUBS — each club's projected score in each league each week: the best legal lineup from its
//      roster (day by day in the daily leagues, using who actually plays that day), with a spread
//      taken from the club's own week-to-week scoring.
//   3. MATCHUPS — win probability for every matchup still to finish, counting points already scored.
//   4. SEASON — 10,000 simulated seasons: the rest of the regular season, the playoff bracket (top 6;
//      seeds 1–2 bye; semifinals reseeded; 3rd- and 5th-place games), final league finishes, and the
//      Federation Cup (12 points for 1st in a league down to 1 for 12th, summed over the leagues).
//
// runModel() writes ysf_player_proj (this week and next for every player) and ysf_model (everything
// else, one JSON row); the scheduler runs it every hour.
import { sql, eq } from 'drizzle-orm'
import { db } from '@/db'
import { leagues } from '@/db/schema'
import { weekDateRange } from '@/lib/defaults'
import { safeParse } from '@/lib/utils'
import { YSF_LEAGUE_ID, YSF_LEAGUES } from '@/lib/ysf'
import { loadGameLines, type Sport } from '@/lib/ysf-gamelines'
import { mapBoxScoreBase, deriveWeekly } from '@/lib/providers/boxscore-map'
import { scorePlayer } from '@/lib/scoring'
import { tank01Configured, tank01WeekProjections } from '@/lib/providers/tank01'

const SPORTS = ['NFL', 'NHL', 'NBA', 'MLB'] as const
// games of evidence before a player's own rate counts as much as his position's average
const SHRINK: Record<string, number> = { NFL: 3, NBA: 8, NHL: 10, MLB: 15 }
// how much the last three weeks count against the season-long rate
const RECENT_WEIGHT = 0.3
const RESERVE = ['BN', 'IR', 'TAXI', 'IL', 'DL']
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const ymd = (d: Date) => iso(d).replace(/-/g, '')

// chance a player plays, by injury designation
export function availability(status: string | null | undefined): number {
  const s = (status ?? '').toLowerCase()
  if (!s || s === 'active' || s === 'healthy') return 1
  if (/out|injured reserve|suspension|^ir$|^o$/.test(s)) return 0
  if (/doubtful|^d$/.test(s)) return 0.25
  if (/questionable|^q$/.test(s)) return 0.75
  if (/day.to.day|dtd/.test(s)) return 0.85
  return 1
}

// a week's dates for a league: ySFFL weeks run Tuesday–Monday, the others Monday–Sunday
export function weekDays(season: string, sport: string, week: number): string[] {
  const r = weekDateRange(season, week), off = sport === 'NFL' ? 1 : 0, out: string[] = []
  for (let i = 0; i < 7; i++) out.push(iso(new Date(r.start.getFullYear(), r.start.getMonth(), r.start.getDate() + off + i)))
  return out
}

// can a player with these positions fill this lineup slot? (UTIL is skaters-only in ySFHL and
// hitters-only in ySFLB)
function fits(sport: string, positions: string[], slot: string): boolean {
  if (slot === 'UTIL') {
    if (sport === 'NHL') return positions.some(p => p !== 'G')
    if (sport === 'MLB') return positions.some(p => !['SP', 'RP', 'P'].includes(p))
    return true
  }
  if (slot === 'RB/WR/TE') return positions.some(p => ['RB', 'WR', 'TE'].includes(p))
  if (slot === 'DEF') return positions.some(p => ['DEF', 'DST', 'D/ST'].includes(p))
  if (slot === 'OF') return positions.some(p => ['OF', 'LF', 'CF', 'RF'].includes(p))
  return positions.includes(slot)
}

// ── 1. players ──────────────────────────────────────────────────────────────
export type PlayerRate = { playerId: string; sport: string; name: string; team: string | null; positions: string[]; avail: number; ppg: number; stats: Record<string, number>; gp: number; ext: string | null; owner: string | null; slot: string | null }

export async function playerRates(season: string, now = new Date()) {
  const [league] = await db.select().from(leagues).where(eq(leagues.id, YSF_LEAGUE_ID)).limit(1)
  const scoring = safeParse<Record<string, Record<string, number>>>(league.scoringSettings, {})
  const rows = db.all<{ id: string; name: string; sport: string; position: string; eligible: string | null; team: string | null; status: string | null; ext: string | null; gp: number | null; points: number | null; stats: string | null; owner: string | null; slot: string | null }>(sql`
    SELECT p.id, p.name, p.sport, p.position, p.eligible_positions eligible, p.real_team_abbr team, p.status, p.external_id ext,
      s.gp, s.points, s.stats, r.team_id owner, r.slot
    FROM players p
    LEFT JOIN player_season_stats s ON s.player_id = p.id AND s.league_id = ${YSF_LEAGUE_ID} AND s.season = ${season}
    LEFT JOIN rosters r ON r.player_id = p.id AND r.team_id IN (SELECT id FROM teams WHERE league_id = ${YSF_LEAGUE_ID})
    WHERE p.sport IN ('NFL','NHL','NBA','MLB') AND (s.gp > 0 OR r.team_id IS NOT NULL)`)
  // position averages per game (players with a real sample), the prior every rate is shrunk toward
  const prior = new Map<string, { ppg: number; stats: Record<string, number> }>()
  const groups = new Map<string, typeof rows>()
  for (const r of rows) if ((r.gp ?? 0) >= 3) { const k = `${r.sport}|${r.position}`; groups.set(k, [...(groups.get(k) ?? []), r]) }
  for (const [k, g] of groups) {
    const gp = g.reduce((a, r) => a + (r.gp ?? 0), 0)
    const st: Record<string, number> = {}
    for (const r of g) for (const [s, v] of Object.entries(safeParse<Record<string, number>>(r.stats, {}))) st[s] = (st[s] ?? 0) + v
    // the prior is a replacement-level player: the bottom half of the position by points per game
    const sorted = [...g].sort((a, b) => (a.points ?? 0) / (a.gp || 1) - (b.points ?? 0) / (b.gp || 1)).slice(0, Math.max(1, Math.ceil(g.length / 2)))
    const ppg = sorted.reduce((a, r) => a + (r.points ?? 0) / (r.gp || 1), 0) / sorted.length
    prior.set(k, { ppg, stats: Object.fromEntries(Object.entries(st).map(([s, v]) => [s, v / gp * (ppg / Math.max(0.01, g.reduce((a, r) => a + (r.points ?? 0), 0) / gp))])) })
  }
  // recent form: the last 21 days of game logs, scored with the league's scoring
  const recent = new Map<string, { pts: number; g: number }>()
  const to = iso(now), from = iso(new Date(now.getTime() - 21 * 86_400_000))
  for (const sp of SPORTS) {
    try {
      for (const l of loadGameLines(sp as Sport, from, to, scoring[sp] ?? {}, false)) {
        for (const k of [l.tankId, `n:${sp}:${l.name.toLowerCase()}`]) { const x = recent.get(k) ?? { pts: 0, g: 0 }; x.pts += l.pts; x.g += 1; recent.set(k, x) }
      }
    } catch { /* no game logs for this league */ }
  }
  // last season, from its lineup history: points per game played, for players with no games yet this
  // season (ySFLB before Opening Day) — a better starting point than the position average
  const y0 = parseInt(season.slice(0, 4)), lastSeason = `${y0 - 1}-${String(y0).slice(2)}`
  const last = new Map(db.all<{ sport: string; name: string; pts: number; g: number }>(sql`
    SELECT sport, name, SUM(COALESCE(engine_pts, fpts, 0)) pts, SUM(CASE WHEN opp IS NOT NULL AND opp != '' THEN 1 ELSE 0 END) g
    FROM fantrax_player_periods WHERE season = ${lastSeason} GROUP BY sport, name`).filter(r => r.g >= 5).map(r => [`${r.sport}|${r.name}`, r.pts / r.g]))
  const out = new Map<string, PlayerRate>()
  for (const r of rows) {
    const positions = (() => { const e = safeParse<string[]>(r.eligible, []); return e.length ? e : [r.position] })()
    const pr = prior.get(`${r.sport}|${r.position}`) ?? { ppg: 0, stats: {} }
    const gp = r.gp ?? 0, m = SHRINK[r.sport] ?? 8
    const own = gp ? (r.points ?? 0) / gp : 0
    const start = last.get(`${r.sport}|${r.name}`) ?? pr.ppg
    let ppg = (own * gp + start * m) / (gp + m)
    const rec = (r.ext && recent.get(r.ext)) || recent.get(`n:${r.sport}:${r.name.toLowerCase()}`)
    if (rec && rec.g >= 2) ppg = (1 - RECENT_WEIGHT) * ppg + RECENT_WEIGHT * (rec.pts / rec.g)
    const st = safeParse<Record<string, number>>(r.stats, {})
    const keys = new Set([...Object.keys(st), ...Object.keys(pr.stats)])
    const stats = Object.fromEntries([...keys].map(k => [k, ((st[k] ?? 0) + (pr.stats[k] ?? 0) * m) / (gp + m)]))
    out.set(r.id, { playerId: r.id, sport: r.sport, name: r.name, team: r.team, positions, avail: availability(r.status), ppg, stats, gp, ext: r.ext, owner: r.owner, slot: r.slot })
  }
  return { rates: out, scoring }
}

// the pro schedule as date → teams playing, per league
export function scheduleIndex(): Map<string, Map<string, Set<string>>> {
  const idx = new Map<string, Map<string, Set<string>>>()
  for (const g of db.all<{ sport: string; d: string; h: string; a: string }>(sql`SELECT sport, game_date d, home_abbr h, away_abbr a FROM game_schedule`)) {
    const s = idx.get(g.sport) ?? new Map<string, Set<string>>(); idx.set(g.sport, s)
    const d = `${g.d.slice(0, 4)}-${g.d.slice(4, 6)}-${g.d.slice(6, 8)}`
    const t = s.get(d) ?? new Set<string>(); s.set(d, t); t.add(g.h); t.add(g.a)
  }
  return idx
}

export type PlayerWeek = { playerId: string; week: number; games: number; pts: number; stats: Record<string, number>; source: 'model' | 'model+tank01' }

// one player's projection for one week
// a week with no pro schedule loaded yet (ySFLB in the offseason): a typical week of games for everyone
const TYPICAL_GAMES: Record<string, number> = { NFL: 1, NBA: 4, NHL: 4, MLB: 6 }
export function projectPlayer(p: PlayerRate, days: string[], sched: Map<string, Set<string>> | undefined, tank?: { pts: number; stats: Record<string, number> }): PlayerWeek & { perDay: Record<string, number> } {
  const known = days.some(d => sched?.get(d)?.size)
  const playing = known ? days.filter(d => p.team && sched?.get(d)?.has(p.team)) : p.team ? days.slice(0, TYPICAL_GAMES[p.sport] ?? 3) : []
  const games = playing.length
  const perGame = p.ppg * p.avail
  let pts = perGame * games
  let stats = Object.fromEntries(Object.entries(p.stats).map(([k, v]) => [k, +(v * games * p.avail).toFixed(2)]))
  let source: PlayerWeek['source'] = 'model'
  if (tank && games) { pts = 0.5 * pts + 0.5 * tank.pts * p.avail; stats = Object.fromEntries(Object.keys({ ...stats, ...tank.stats }).map(k => [k, +((0.5 * (stats[k] ?? 0) + 0.5 * (tank.stats[k] ?? 0) * p.avail)).toFixed(2)])); source = 'model+tank01' }
  return { playerId: p.playerId, week: 0, games, pts: +pts.toFixed(2), stats, source, perDay: Object.fromEntries(playing.map(d => [d, games ? pts / games : 0])) }
}

// ── 2. clubs ────────────────────────────────────────────────────────────────
// the best lineup a roster can field: most-restrictive slots first, best available player in each
function bestLineup(sport: string, slots: Record<string, number>, players: { positions: string[]; v: number }[]): number {
  const open = Object.entries(slots).filter(([k, n]) => !RESERVE.includes(k) && n > 0)
    .sort(([a], [b]) => players.filter(p => fits(sport, p.positions, a)).length - players.filter(p => fits(sport, p.positions, b)).length)
  const used = new Set<number>()
  let total = 0
  for (const [slot, n] of open) for (let i = 0; i < n; i++) {
    let best = -1
    players.forEach((p, j) => { if (!used.has(j) && p.v > 0 && fits(sport, p.positions, slot) && (best < 0 || p.v > players[best].v)) best = j })
    if (best >= 0) { used.add(best); total += players[best].v }
  }
  return total
}

export function clubWeek(sport: string, cadence: string, slots: Record<string, number>, roster: { rate: PlayerRate; proj: ReturnType<typeof projectPlayer> }[], days: string[]): number {
  const act = roster.filter(r => !['IR', 'TAXI'].includes(r.rate.slot ?? ''))
  if (cadence !== 'DAILY') return bestLineup(sport, slots, act.map(r => ({ positions: r.rate.positions, v: r.proj.pts })))
  return days.reduce((sum, d) => sum + bestLineup(sport, slots, act.map(r => ({ positions: r.rate.positions, v: r.proj.perDay[d] ?? 0 }))), 0)
}

// ── 3 & 4. matchups and the season ─────────────────────────────────────────
function randn() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
const normCdf = (x: number) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p }

export type ModelOut = {
  generatedAt: string; season: string; sims: number
  leagues: Record<string, {
    clubs: Record<string, { mu: number; sd: number; playoff: number; title: number; expFinish: number; byFinish: number[] }>
    matchups: Record<string, { homeWin: number; homeMu: number; awayMu: number }>
  }>
  cup: Record<string, { exp: number; sd: number; win: number; top3: number }>
}

export async function runModel(sims = 10000, now = new Date()): Promise<ModelOut> {
  const [league] = await db.select().from(leagues).where(eq(leagues.id, YSF_LEAGUE_ID)).limit(1)
  const season = league.season
  const slotsAll = safeParse<Record<string, Record<string, number>>>(league.rosterSettings, {})
  const cadence = safeParse<Record<string, string>>(league.lineupCadence, {})
  const regWeeks = safeParse<Record<string, number>>(league.regularSeasonWeeks, {})
  const playoffTeams = league.playoffTeams ?? 6
  const { rates, scoring } = await playerRates(season, now)
  const sched = scheduleIndex()
  const teamIds = db.all<{ id: string }>(sql`SELECT id FROM teams WHERE league_id = ${YSF_LEAGUE_ID} AND archived = 0`).map(t => t.id)
  const ms = db.all<{ id: string; sport: string; week: number; h: string; a: string | null; hs: number | null; as_: number | null; done: number; po: number }>(sql`
    SELECT id, sport, week, home_team_id h, away_team_id a, home_score hs, away_score as_, is_complete done, is_playoff po FROM matchups WHERE league_id = ${YSF_LEAGUE_ID} AND season = ${season}`)
  const today = iso(now)
  const out: ModelOut = { generatedAt: now.toISOString(), season, sims, leagues: {}, cup: {} }
  const playerWeeks: (PlayerWeek & { season: string })[] = []
  const finishes: Record<string, Int16Array> = {}   // sport → sims × clubs finishing positions
  const cupPts = new Map(teamIds.map(t => [t, new Float64Array(sims)]))

  for (const sp of SPORTS) {
    const sm = ms.filter(m => m.sport === sp && m.a)
    if (!sm.length) continue
    const slots = slotsAll[sp] ?? {}
    const rosterOf = (tid: string) => [...rates.values()].filter(r => r.sport === sp && r.owner === tid)
    const remainingWeeks = [...new Set(sm.filter(m => !m.done).map(m => m.week))].sort((a, b) => a - b)
    const firstWeek = Math.min(...sm.map(m => m.week))
    // Tank01's weekly projections for the next two ySFFL weeks
    const tank: Record<number, Record<string, any>> = {}
    if (sp === 'NFL' && tank01Configured()) for (const w of remainingWeeks.slice(0, 2)) { try { tank[w] = await tank01WeekProjections('NFL', w - firstWeek + 1, season) } catch { /* averages only */ } }
    // club projections for every remaining week (and an average for playoff weeks)
    const mu = new Map<string, Map<number, number>>()
    for (const tid of teamIds) mu.set(tid, new Map())
    for (const w of remainingWeeks) {
      const days = weekDays(season, sp, w)
      for (const tid of teamIds) {
        const roster = rosterOf(tid).map(rate => {
          const raw = sp === 'NFL' && rate.ext ? tank[w]?.[rate.ext] : undefined
          const t = raw ? (() => { const st = deriveWeekly(sp, mapBoxScoreBase(sp, raw)); return { pts: scorePlayer(st, scoring[sp] ?? {}), stats: st } })() : undefined
          const proj = projectPlayer(rate, days, sched.get(sp), t)
          if (w === remainingWeeks[0] || w === remainingWeeks[1]) playerWeeks.push({ ...proj, week: w, season })
          return { rate, proj }
        })
        mu.get(tid)!.set(w, clubWeek(sp, cadence[sp] ?? 'WEEKLY', slots, roster, days))
      }
    }
    // calibration: the best-possible lineups above run high against what clubs actually score, so each
    // league's projections are scaled to its real average this season (last season's before Opening Day)
    {
      const y0 = parseInt(season.slice(0, 4)), lastSeason = `${y0 - 1}-${String(y0).slice(2)}`
      const actual = (sea: string) => db.all<{ n: number; m: number }>(sql`SELECT COUNT(*) n, AVG((home_score + away_score) / 2.0) m FROM matchups WHERE league_id = ${YSF_LEAGUE_ID} AND season = ${sea} AND sport = ${sp} AND is_complete = 1 AND is_playoff = 0`)[0]
      const cur = actual(season), prev = actual(lastSeason)
      const target = cur.n >= 4 ? cur.m : prev.n >= 4 ? prev.m : 0
      const proj = [...mu.values()].flatMap(x => [...x.values()]).filter(v => v > 0)
      const pm = proj.length ? proj.reduce((a, b) => a + b, 0) / proj.length : 0
      const k = target && pm ? Math.min(1.25, Math.max(0.6, target / pm)) : 1
      for (const x of mu.values()) for (const [w, v] of x) x.set(w, v * k)
    }
    // spread: each club's own week-to-week scoring (shrunk toward the league's), as a share of its mean
    const scores = new Map<string, number[]>()
    for (const m of sm.filter(m => m.done)) { scores.set(m.h, [...(scores.get(m.h) ?? []), m.hs ?? 0]); scores.set(m.a!, [...(scores.get(m.a!) ?? []), m.as_ ?? 0]) }
    const cv = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return m ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)) / m : 0.25 }
    const all = [...scores.values()].flat(), leagueCv = all.length > 4 ? cv(all) : 0.25
    const cvOf = (tid: string) => { const xs = scores.get(tid) ?? []; return xs.length >= 4 ? (cv(xs) * xs.length + leagueCv * 6) / (xs.length + 6) : leagueCv }
    const avgMu = (tid: string) => { const v = [...mu.get(tid)!.values()].filter(x => x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : (scores.get(tid)?.reduce((a, b) => a + b, 0) ?? 0) / Math.max(1, scores.get(tid)?.length ?? 1) }
    // the share of the current week already played (daily leagues by days; ySFFL by games kicked off)
    const elapsed = (w: number) => { const d = weekDays(season, sp, w); return d.filter(x => x < today).length / d.length }

    // matchups still to finish: win probability with points already on the board
    const L: ModelOut['leagues'][string] = { clubs: {}, matchups: {} }
    for (const m of sm.filter(m => !m.done)) {
      const f = elapsed(m.week), mh = mu.get(m.h)?.get(m.week) ?? avgMu(m.h), ma = mu.get(m.a!)?.get(m.week) ?? avgMu(m.a!)
      const hMu = (m.hs ?? 0) + mh * (1 - f), aMu = (m.as_ ?? 0) + ma * (1 - f)
      const sd = Math.sqrt((mh * cvOf(m.h)) ** 2 + (ma * cvOf(m.a!)) ** 2) * Math.sqrt(Math.max(0.05, 1 - f))
      L.matchups[m.id] = { homeWin: +normCdf((hMu - aMu) / Math.max(1, sd)).toFixed(4), homeMu: +hMu.toFixed(1), awayMu: +aMu.toFixed(1) }
    }

    // the season, many times over
    const base = new Map(teamIds.map(t => [t, { w: 0, l: 0, pf: 0 }]))
    for (const m of sm.filter(m => m.done && !m.po)) {
      const h = base.get(m.h)!, a = base.get(m.a!)!
      h.pf += m.hs ?? 0; a.pf += m.as_ ?? 0
      if ((m.hs ?? 0) > (m.as_ ?? 0)) { h.w++; a.l++ } else if ((m.as_ ?? 0) > (m.hs ?? 0)) { a.w++; h.l++ }
    }
    const regLeft = sm.filter(m => !m.done && !m.po)
    const fin = new Int16Array(sims * teamIds.length)
    const playoff = new Map(teamIds.map(t => [t, 0])), title = new Map(teamIds.map(t => [t, 0]))
    const draw = (tid: string, w: number | null, curScore: number | null, f: number) => {
      const m0 = (w != null ? mu.get(tid)?.get(w) : undefined) ?? avgMu(tid)
      return Math.max(0, (curScore ?? 0) + m0 * (1 - f) + randn() * m0 * cvOf(tid) * Math.sqrt(Math.max(0.05, 1 - f)))
    }
    const regDone = !regLeft.length
    for (let n = 0; n < sims; n++) {
      const st = new Map([...base].map(([k, v]) => [k, { ...v }]))
      for (const m of regLeft) {
        const f = elapsed(m.week)
        const hs = draw(m.h, m.week, m.hs, f), as = draw(m.a!, m.week, m.as_, f)
        const h = st.get(m.h)!, a = st.get(m.a!)!
        h.pf += hs; a.pf += as
        if (hs >= as) { h.w++; a.l++ } else { a.w++; h.l++ }
      }
      const ranked = [...teamIds].sort((x, y) => (st.get(y)!.w - st.get(x)!.w) || (st.get(y)!.pf - st.get(x)!.pf))
      const finish = new Map<string, number>()
      if (regLeft.length || !regDone || (regWeeks[sp] && ranked.length)) {
        // the bracket: 3 v 6 and 4 v 5; semifinals reseeded (1 plays the lowest seed left); final,
        // 3rd-place game, 5th-place game; everyone else by regular-season place
        const seeds = ranked.slice(0, playoffTeams)
        const g = (a: string, b: string) => draw(a, null, null, 0) >= draw(b, null, null, 0) ? [a, b] : [b, a]
        if (seeds.length >= 6) {
          const [w36, l36] = g(seeds[2], seeds[5]), [w45, l45] = g(seeds[3], seeds[4])
          const [w5] = g(l36, l45); finish.set(w5, 5); finish.set(w5 === l36 ? l45 : l36, 6)
          const rest = [w36, w45].sort((a, b) => seeds.indexOf(b) - seeds.indexOf(a))  // lowest seed first
          const [s1, l1] = g(seeds[0], rest[0]), [s2, l2] = g(seeds[1], rest[1])
          const [champ, runner] = g(s1, s2), [third, fourth] = g(l1, l2)
          finish.set(champ, 1); finish.set(runner, 2); finish.set(third, 3); finish.set(fourth, 4)
          seeds.forEach(t => playoff.set(t, playoff.get(t)! + 1)); title.set(champ, title.get(champ)! + 1)
        }
        ranked.forEach((t, i) => { if (!finish.has(t)) finish.set(t, i + 1) })
      }
      teamIds.forEach((t, i) => { const p = finish.get(t) ?? 12; fin[n * teamIds.length + i] = p; cupPts.get(t)![n] += teamIds.length + 1 - p })
    }
    finishes[sp] = fin
    for (const [i, t] of teamIds.entries()) {
      const by = new Array(teamIds.length).fill(0)
      for (let n = 0; n < sims; n++) by[fin[n * teamIds.length + i] - 1]++
      L.clubs[t] = { mu: +((mu.get(t)!.get(remainingWeeks[0]) ?? avgMu(t))).toFixed(1), sd: +(avgMu(t) * cvOf(t)).toFixed(1), playoff: +(playoff.get(t)! / sims).toFixed(4), title: +(title.get(t)! / sims).toFixed(4),
        expFinish: +(by.reduce((a, c, k) => a + c * (k + 1), 0) / sims).toFixed(2), byFinish: by.map(c => +(c / sims).toFixed(4)) }
    }
    out.leagues[sp] = L
  }

  // the Cup: each simulated season's points, then who comes out on top (ties split)
  const wins = new Map(teamIds.map(t => [t, 0])), top3 = new Map(teamIds.map(t => [t, 0]))
  for (let n = 0; n < sims; n++) {
    const order = [...teamIds].sort((a, b) => cupPts.get(b)![n] - cupPts.get(a)![n])
    const best = cupPts.get(order[0])![n], tied = order.filter(t => cupPts.get(t)![n] === best)
    for (const t of tied) wins.set(t, wins.get(t)! + 1 / tied.length)
    order.slice(0, 3).forEach(t => top3.set(t, top3.get(t)! + 1))
  }
  for (const t of teamIds) {
    const xs = cupPts.get(t)!, m = xs.reduce((a, b) => a + b, 0) / sims
    out.cup[t] = { exp: +m.toFixed(2), sd: +Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / sims).toFixed(2), win: +(wins.get(t)! / sims).toFixed(4), top3: +(top3.get(t)! / sims).toFixed(4) }
  }

  // store
  db.run(sql`CREATE TABLE IF NOT EXISTS ysf_player_proj (player_id TEXT NOT NULL, season TEXT NOT NULL, week INTEGER NOT NULL, games INTEGER NOT NULL, pts REAL NOT NULL, stats TEXT NOT NULL, source TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY (player_id, season, week))`)
  db.run(sql`CREATE TABLE IF NOT EXISTS ysf_model (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated TEXT NOT NULL)`)
  // free agents too (they have no club, so the club loop didn't reach them): this week and next
  for (const sp of SPORTS) {
    const weeks = [...new Set(ms.filter(m => m.sport === sp && !m.done).map(m => m.week))].sort((a, b) => a - b).slice(0, 2)
    for (const w of weeks) { const days = weekDays(season, sp, w); for (const r of rates.values()) if (r.sport === sp && !r.owner) playerWeeks.push({ ...projectPlayer(r, days, sched.get(sp)), week: w, season }) }
  }
  db.transaction(tx => {
    tx.run(sql`DELETE FROM ysf_player_proj WHERE season = ${season}`)
    for (const p of playerWeeks) tx.run(sql`INSERT OR REPLACE INTO ysf_player_proj VALUES (${p.playerId}, ${season}, ${p.week}, ${p.games}, ${p.pts}, ${JSON.stringify(p.stats)}, ${p.source}, ${out.generatedAt})`)
    tx.run(sql`INSERT OR REPLACE INTO ysf_model (id, data, updated) VALUES (1, ${JSON.stringify(out)}, ${out.generatedAt})`)
  })
  return out
}

export function loadModel(): ModelOut | null {
  try { const r = db.all<{ data: string }>(sql`SELECT data FROM ysf_model WHERE id = 1`)[0]; return r ? JSON.parse(r.data) : null } catch { return null }
}
export function playerProjection(playerId: string, season: string, week: number): { games: number; pts: number; stats: Record<string, number>; source: string } | null {
  try { const r = db.all<any>(sql`SELECT games, pts, stats, source FROM ysf_player_proj WHERE player_id = ${playerId} AND season = ${season} AND week = ${week}`)[0]; return r ? { ...r, stats: JSON.parse(r.stats) } : null } catch { return null }
}
