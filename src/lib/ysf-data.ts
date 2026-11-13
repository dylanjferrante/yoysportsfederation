// Server-side data for the ySF Site Redesign pages (Home, Standings, Scores), from the Nexus DB.
import { db } from '@/db'
import { teams, teamRecords, matchups, activity } from '@/db/schema'
import { and, eq, desc, sql } from 'drizzle-orm'
import { safeParse } from '@/lib/utils'
import { rankWithinSport } from '@/lib/federation'
import { simulateSeason } from '@/lib/odds'
import { weekDateRange } from '@/lib/defaults'
import { YSF_LEAGUES, YSF_LEAGUE_ID, clubInk } from '@/lib/ysf'
import { loadModel } from '@/lib/ysf-model'

export type ClubInfo = { id: string; name: string; abbreviation: string; logo: string | null; altLogo: string | null; color: string | null; ink: string }
export type LeagueRow = { teamId: string; rk: number; rec: string; w: number; l: number; gb: number; pf: number; faab: number; fed: number; po: number; title: number }
export type CupRow = { teamId: string; rk: number; pts: number; rec: string; w: number; l: number; ranks: Record<string, number | null>; cupPct: number; exp: number }

export async function loadClubs(leagueId: string): Promise<Record<string, ClubInfo>> {
  const rows = await db.select().from(teams).where(and(eq(teams.leagueId, leagueId), eq(teams.archived, false)))
  return Object.fromEntries(rows.map(c => [c.id, { id: c.id, name: c.name, abbreviation: c.abbreviation, logo: c.logo, altLogo: c.altLogo, color: c.primaryColor, ink: clubInk(c.primaryColor, c.secondaryColor) }]))
}

