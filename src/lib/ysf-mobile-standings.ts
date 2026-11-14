// The app's Standings group (Cup Race, Playoffs, Power Rankings, Records, History), built the same
// way as the site's pages under /leagues/ysf/{cup,playoffs,power,records,history} so the two agree.
import { db } from '@/db'
import { matchups, teamRecords, leagueHistory } from '@/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { YSF_LEAGUES } from '@/lib/ysf'
import { loadClubs, loadStandings, loadMoves, siteCupProjection, siteFeed, siteClubMap, leagueFeed, powerRankingsFeed, siteSeasons, periodLabel } from '@/lib/ysf-data'
import { trophyName, trophyArt } from '@/lib/ysf-trophies'
import { loadModel } from '@/lib/ysf-model'
import { ysfLeague, originOf, absr, club } from '@/lib/ysf-mobile'

const KEY: Record<string, string> = { NFL: 'ysf_fl', NHL: 'ysf_hl', NBA: 'ysf_ba', MLB: 'ysf_lb' }
const SPORT: Record<string, string> = { ysf_fl: 'NFL', ysf_hl: 'NHL', ysf_ba: 'NBA', ysf_lb: 'MLB' }
const ord = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n] ?? 'th'}`

export async function cupData(req: Request) {
  const abs = absr(originOf(req))
  const league = await ysfLeague()
  const s = await loadStandings(league)
  const site = await siteCupProjection()
  const C = s.clubs
  const byAbbr = new Map((site?.teams ?? []).map((t: any) => [t.abbr, t]))
  const rows = [...s.cup].sort((a, b) => b.cupPct - a.cupPct || b.exp - a.exp).map((r, i) => {
    const p = byAbbr.get(C[r.teamId]?.abbreviation) as any
    return { rk: i + 1, club: club(C[r.teamId], abs), pts: r.pts, ranks: r.ranks, exp: r.exp, cupPct: r.cupPct,
      min: p?.min_fed_pts ?? null, max: p?.max_fed_pts ?? null, sd: p?.sd_fed_pts ?? null, top3: p?.p_top_3 ?? null, last: p?.p_last ?? null }
  })
  const progress = YSF_LEAGUES.map(l => { const m = site?.leagues?.[KEY[l.sport]]; const done = m?.n_completed_reg ?? 0; return { sport: l.sport, done, total: done + (m?.n_upcoming_reg ?? 0) } })
  const mdl = loadModel()
  const model = mdl && mdl.season === league.season ? {
    sims: mdl.sims, generatedAt: mdl.generatedAt,
    rows: Object.entries(mdl.cup).sort((a, b) => b[1].win - a[1].win || b[1].exp - a[1].exp).map(([tid, c]) => ({ club: club(C[tid], abs), exp: c.exp, sd: c.sd, top3: c.top3, win: c.win,
      titles: Object.fromEntries(YSF_LEAGUES.map(l => [l.sport, mdl.leagues[l.sport]?.clubs[tid]?.title ?? 0])) })),
  } : null
  return { trials: site?.n_trials ?? 10000, updated: site?.generated_at ?? null, progress, rows, model }
}

type PM = { away_ysf_id: string | null; home_ysf_id: string | null; away_seed: number | null; home_seed: number | null; away_score: number; home_score: number; winner_ysf_id: string | null; complete: boolean; is_bye: boolean }
export async function playoffsData(req: Request, sport?: string, sArg?: string) {
  const abs = absr(originOf(req))
  const league = await ysfLeague()
  const C = await loadClubs(league.id)
  const L = YSF_LEAGUES.find(l => l.sport === sport) ?? YSF_LEAGUES[0]
  const seasons = [...new Set([...(await siteSeasons()).complete, league.season])]
  const season = seasons.includes(sArg ?? '') ? sArg! : league.season
  const feed = await leagueFeed<any>(KEY[L.sport], season)
  const bracket = feed?.playoff_bracket as { status: string; seeds: Record<string, number>; rounds: { name: string; period?: number; matchups: PM[] }[] } | undefined
  const own = new Map(db.all<{ id: string; email: string }>(sql`SELECT t.id, u.email FROM teams t JOIN users u ON u.id = t.user_id WHERE t.league_id = ${league.id}`).map(r => [r.email.replace('@ysf.local', ''), r.id]))
  const ci = (y: string | null | undefined) => (y ? C[own.get(y) ?? ''] : undefined)
  const bySeed = new Map(Object.entries(bracket?.seeds ?? {}).map(([y, s]) => [s, y]))
  const started = !!bracket?.status && bracket.status !== 'not_started'
  const empty = { home_ysf_id: null, away_ysf_id: null, home_seed: null, away_seed: null, home_score: 0, away_score: 0, winner_ysf_id: null, complete: false, is_bye: false } as PM
  const rounds = started ? bracket!.rounds ?? [] : bracket ? [
    { name: 'Round 1', matchups: [[1, null], [4, 5], [2, null], [3, 6]].map(([h, a]) => ({ ...empty, home_ysf_id: bySeed.get(h!) ?? null, home_seed: h, away_ysf_id: a ? bySeed.get(a) ?? null : null, away_seed: a, is_bye: !a })) },
    { name: 'Semifinals', matchups: [empty, empty] }, { name: 'Championship', matchups: [empty] },
  ] : []
  const champ = started && bracket!.status === 'complete' ? ci(rounds.find(r => /champ/i.test(r.name))?.matchups[0]?.winner_ysf_id) : undefined
  const side = (y: string | null, seed: number | null, score: number, m: PM) => ({ club: club(ci(y), abs), seed, score: m.complete && y && !m.is_bye ? score : null, win: !!m.winner_ysf_id && m.winner_ysf_id === y })
  const s = season === league.season ? await loadStandings(league) : null
  return {
    sport: L.sport, season, seasons, trophy: trophyName(L.sport, season), trophyArt: abs(trophyArt(L.sport, season)),
    champion: club(champ, abs), status: !bracket ? 'none' : started ? bracket.status : 'not_started',
    rounds: rounds.map(r => ({ name: r.name === 'Round 1' ? 'Quarterfinals' : r.name, period: r.period ?? null, place: /place/i.test(r.name),
      games: r.matchups.map(m => ({ bye: !!m.is_bye, home: side(m.home_ysf_id, m.home_seed, m.home_score, m), away: m.is_bye ? null : side(m.away_ysf_id, m.away_seed, m.away_score, m) })) })),
    picture: s ? s.tables[L.sport].map(r => ({ seed: r.rk, club: club(C[r.teamId], abs), rec: r.rec, gb: r.gb, po: r.po, title: r.title })) : [],
  }
}

export async function powerData(req: Request, tab?: string, lg?: string) {
  const abs = absr(originOf(req))
  const league = await ysfLeague()
  const C = await loadClubs(league.id)
  const map = await siteClubMap(C)
  const ck = (k: string) => club(C[map[k]], abs)
  if (tab === 'all') {
    const keys = Object.values(KEY)
    const done = (await siteSeasons()).complete.filter(x => x !== league.season)
    const pairs = done.flatMap(sn => keys.map(k => ({ sn, k })))
    const [pr, ...arch] = await Promise.all([powerRankingsFeed<any>(league.season), ...pairs.map(x => leagueFeed<any>(x.k, x.sn))])
    const ts: { k: string; sport: string; season: string; live: boolean; pr: number; rec: string; ppg: number; fin: string }[] = []
    pairs.forEach(({ sn, k }, i) => (arch[i]?.standings ?? []).forEach((s: any) => ts.push({ k: s.ysf_id, sport: SPORT[k], season: sn, live: false, pr: s.display_pr ?? 0, rec: `${s.w}-${s.l}`, ppg: s.ppg ?? s.pf / Math.max(1, s.w + s.l), fin: s.playoff_result || ord(s.final_rank) })))
    for (const [k, rows] of Object.entries(pr?.power_rankings?.leagues ?? {}) as [string, any[]][])
      rows.forEach(s => ts.push({ k: s.team, sport: SPORT[k], season: league.season, live: true, pr: s.display_pr, rec: `${s.wins}-${s.losses}`, ppg: s.ppg, fin: `${ord(s.standings_rank)} now` }))
    return { tab: 'all', rows: ts.filter(x => !lg || x.sport === lg).sort((a, b) => b.pr - a.pr).slice(0, 25).map((x, i) => ({ rk: i + 1, club: ck(x.k), sport: x.sport, season: x.season, live: x.live, value: x.pr, rec: x.rec, ppg: x.ppg, fin: x.fin })) }
  }
  if (tab === 'dyn') {
    const d = await siteFeed<any>('decade_race.json')
    return { tab: 'dyn', year: d?.year_in_decade ?? null, of: d?.decade_len ?? 10,
      rows: ((d?.teams ?? []) as any[]).map(r => ({ rk: r.rank, club: ck(r.team), won: r.confirmed_fed_pts, projected: r.projected_total, thisSeason: r.projected_current_season })) }
  }
  const d = await siteFeed<any>('federation_dominance.json')
  return { tab: 'now', rows: ((d?.federation ?? []) as any[]).map((r, i) => ({ rk: i + 1, club: ck(r.team), value: r.fed_dominance,
    byLeague: Object.fromEntries(Object.entries(r.by_league ?? {}).map(([k, v]: any) => [SPORT[k], v.dominance])) })) }
}

export async function recordsData(req: Request, sport?: string) {
  const abs = absr(originOf(req))
  const league = await ysfLeague()
  const C = await loadClubs(league.id)
  const L = YSF_LEAGUES.find(l => l.sport === sport) ?? YSF_LEAGUES[0]
  const sched = JSON.parse(league.sportSchedule ?? '[]') as { sport: string; startWeek: number }[]
  const ms = (await db.select().from(matchups).where(and(eq(matchups.leagueId, league.id), eq(matchups.sport, L.sport), eq(matchups.isComplete, true)))).filter(m => m.awayTeamId && (m.homeScore || m.awayScore))
  const per = (m: typeof ms[number]) => m.season === league.season ? m.week - (sched.find(s => s.sport === L.sport)?.startWeek ?? 1) + 1 : m.week
  const label = (m: typeof ms[number]) => `${m.season ?? league.season} · ${L.sport === 'NFL' ? 'Week' : 'Period'} ${per(m)}${m.isPlayoff ? ' · Playoffs' : ''}`
  const ab = (id: string) => C[id]?.abbreviation ?? ''
  const scores = ms.flatMap(m => [{ m, t: m.homeTeamId, o: m.awayTeamId!, v: m.homeScore ?? 0, ov: m.awayScore ?? 0 }, { m, t: m.awayTeamId!, o: m.homeTeamId, v: m.awayScore ?? 0, ov: m.homeScore ?? 0 }])
  const games = ms.map(m => { const hw = (m.homeScore ?? 0) >= (m.awayScore ?? 0); return { m, w: hw ? m.homeTeamId : m.awayTeamId!, l: hw ? m.awayTeamId! : m.homeTeamId, wv: Math.max(m.homeScore ?? 0, m.awayScore ?? 0), lv: Math.min(m.homeScore ?? 0, m.awayScore ?? 0) } })
  const sc = (x: typeof scores[number]) => ({ club: club(C[x.t], abs), text: `vs ${ab(x.o)}`, sub: label(x.m), value: x.v, matchupId: x.m.id })
  const gm = (g: typeof games[number]) => ({ club: club(C[g.w], abs), text: `${+g.wv.toFixed(2)} – ${+g.lv.toFixed(2)} ${ab(g.l)}`, sub: label(g.m), value: g.wv - g.lv, matchupId: g.m.id })
  const rec = new Map<string, { w: number; l: number; t: number; pf: number; g: number }>()
  for (const s of scores) { const r = rec.get(s.t) ?? { w: 0, l: 0, t: 0, pf: 0, g: 0 }; r.g++; r.pf += s.v; if (s.v > s.ov) r.w++; else if (s.v < s.ov) r.l++; else r.t++; rec.set(s.t, r) }
  return {
    sport: L.sport, games: ms.length,
    lists: [
      { title: 'HIGHEST SCORES', rows: [...scores].sort((a, b) => b.v - a.v).slice(0, 10).map(sc) },
      { title: 'LOWEST SCORES', rows: [...scores].sort((a, b) => a.v - b.v).slice(0, 10).map(sc) },
      { title: 'BIGGEST WINS', rows: [...games].sort((a, b) => (b.wv - b.lv) - (a.wv - a.lv)).slice(0, 10).map(gm) },
      { title: 'CLOSEST GAMES', rows: [...games].filter(g => g.wv !== g.lv).sort((a, b) => (a.wv - a.lv) - (b.wv - b.lv)).slice(0, 10).map(gm) },
    ],
    allTime: [...rec.entries()].sort((a, b) => (b[1].w / b[1].g) - (a[1].w / a[1].g) || b[1].pf - a[1].pf).map(([id, r]) => ({ club: club(C[id], abs), w: r.w, l: r.l, t: r.t, pct: r.w / r.g, pf: r.pf, ppg: r.pf / r.g })),
  }
}

const FIRST = '2025-26'
export async function historyData(req: Request) {
  const abs = absr(originOf(req))
  const league = await ysfLeague()
  const PREV = (await siteSeasons()).complete.filter(x => x < league.season).pop() ?? FIRST
  const s = await loadStandings(league)
  const C = s.clubs, ab = (id: string) => C[id]?.abbreviation ?? ''
  const code = (sp: string) => YSF_LEAGUES.find(l => l.sport === sp)!.code
  const recs = await db.select().from(teamRecords).where(eq(teamRecords.leagueId, league.id))
  const titles = await db.select().from(leagueHistory).where(eq(leagueHistory.leagueId, league.id))
  const ms = await db.select().from(matchups).where(eq(matchups.leagueId, league.id))
  const prevCup: Record<string, number> = {}
  for (const r of recs.filter(r => r.season === PREV)) if (r.finishPosition) prevCup[r.teamId] = (prevCup[r.teamId] ?? 0) + (13 - r.finishPosition)
  const fed = titles.find(t => t.season === PREV && t.scope === 'OVERALL')
  const champOf = (sp: string) => titles.find(t => t.season === PREV && t.scope === sp)
  const allTime = Object.keys(C).map(id => {
    const mine = ms.filter(m => m.isComplete && m.awayTeamId && (m.homeTeamId === id || m.awayTeamId === id))
    const wl = (list: typeof mine) => list.reduce((a, m) => { const me = m.homeTeamId === id ? m.homeScore ?? 0 : m.awayScore ?? 0, them = m.homeTeamId === id ? m.awayScore ?? 0 : m.homeScore ?? 0; return me > them ? { w: a.w + 1, l: a.l } : me < them ? { w: a.w, l: a.l + 1 } : a }, { w: 0, l: 0 })
    const tot = wl(mine)
    return { id, w: tot.w, l: tot.l, pct: tot.w + tot.l ? tot.w / (tot.w + tot.l) : 0,
      per: Object.fromEntries(YSF_LEAGUES.map(L => { const x = wl(mine.filter(m => m.sport === L.sport)); return [L.sport, x.w + x.l ? `${x.w}-${x.l}` : null] })),
      cup: (prevCup[id] ?? 0) + (s.cup.find(r => r.teamId === id)?.pts ?? 0),
      titles: titles.filter(t => t.championTeamId === id).map(t => ({ scope: t.scope, season: t.season, name: trophyName(t.scope, t.season), art: abs(trophyArt(t.scope, t.season)) })) }
  }).sort((a, b) => b.titles.length - a.titles.length || b.pct - a.pct)

  // records book (same entries as the site)
  const done = ms.filter(m => m.isComplete && m.awayTeamId && !m.isPlayoff)
  const book: { k: string; v: string }[] = []
  for (const L of YSF_LEAGUES) {
    let best: { id: string; pts: number; m: typeof done[number] } | null = null
    for (const m of done.filter(x => x.sport === L.sport)) for (const [id, pts] of [[m.homeTeamId, m.homeScore ?? 0], [m.awayTeamId!, m.awayScore ?? 0]] as [string, number][]) if (!best || pts > best.pts) best = { id, pts, m }
    if (best) book.push({ k: `Most points, one ${L.code} ${L.sport === 'NFL' ? 'week' : 'period'}`, v: `${ab(best.id)} · ${+best.pts.toFixed(1)} (${best.m.season}, ${best.m.season === league.season ? periodLabel(league, L.sport, best.m.week) : `${L.sport === 'NFL' ? 'Week' : 'Period'} ${best.m.week}`})` })
  }
  let streak = { id: '', n: 0, sp: '' }
  for (const L of YSF_LEAGUES) for (const id of Object.keys(C)) {
    const mine = done.filter(m => m.season === league.season && m.sport === L.sport && (m.homeTeamId === id || m.awayTeamId === id)).sort((a, b) => b.week - a.week)
    let n = 0
    for (const m of mine) { const me = m.homeTeamId === id ? m.homeScore ?? 0 : m.awayScore ?? 0, them = m.homeTeamId === id ? m.awayScore ?? 0 : m.homeScore ?? 0; if (me > them) n++; else break }
    if (n > streak.n) streak = { id, n, sp: L.sport }
  }
  if (streak.n) book.push({ k: 'Longest win streak (current)', v: `${ab(streak.id)} · ${streak.n} straight in ${code(streak.sp)}` })
  const { moves } = await loadMoves(league.id, league.season)
  for (const season of [league.season, PREV]) {
    const big = moves.filter(m => m.season === season && m.bid != null).sort((a, b) => (b.bid ?? 0) - (a.bid ?? 0))[0]
    if (big) book.push({ k: `Biggest FAAB bid, ${season}`, v: `${ab(big.teamId)} · $${big.bid} for ${big.player}` })
  }
  const most = Object.keys(C).map(id => ({ id, n: titles.filter(t => t.championTeamId === id && t.scope !== 'OVERALL').length })).sort((a, b) => b.n - a.n)[0]
  if (most?.n) book.push({ k: 'Most league titles', v: `${ab(most.id)} · ${most.n}` })
  const topCup = Object.entries(prevCup).sort((a, b) => b[1] - a[1])[0]
  if (topCup) book.push({ k: 'Highest Cup total', v: `${ab(topCup[0])} · ${topCup[1]} (${PREV})` })

  const lead = s.cup[0]
  return {
    current: { season: league.season, leader: club(C[lead.teamId], abs), leaderPts: lead.pts,
      leagues: YSF_LEAGUES.map(L => { const t = s.tables[L.sport]?.[0]; const live = s.live.includes(L.sport); return { sport: L.sport, label: live ? 'LEADER' : 'OPENS SOON', club: live && t ? club(C[t.teamId], abs) : null, rec: live && t ? t.rec : null } }) },
    previous: { season: PREV, inaugural: PREV === FIRST,
      fedChampion: fed ? club(C[fed.championTeamId!], abs) : null, fedPts: fed ? prevCup[fed.championTeamId!] ?? null : null, fedArt: abs(trophyArt('OVERALL')),
      leagues: YSF_LEAGUES.map(L => { const t = champOf(L.sport); return { sport: L.sport, trophy: trophyName(L.sport, PREV), art: abs(trophyArt(L.sport, PREV)), champion: t ? club(C[t.championTeamId!], abs) : null, runnerUp: t?.runnerUpTeamId ? club(C[t.runnerUpTeamId], abs) : null } }) },
    allTime: allTime.map(r => ({ ...r, club: club(C[r.id], abs) })),
    book,
  }
}
