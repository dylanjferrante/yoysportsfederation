// Data for the ySF phone app (mobile/), built from the same code as the web pages so the app and the
// site always agree. Every image path comes back absolute (the app has no base URL of its own).
// Served by /api/mobile/ysf/* — public data, like the pages; My Club uses /api/leagues/ysf/myclub.
import { db } from '@/db'
import { leagues } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { YSF_LEAGUES, YSF_ART, YSF_LEAGUE_ID } from '@/lib/ysf'
import { loadStandings, loadWeek, loadClubs, periodLabel, siteFeed, siteClubMap, type ClubInfo } from '@/lib/ysf-data'
import { listNews, getNews, topStories, WRITERS, type Article } from '@/lib/ysf-news'
import { kicker, tilesOf } from '@/app/leagues/[id]/news/YsfNews'
import { trophyName } from '@/lib/ysf-trophies'
import { loadClubPage } from '@/lib/ysf-club'

export async function ysfLeague() {
  const [l] = await db.select().from(leagues).where(eq(leagues.id, YSF_LEAGUE_ID)).limit(1)
  return l
}
// the public origin of this request (Railway sits behind a proxy)
export function originOf(req: Request) {
  const h = req.headers
  const host = h.get('x-forwarded-host') || h.get('host')
  const proto = h.get('x-forwarded-proto') || (host?.startsWith('localhost') ? 'http' : 'https')
  return host ? `${proto}://${host}` : new URL(req.url).origin
}
const absr = (o: string) => (p: string | null | undefined) => !p ? null : /^https?:/.test(p) ? p : `${o}${p.startsWith('/') ? '' : '/'}${p}`

export type MClub = { id: string; name: string; abbr: string; crest: string | null; crestOnColor: string | null; color: string | null; ink: string }
const club = (c: ClubInfo | undefined, abs: ReturnType<typeof absr>): MClub | null => c ? { id: c.id, name: c.name, abbr: c.abbreviation, crest: abs(c.logo), crestOnColor: abs(c.altLogo || c.logo), color: c.color, ink: c.ink } : null
export const leaguesMeta = (abs: ReturnType<typeof absr>) => YSF_LEAGUES.map(l => ({ sport: l.sport, code: l.code, key: l.key, name: l.name, color: l.color,
  symbol: { onWhite: abs(YSF_ART.leagueSymbol(l.key, 'white')), onBlack: abs(YSF_ART.leagueSymbol(l.key, 'black')), onColor: abs(YSF_ART.leagueSymbol(l.key, 'color')) } }))

function storyOut(a: Article, C: Map<string, ClubInfo>, abs: ReturnType<typeof absr>) {
  return { id: a.id, kicker: kicker(a), headline: a.headline, dek: a.dek, by: `By ${WRITERS[a.writer]?.name ?? 'ySF News'}`, published: a.published, sport: a.sport,
    tiles: tilesOf(a, C).map(t => ({ bg: t.bg, img: abs(t.img) })) }
}

export async function homeData(req: Request) {
  const abs = absr(originOf(req))
  const league = await ysfLeague()
  const [clubs, wk] = await Promise.all([loadClubs(league.id), loadWeek(league)])
  const byAbbr = new Map(Object.values(clubs).map(c => [c.abbreviation, c]))
  const all = listNews(80)
  const top = topStories(all)
  return {
    brand: { primaryOnWhite: abs(YSF_ART.primaryOnWhite), primaryOnBlack: abs(YSF_ART.primaryOnBlack), wordmarkOnBlack: abs(YSF_ART.wordmarkOnBlack), cup: abs(YSF_ART.cupSymbol) },
    leagues: leaguesMeta(abs),
    week: { num: wk.num(wk.week), live: wk.pairings.some(p => p.lines.some(l => l.status === 'LIVE')) },
    scoreboard: wk.pairings.map(p => ({ a: club(clubs[p.a], abs), b: club(clubs[p.b], abs), lines: p.lines.filter(l => !l.season).map(l => ({ sport: l.sport, status: l.status, a: l.a, b: l.b, matchupId: l.matchupId })) })),
    topStories: top.map(a => storyOut(a, byAbbr, abs)),
    headlines: all.filter(a => !top.includes(a)).slice(0, 12).map(a => storyOut(a, byAbbr, abs)),
  }
}