// Fed Cup table + the four league tables, with season-simulator odds.
export async function loadStandings(league: any) {
  const season = league.season
  const clubs = await loadClubs(league.id)
  const ids = Object.keys(clubs), n = ids.length
  const recs = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, league.id), eq(teamRecords.season, season)))
  const ms = await db.select().from(matchups).where(and(eq(matchups.leagueId, league.id), eq(matchups.season, season)))
  const tables: Record<string, LeagueRow[]> = {}
  const started: Record<string, boolean> = {}
  for (const L of YSF_LEAGUES) {
    const rows = recs.filter(r => r.sport === L.sport && ids.includes(r.teamId)).map(r => ({ teamId: r.teamId, wins: r.wins ?? 0, losses: r.losses ?? 0, ties: r.ties ?? 0, pointsFor: r.pointsFor ?? 0, faab: r.faabRemaining ?? 0 }))
    started[L.sport] = rows.some(r => r.wins + r.losses + r.ties > 0)
    const ranked = rankWithinSport(rows), lead = ranked[0]
    tables[L.sport] = ranked.map(r => ({ teamId: r.teamId, rk: r.position, rec: `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`, w: r.wins, l: r.losses,
      gb: lead ? ((lead.wins - r.wins) + (r.losses - lead.losses)) / 2 : 0, pf: r.pointsFor, faab: r.faab, fed: started[L.sport] ? n + 1 - r.position : 0, po: 0, title: 0 }))
  }
  const fs = { placement: Array.from({ length: n }, (_, i) => n - i), championBonus: 0, regularSeasonBonus: 0, includedSports: YSF_LEAGUES.map(l => l.sport) }
  const odds = simulateSeason(YSF_LEAGUES.map(L => ({
    sport: L.sport, playoffTeams: league.playoffTeams ?? 6,
    teams: recs.filter(r => r.sport === L.sport).map(r => ({ teamId: r.teamId, wins: r.wins ?? 0, pointsFor: r.pointsFor ?? 0, games: (r.wins ?? 0) + (r.losses ?? 0) + (r.ties ?? 0) })),
    remaining: ms.filter(m => m.sport === L.sport && !m.isComplete && !m.isPlayoff && m.awayTeamId).map(m => ({ home: m.homeTeamId, away: m.awayTeamId! })),
  })), fs, fs.includedSports, 4000)
  // playoff and title odds: the ySF projection model when it has run, the quick simulation otherwise
  const model = loadModel()
  for (const L of YSF_LEAGUES) for (const r of tables[L.sport]) {
    const mc = model && model.season === season ? model.leagues[L.sport]?.clubs[r.teamId] : undefined
    r.po = mc ? mc.playoff : odds.perSport[L.sport]?.playoff[r.teamId] ?? 0
    r.title = mc ? mc.title : odds.perSport[L.sport]?.title[r.teamId] ?? 0
  }
  // Cup odds come from ysffantasy.com's own projection (10,000-trial model), so the app and the
  // site always agree; Nexus's simulator is only a fallback if the feed can't be reached.
  const site = await siteCupProjection()
  const byAbbr = new Map((site?.teams ?? []).map((t: any) => [String(t.abbr), t]))
  const cup: CupRow[] = ids.map(id => {
    let pts = 0, w = 0, l = 0
    const ranks: Record<string, number | null> = {}
    for (const L of YSF_LEAGUES) {
      const r = tables[L.sport].find(x => x.teamId === id)
      ranks[L.sport] = started[L.sport] && r ? r.rk : null
      if (started[L.sport] && r) { pts += r.fed; w += r.w; l += r.l }
    }
    const t: any = byAbbr.get(clubs[id].abbreviation)
    return { teamId: id, pts, rec: `${w}-${l}`, w, l, ranks, cupPct: t ? Number(t.p_win_fed_cup) || 0 : (odds.federation[id] ?? 0), exp: t ? Number(t.expected_fed_pts) || 0 : (odds.fedPoints[id] ?? 0), rk: 0 }
  }).sort((a, b) => cupOrder(a, b)).map((r, i) => ({ ...r, rk: i + 1 }))
  // Comm. Res. IX tiebreakers (passed Jul 23, 2026), after Federation points:
  //   most 1st-place finishes, then most 2nd-or-better, … through 11th-or-better;
  //   then combined win percentage; then head-to-head matchups won among the tied clubs
  function finishes(r: CupRow) { return Object.values(r.ranks).filter((x): x is number => x != null) }
  function cupOrder(a: CupRow, b: CupRow) {
    if (b.pts !== a.pts) return b.pts - a.pts
    const fa = finishes(a), fb = finishes(b)
    for (let k = 1; k <= 11; k++) { const d = fb.filter(x => x <= k).length - fa.filter(x => x <= k).length; if (d) return d }
    const pct = (r: CupRow) => { const g = r.w + r.l + ties(r.teamId); return g ? (r.w + ties(r.teamId) / 2) / g : 0 }
    return pct(b) - pct(a)
  }
  function ties(id: string) { return YSF_LEAGUES.reduce((t, L) => t + (started[L.sport] ? (recs.find(r => r.sport === L.sport && r.teamId === id)?.ties ?? 0) : 0), 0) }
  // head-to-head among clubs still level after the steps above, across every league's completed matchups
  const done = ms.filter(m => m.isComplete && m.awayTeamId && m.homeScore != null && m.awayScore != null)
  for (let i = 0; i < cup.length;) {
    let j = i + 1
    while (j < cup.length && cupOrder(cup[i], cup[j]) === 0) j++
    if (j - i > 1) {
      const grp = new Set(cup.slice(i, j).map(r => r.teamId))
      const h2h = (id: string) => done.filter(m => grp.has(m.homeTeamId) && grp.has(m.awayTeamId!) && (m.homeTeamId === id ? m.homeScore! > m.awayScore! : m.awayTeamId === id && m.awayScore! > m.homeScore!)).length
      const sorted = cup.slice(i, j).sort((a, b) => h2h(b.teamId) - h2h(a.teamId))
      cup.splice(i, j - i, ...sorted)
    }
    i = j
  }
  cup.forEach((r, i) => { r.rk = i + 1 })
  const live = YSF_LEAGUES.filter(L => started[L.sport]).map(L => L.sport)
  return { clubs, tables, cup, live, season }
}

// ySF's own period numbering (Week 10 / Period 7) from the federation week.
export function periodLabel(league: any, sport: string, week: number) {
  const sched = safeParse<{ sport: string; startWeek: number }[]>(league.sportSchedule, [])
  const s = sched.find(x => x.sport === sport)
  const n = s ? week - s.startWeek + 1 : week
  return `${sport === 'NFL' ? 'Week' : 'Period'} ${n}`
}

export type PairLine = { sport: string; label: string; status: 'LIVE' | 'FINAL' | 'UPCOMING'; a: number | null; b: number | null; matchupId: string; season?: string }
export type Pairing = { a: string; b: string; lines: PairLine[]; summary: string }

// One card per club pairing for a federation week, every league's score stacked.
// Federation weeks are numbered per season from the week its first games are played (Week 1),
// and a week also carries the prior season's games still running then (ySFLB ends in September,
// after the new football season has started).
const SITE_KEY: Record<string, string> = { NFL: 'ysf_fl', NHL: 'ysf_hl', NBA: 'ysf_ba', MLB: 'ysf_lb' }
// A past season's matchups are stored by each league's own period; place them on that season's
// federation calendar (Mon–Sun weeks) from the periods' real dates. A two-week period covers both weeks.
export async function pastSeasonWeeks(season: string) {
  const anchor = weekDateRange(season, 1).start.getTime()
  const fw = (iso: string) => Math.floor((new Date(iso + 'T12:00:00').getTime() - anchor) / (7 * 86_400_000)) + 1
  const periodWeeks: Record<string, Record<number, number[]>> = {}
  const all = new Set<number>()
  for (const L of YSF_LEAGUES) {
    const arch = await leagueFeed<any>(SITE_KEY[L.sport], season)
    const pm = (arch?.schedule_meta?.periods ?? {}) as Record<string, { start: string; end: string }>
    const map: Record<number, number[]> = {}
    for (const [p, d] of Object.entries(pm)) {
      if (!d?.start) continue
      // a period of 11 days or fewer is one week: the Monday–Sunday week holding most of its days (so a
      // Thursday–Wednesday ySFFL week of 2025–26 sits in the week it started). A longer one spans each
      // week it covers for at least four days.
      const day = (iso: string) => Math.floor((new Date(iso + 'T12:00:00').getTime() - anchor) / 86_400_000)
      const d0 = day(d.start), d1 = day(d.end ?? d.start)
      const cover = (w: number) => Math.min(d1, (w - 1) * 7 + 6) - Math.max(d0, (w - 1) * 7) + 1
      const span = [] as number[]
      for (let w = fw(d.start); w <= fw(d.end ?? d.start); w++) span.push(w)
      const ws = d1 - d0 + 1 > 11 ? span.filter(w => cover(w) >= 4)
        : [span.reduce((best, w) => cover(w) > cover(best) ? w : best, span[0])]
      if (!ws.length) ws.push(fw(d.start))
      ws.forEach(w => all.add(w))
      map[Number(p)] = ws
    }
    periodWeeks[L.sport] = map
  }
  const weeks = [...all].sort((a, b) => a - b)
  return { periodWeeks, weeks, num: (x: number) => x - (weeks[0] ?? 1) + 1 }
}