export async function scoresData(req: Request, week?: number) {
  const abs = absr(originOf(req))
  const league = await ysfLeague()
  const [clubs, wk] = await Promise.all([loadClubs(league.id), loadWeek(league, week)])
  return {
    leagues: leaguesMeta(abs),
    week: wk.num(wk.week), prev: wk.prev != null ? wk.num(wk.prev) : null, next: wk.next != null ? wk.num(wk.next) : null,
    pairings: wk.pairings.map(p => ({ a: club(clubs[p.a], abs), b: club(clubs[p.b], abs),
      lines: p.lines.filter(l => !l.season).map(l => ({ sport: l.sport, label: l.label, status: l.status, a: l.a, b: l.b, matchupId: l.matchupId })) })),
  }
}

export async function standingsData(req: Request) {
  const abs = absr(originOf(req))
  const league = await ysfLeague()
  const s = await loadStandings(league)
  const c = (id: string) => club(s.clubs[id], abs)
  return {
    season: s.season, leagues: leaguesMeta(abs), live: s.live,
    cup: s.cup.map(r => ({ rk: r.rk, club: c(r.teamId), pts: r.pts, w: r.w, l: r.l, ranks: r.ranks, cupPct: r.cupPct, exp: r.exp })),
    tables: Object.fromEntries(Object.entries(s.tables).map(([sp, rows]) => [sp, rows.map(r => ({ rk: r.rk, club: c(r.teamId), w: r.w, l: r.l, pf: r.pf, gb: r.gb, po: r.po, title: r.title, fed: r.fed }))])),
  }
}

export async function newsList(req: Request, section?: string) {
  const abs = absr(originOf(req))
  const league = await ysfLeague()
  const clubs = await loadClubs(league.id)
  const byAbbr = new Map(Object.values(clubs).map(c => [c.abbreviation, c]))
  const all = listNews(200).filter(a => !section || a.sport === section)
  return { sections: [...YSF_LEAGUES.map(l => ({ id: l.sport, label: l.code, color: l.color })), { id: 'CUP', label: 'CUP RACE', color: '#000' }, { id: 'MOVES', label: 'MOVES', color: '#2F5D8A' }],
    stories: all.slice(0, 80).map(a => storyOut(a, byAbbr, abs)) }
}
export async function newsArticle(req: Request, id: string) {
  const abs = absr(originOf(req))
  const a = getNews(id)
  if (!a) return null
  const league = await ysfLeague()
  const clubs = await loadClubs(league.id)
  const byAbbr = new Map(Object.values(clubs).map(c => [c.abbreviation, c]))
  return { ...storyOut(a, byAbbr, abs), body: a.body }
}

export async function clubsData(req: Request) {
  const abs = absr(originOf(req))
  const league = await ysfLeague()
  const s = await loadStandings(league)
  return { clubs: s.cup.map(r => ({ ...club(s.clubs[r.teamId], abs)!, cupRank: r.rk, cupPts: r.pts, rec: `${r.w}-${r.l}` })) }
}

// the full club page (same data as the web page, via loadClubPage)
export async function clubData(req: Request, teamId: string) {
  const abs = absr(originOf(req))
  const league = await ysfLeague()
  const d = await loadClubPage(league, teamId)
  if (!d) return null
  return {
    club: club(d.club, abs), owner: d.ownerRow?.owner ?? null, season: league.season,
    cup: { rk: d.cupRow.rk, pts: d.cupRow.pts, rec: d.cupRow.rec, cupPct: d.cupRow.cupPct, ranks: d.cupRow.ranks },
    bio: d.bio,
    trophies: d.trophies.map((h: any) => ({ season: h.season, scope: h.scope, name: trophyName(h.scope, h.season) })),
    leagues: leaguesMeta(abs),
    thisWeek: d.thisWeek.map(w => ({ ...w, oppLogo: abs(w.oppLogo) })),
    calendar: d.calendar, seasons: d.leagues, drafts: d.drafts, moves: d.moves,
    h2h: d.h2h.map(r => ({ ...r, crest: abs(r.crest) })),
  }
}

export async function rulesData() {
  const rec = await siteFeed<any>('resolutions.json')
  return { items: [...(rec?.items ?? [])].sort((a: any, b: any) => String(b.sort_date ?? '').localeCompare(String(a.sort_date ?? '')))
    .map((x: any) => ({ id: x.id, title: x.title, kind: x.kind, status: x.status, date: x.sort_date, text: x.text, yes: x.yes, no: x.no, abstain: x.abstain, needed: x.needed, threshold: x.threshold, emergency: !!x.emergency, approvedBy: x.approved_by ?? [], opposedBy: x.opposed_by ?? [] })) }
}