export async function loadWeek(league: any, week?: number, seasonArg?: string) {
  if (seasonArg && seasonArg !== league.season) return loadPastWeek(league, seasonArg, week)
  const season = league.season
  const ms = await db.select().from(matchups).where(and(eq(matchups.leagueId, league.id), eq(matchups.season, season)))
  const curWeek = Math.min(...ms.filter(m => !m.isComplete).map(m => m.week), Infinity)
  const thisWeek = Number.isFinite(curWeek) ? curWeek : Math.max(...ms.map(m => m.week))
  const weeks = [...new Set(ms.map(m => m.week))].sort((a, b) => a - b)
  const first = weeks[0] ?? 1
  const num = (x: number) => x - first + 1
  const w = week != null ? week + first - 1 : thisWeek   // `week` is the season's own week number (Week 1 = first games)
  const now = Date.now()
  const { start, end } = weekDateRange(season, w)
  const pairs = new Map<string, Pairing>()
  const add = (m: typeof ms[number], sport: string, label: string, status: PairLine['status'], lineSeason?: string) => {
    const [a, b] = [m.homeTeamId, m.awayTeamId!].sort()
    const key = a + '|' + b
    const p = pairs.get(key) ?? { a: m.homeTeamId, b: m.awayTeamId!, lines: [], summary: '' }
    const sa = m.homeTeamId === p.a ? m.homeScore : m.awayScore, sb = m.homeTeamId === p.a ? m.awayScore : m.homeScore
    const blank = status === 'UPCOMING' || (!m.isComplete && !(sa || sb))
    p.lines.push({ sport, label, status, a: blank ? null : sa ?? 0, b: blank ? null : sb ?? 0, matchupId: m.id, season: lineSeason })
    pairs.set(key, p)
  }
  for (const L of YSF_LEAGUES) {
    for (const m of ms.filter(x => x.sport === L.sport && x.week === w && x.awayTeamId)) {
      const status: PairLine['status'] = m.isComplete ? 'FINAL' : start.getTime() > now ? 'UPCOMING' : 'LIVE'
      add(m, L.sport, periodLabel(league, L.sport, w), status)
    }
  }
  // the prior season's games in these dates (2025-26 matchups are stored by period; dates from its archive)
  const y0 = parseInt(season.slice(0, 4))
  const prev = `${y0 - 1}-${String(y0).slice(2)}`
  const dayIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const [lo, hi] = [dayIso(start), dayIso(end)]
  const KEYS: Record<string, string> = { NFL: 'ysf_fl', NHL: 'ysf_hl', NBA: 'ysf_ba', MLB: 'ysf_lb' }
  const prevMs = await db.select().from(matchups).where(and(eq(matchups.leagueId, league.id), eq(matchups.season, prev)))
  for (const L of YSF_LEAGUES) {
    if (!prevMs.some(m => m.sport === L.sport)) continue
    const arch = await leagueFeed<any>(KEYS[L.sport], prev)
    const pm = (arch?.schedule_meta?.periods ?? {}) as Record<string, { start: string; end: string }>
    for (const [pid, d] of Object.entries(pm)) {
      if (!d?.start || d.start > hi || (d.end ?? d.start) < lo) continue
      for (const m of prevMs.filter(x => x.sport === L.sport && x.week === Number(pid) && x.awayTeamId))
        add(m, L.sport, `${L.sport === 'NFL' ? 'Week' : 'Period'} ${pid} · ${prev.replace('-', '–')}`, m.isComplete ? 'FINAL' : 'LIVE', prev)
    }
  }
  return { week: w, thisWeek, weeks, num, prev: weeks.filter(x => x < w).pop() ?? null, next: weeks.find(x => x > w) ?? null, pairings: [...pairs.values()] }
}

async function loadPastWeek(league: any, season: string, week?: number) {
  const { periodWeeks, weeks, num } = await pastSeasonWeeks(season)
  const first = weeks[0] ?? 1
  const last = weeks[weeks.length - 1] ?? 1
  const w = week != null ? week + first - 1 : last
  const ms = await db.select().from(matchups).where(and(eq(matchups.leagueId, league.id), eq(matchups.season, season)))
  const pairs = new Map<string, Pairing>()
  for (const L of YSF_LEAGUES) {
    for (const m of ms.filter(x => x.sport === L.sport && x.awayTeamId && (periodWeeks[L.sport]?.[x.week] ?? []).includes(w))) {
      const [a, b] = [m.homeTeamId, m.awayTeamId!].sort()
      const key = a + '|' + b
      const p = pairs.get(key) ?? { a: m.homeTeamId, b: m.awayTeamId!, lines: [], summary: '' }
      const sa = m.homeTeamId === p.a ? m.homeScore : m.awayScore, sb = m.homeTeamId === p.a ? m.awayScore : m.homeScore
      p.lines.push({ sport: L.sport, label: `${L.sport === 'NFL' ? 'Week' : 'Period'} ${m.week}${m.isPlayoff ? ' · Playoffs' : ''}`, status: m.isComplete ? 'FINAL' : 'LIVE', a: sa ?? 0, b: sb ?? 0, matchupId: m.id })
      pairs.set(key, p)
    }
  }
  return { week: w, thisWeek: last, weeks, num, prev: weeks.filter(x => x < w).pop() ?? null, next: weeks.find(x => x > w) ?? null, pairings: [...pairs.values()] }
}

export function seriesSummary(p: Pairing, ab: (id: string) => string) {
  let wa = 0, wb = 0
  // a series is one season's: the prior season's carry-over games don't count toward it
  const ls = p.lines.some(l => !l.season) ? p.lines.filter(l => !l.season) : p.lines
  for (const l of ls) { if (l.a == null || l.b == null || l.a === l.b) continue; if (l.a > l.b) wa++; else wb++ }
  const done = ls.every(l => l.status === 'FINAL')
  if (wa === wb) return wa ? `Tied ${wa}–${wb}` : '—'
  const lead = wa > wb ? ab(p.a) : ab(p.b)
  return `${lead} ${done ? 'wins' : 'leads'} ${Math.max(wa, wb)}–${Math.min(wa, wb)}`
}

const YSF_BASE = (process.env.YSF_BASE || 'https://ysffantasy.com').replace(/\/$/, '')
export async function siteFeed<T = any>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${YSF_BASE}/data/${path}`, { next: { revalidate: 600 } })
    return r.ok ? await r.json() : null
  } catch { return null }
}
// ── seasons, the ysffantasy.com way ─────────────────────────────────────────
// core.json pins the season each league is ON (`leagues[key].active_season`) and lists every season
// with its status. During the September overlap the leagues are on different seasons, so a league's
// data is always fetched FOR a season — never through the un-suffixed alias without checking that the
// league is on that season (the SEASON-IDENTITY rule in ysffantasy's CLAUDE.md).
type Core = { default_view_season?: string; seasons?: Record<string, { status?: string; current?: boolean; has_archive?: boolean }>; leagues?: Record<string, { active_season?: string; league_id?: string }> }
export const siteCore = () => siteFeed<Core>('core.json')
// the seasons ysffantasy.com knows, oldest first, and the ones that are finished (with archives)
export async function siteSeasons(): Promise<{ all: string[]; complete: string[]; current: string | null }> {
  const c = await siteCore()
  const all = Object.keys(c?.seasons ?? {}).sort()
  return { all, complete: all.filter(s => c?.seasons?.[s]?.status === 'complete' && c?.seasons?.[s]?.has_archive !== false), current: c?.default_view_season ?? all.find(s => c?.seasons?.[s]?.current) ?? null }
}
// one league's data for one season: while the league is on that season, its season-named file (then the
// alias, which is that season's only then); for any other season, that season's archive (then its
// season-named file). Never another season's data: if nothing matches, null.
export async function leagueFeed<T = any>(key: string, season: string): Promise<T | null> {
  const c = await siteCore()
  const lg = c?.leagues?.[key]
  const onIt = !c || lg?.active_season === season
  if (onIt) {
    const f = await siteFeed<any>(`league_${key}_${season}.json`)
    if (f) return f
    const alias = await siteFeed<any>(`league_${key}.json`)
    // the alias is "whatever season the league is on": keep it only if it is this league's current Fantrax league
    return alias && (!lg?.league_id || !alias.league_id || alias.league_id === lg.league_id) ? alias : null
  }
  return (await siteFeed<T>(`archives/${season}/${key}.json`)) ?? (await siteFeed<T>(`league_${key}_${season}.json`))
}
// the power rankings published for a season (the alias only when it is the season the site shows)
export async function powerRankingsFeed<T = any>(season: string): Promise<T | null> {
  const f = await siteFeed<T>(`power_rankings_${season}.json`)
  if (f) return f
  const c = await siteCore()
  return !c || c.default_view_season === season ? siteFeed<T>('power_rankings.json') : null
}
// the app's own current ySF season (the leagues row), for code that has no league object to hand
export async function ysfSeason(): Promise<string> {
  const r = db.all<{ season: string }>(sql`SELECT season FROM leagues WHERE id = ${YSF_LEAGUE_ID}`)[0]
  return r?.season ?? '2026-27'
}

export const siteCupProjection = () => siteFeed<{ generated_at: string; n_trials?: number; teams: any[]; leagues?: Record<string, any> }>('fed_cup_projection.json')
// ysffantasy.com keys clubs by owner id ('schoenfeld'); map them to Nexus team ids through the abbreviation.
export async function siteClubMap(clubs: Record<string, ClubInfo>): Promise<Record<string, string>> {
  const cup = await siteCupProjection()
  const byAbbr = new Map(Object.values(clubs).map(c => [c.abbreviation, c.id]))
  return Object.fromEntries((cup?.teams ?? []).map((t: any) => [t.team, byAbbr.get(t.abbr)]).filter(([, v]) => v)) as Record<string, string>
}

// Moves: signings, claims, releases and trades (structured activity rows).
export type MoveRow = { id: string; when: string; sport: string; teamId: string; kind: string; player: string; team: string; pos: string; bid: number | null; text: string; season: string; from?: string; via?: string; pick?: string }
export type TradeRow = { id: string; when: string; sides: { teamId: string; gets: { name: string; sport: string; team: string; pos: string }[] }[]; text: string; season: string }
// "Pick 2 (1.2)" (2025 Federation Draft) → "R1 · P2 (#2)"
const fedPick = (s: string) => { const m = /Pick (\d+) \((\d+)\.(\d+)\)/.exec(s); return m ? `R${m[2]} · P${+m[3]} (#${m[1]})` : s }
export async function loadMoves(leagueId: string, currentSeason = '2026-27') {
  const rows = await db.select().from(activity).where(eq(activity.leagueId, leagueId)).orderBy(desc(activity.createdAt)).limit(8000)
  const moves: MoveRow[] = [], trades: TradeRow[] = []
  for (const r of rows) {
    const d = safeParse<any>(r.data, null)
    const when = (r.createdAt ?? '').replace(' ', 'T')
    const season = d?.season ?? currentSeason
    if (r.type === 'TRADE' && d?.kind !== 'TRADED') { trades.push({ id: r.id, when, sides: d?.sides ?? [], text: r.message, season }); continue }
    if (!['WAIVER', 'ROSTER', 'DRAFT', 'TRADE'].includes(r.type) || d?.kind === 'LINEUP_CHANGE' || (r.type === 'DRAFT' && !d)) continue
    moves.push({ id: r.id, when, sport: d?.sport ?? '', teamId: r.teamId ?? '', kind: d?.kind ?? 'MOVE', player: d?.player ?? '', team: d?.team ?? '', pos: d?.pos ?? '', bid: d?.bid ?? null, text: d?.text ?? r.message, season, pick: d?.pick ? fedPick(d.pick) : undefined, from: d?.from ?? undefined })
  }
  // trades as Fantrax recorded them: every player and draft pick that changed hands
  const code = (sp: string) => YSF_LEAGUES.find(l => l.sport === sp)?.code ?? sp
  try {
    const tr = db.all<any>(sql`SELECT season, sport, fx_league_id, seq, from_team_id, to_team_id, name, pro_team, positions, pick, date FROM fantrax_trades WHERE executed = 1 AND deleted = 0 AND to_team_id IS NOT NULL`)
    // Fantrax spells some clubs out ("Athletic Club Ferrante"); show the official name
    const key = (n: string) => n.toLowerCase().replace(/athletic club|athletic sporting club/g, 'ac').replace(/sporting club/g, 'sc').replace(/fantasy club|football club/g, 'fc').replace(/[^a-z]/g, '')
    const official = new Map(db.all<{ name: string }>(sql`SELECT name FROM teams WHERE league_id = 'ysf'`).map(c => [key(c.name), c.name]))
    for (const t of tr) {
      let text = '', pick: string | undefined, via: string | undefined
      if (t.pick) {
        const m = /^(\d{4}) Draft Pick Round (\d+)(?: Pick (\d+))?(?: \((.+)\))?/.exec(t.pick)
        text = m ? `${m[1]} ${code(t.sport)} Rookie Draft pick` : t.pick
        if (m) pick = `R${m[2]}${m[3] ? ` · P${m[3]}` : ''}`
        if (m?.[4]) via = official.get(key(m[4])) ?? m[4]
      }
      moves.push({ id: `fxt-${t.fx_league_id}-${t.seq}`, when: t.date ?? '', sport: t.sport, teamId: t.to_team_id, kind: 'TRADED', player: t.pick ? '' : (t.name ?? ''), team: t.pro_team ?? '', pos: String(t.positions ?? '').split(/[,/]/).filter(Boolean).join('/'), bid: null, text, season: t.season, from: t.from_team_id ?? undefined, pick, via })
    }
  } catch { /* history not loaded */ }
  // rookie-draft selections (drafts run in the app)
  const picks = db.all<any>(sql`SELECT p.id, p.round, p.pick_number, p.current_team_id, p.original_team_id, d.scope, d.season, d.starts_at, pl.name, pl.real_team_abbr, pl.position, pl.eligible_positions
    FROM draft_picks p JOIN drafts d ON d.id = p.draft_id LEFT JOIN players pl ON pl.id = p.picked_player_id
    WHERE p.league_id = ${leagueId} AND d.status = 'COMPLETED' AND p.picked_player_id IS NOT NULL`)
  const per = new Map<string, number>()
  for (const p of picks) per.set(p.scope + p.season, Math.max(per.get(p.scope + p.season) ?? 0, p.round))
  for (const p of picks) {
    const n = Math.max(1, Math.round(picks.filter(x => x.scope === p.scope && x.season === p.season).length / Math.max(1, per.get(p.scope + p.season) ?? 1)))
    const inRound = ((p.pick_number - 1) % Math.max(1, n)) + 1
    const t = new Date(new Date(p.starts_at).getTime() + p.pick_number * 60_000)
    const elig = safeParse<string[]>(p.eligible_positions, [])
    moves.push({ id: `dp-${p.id}`, when: t.toISOString(), sport: p.scope, teamId: p.current_team_id, kind: 'DRAFTED', player: p.name ?? '', team: p.real_team_abbr ?? '', pos: elig.length ? elig.join('/') : p.position ?? '', bid: null, text: '', season: p.season,
      pick: `R${p.round} · P${inRound}`, via: p.original_team_id !== p.current_team_id ? p.original_team_id : undefined })
  }
  // defenses arrive as a team code ("ARI"): show "Arizona D/ST"
  const NFL_CITY: Record<string, string> = { ARI: 'Arizona', ATL: 'Atlanta', BAL: 'Baltimore', BUF: 'Buffalo', CAR: 'Carolina', CHI: 'Chicago', CIN: 'Cincinnati', CLE: 'Cleveland', DAL: 'Dallas', DEN: 'Denver', DET: 'Detroit', GB: 'Green Bay', HOU: 'Houston', IND: 'Indianapolis', JAX: 'Jacksonville', KC: 'Kansas City', LAC: 'LA Chargers', LAR: 'LA Rams', LV: 'Las Vegas', MIA: 'Miami', MIN: 'Minnesota', NE: 'New England', NO: 'New Orleans', NYG: 'NY Giants', NYJ: 'NY Jets', PHI: 'Philadelphia', PIT: 'Pittsburgh', SF: 'San Francisco', SEA: 'Seattle', TB: 'Tampa Bay', TEN: 'Tennessee', WAS: 'Washington', WSH: 'Washington' }
  for (const m of moves) if (m.sport === 'NFL' && /^(DST|DEF|D\/ST)$/i.test(m.pos) && NFL_CITY[m.player]) { m.player = `${NFL_CITY[m.player]} D/ST`; m.pos = 'D/ST' }
  moves.sort((a, b) => (b.when > a.when ? 1 : b.when < a.when ? -1 : 0))
  // trade cards from Fantrax's history (players and picks): one card per trade, merging the legs
  // a multi-league trade leaves in each Fantrax league (same day, same two clubs)
  const fxRows = moves.filter(m => m.kind === 'TRADED' && m.id.startsWith('fxt-') && m.season >= '2025-26')
  if (fxRows.length) {
    const cards = new Map<string, TradeRow>()
    for (const m of fxRows) {
      const key = `${m.when.slice(0, 10)}|${[m.teamId, m.from ?? ''].sort().join('|')}`
      const c = cards.get(key) ?? { id: key, when: m.when, sides: [], text: '', season: m.season }
      let side = c.sides.find(sd => sd.teamId === m.teamId)
      if (!side) { side = { teamId: m.teamId, gets: [] }; c.sides.push(side) }
      side.gets.push({ name: m.player || (m.text + (m.pick ? ` (${m.pick.replace('R', 'Round ').replace(' · P', ', Pick ')})` : '') + (m.via ? ` via ${m.via}` : '')), sport: m.sport, team: m.player ? m.team : '', pos: m.player ? m.pos : '' })
      if (m.from && !c.sides.find(sd => sd.teamId === m.from)) c.sides.push({ teamId: m.from, gets: [] })
      cards.set(key, c)
    }
    return { moves, trades: [...cards.values()].sort((a, b) => (b.when > a.when ? 1 : -1)) }
  }
  return { moves, trades }
}
