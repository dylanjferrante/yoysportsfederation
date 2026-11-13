// Server-side data for the ySF Site Redesign pages (Home, Standings, Scores), from the Nexus DB.
import { db } from '@/db'
import { teams, teamRecords, matchups, activity } from '@/db/schema'
import { and, eq, desc } from 'drizzle-orm'
import { safeParse } from '@/lib/utils'
import { rankWithinSport } from '@/lib/federation'
import { simulateSeason } from '@/lib/odds'
import { weekDateRange } from '@/lib/defaults'
import { YSF_LEAGUES } from '@/lib/ysf'

export type ClubInfo = { id: string; name: string; abbreviation: string; logo: string | null; altLogo: string | null; color: string | null }
export type LeagueRow = { teamId: string; rk: number; rec: string; w: number; l: number; gb: number; pf: number; faab: number; fed: number; po: number; title: number }
export type CupRow = { teamId: string; rk: number; pts: number; rec: string; w: number; l: number; ranks: Record<string, number | null>; cupPct: number; exp: number }

export async function loadClubs(leagueId: string): Promise<Record<string, ClubInfo>> {
  const rows = await db.select().from(teams).where(and(eq(teams.leagueId, leagueId), eq(teams.archived, false)))
  return Object.fromEntries(rows.map(c => [c.id, { id: c.id, name: c.name, abbreviation: c.abbreviation, logo: c.logo, altLogo: c.altLogo, color: c.primaryColor }]))
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
  for (const L of YSF_LEAGUES) for (const r of tables[L.sport]) { r.po = odds.perSport[L.sport]?.playoff[r.teamId] ?? 0; r.title = odds.perSport[L.sport]?.title[r.teamId] ?? 0 }
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
  }).sort((a, b) => b.pts - a.pts || b.w - a.w).map((r, i) => ({ ...r, rk: i + 1 }))
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

export type PairLine = { sport: string; label: string; status: 'LIVE' | 'FINAL' | 'UPCOMING'; a: number | null; b: number | null; matchupId: string }
export type Pairing = { a: string; b: string; lines: PairLine[]; summary: string }

// One card per club pairing for a federation week, every league's score stacked.
export async function loadWeek(league: any, week?: number) {
  const season = league.season
  const ms = await db.select().from(matchups).where(and(eq(matchups.leagueId, league.id), eq(matchups.season, season)))
  const curWeek = Math.min(...ms.filter(m => !m.isComplete).map(m => m.week), Infinity)
  const thisWeek = Number.isFinite(curWeek) ? curWeek : Math.max(...ms.map(m => m.week))
  const w = week ?? thisWeek
  const weeks = [...new Set(ms.map(m => m.week))].sort((a, b) => a - b)
  const now = Date.now()
  const pairs = new Map<string, Pairing>()
  for (const L of YSF_LEAGUES) {
    for (const m of ms.filter(x => x.sport === L.sport && x.week === w && x.awayTeamId)) {
      const [a, b] = [m.homeTeamId, m.awayTeamId!].sort()
      const key = a + '|' + b
      const p = pairs.get(key) ?? { a: m.homeTeamId, b: m.awayTeamId!, lines: [], summary: '' }
      const { start } = weekDateRange(season, w)
      const status: PairLine['status'] = m.isComplete ? 'FINAL' : start.getTime() > now ? 'UPCOMING' : 'LIVE'
      const sa = m.homeTeamId === p.a ? m.homeScore : m.awayScore, sb = m.homeTeamId === p.a ? m.awayScore : m.homeScore
      const blank = status === 'UPCOMING' || (!m.isComplete && !(sa || sb))
      p.lines.push({ sport: L.sport, label: periodLabel(league, L.sport, w), status, a: blank ? null : sa ?? 0, b: blank ? null : sb ?? 0, matchupId: m.id })
      pairs.set(key, p)
    }
  }
  return { week: w, thisWeek, prev: weeks.filter(x => x < w).pop() ?? null, next: weeks.find(x => x > w) ?? null, pairings: [...pairs.values()] }
}

export function seriesSummary(p: Pairing, ab: (id: string) => string) {
  let wa = 0, wb = 0
  for (const l of p.lines) { if (l.a == null || l.b == null || l.a === l.b) continue; if (l.a > l.b) wa++; else wb++ }
  const done = p.lines.every(l => l.status === 'FINAL')
  if (wa === wb) return wa ? `Tied ${wa}–${wb}` : '—'
  const lead = wa > wb ? ab(p.a) : ab(p.b)
  return `${lead} ${done ? 'wins' : 'leads'} ${Math.max(wa, wb)}–${Math.min(wa, wb)}`
}

const YSF_BASE = (process.env.YSF_BASE || 'https://ysffantasy.com').replace(/\/$/, '')
export async function siteCupProjection(): Promise<{ generated_at: string; teams: any[] } | null> {
  try {
    const r = await fetch(`${YSF_BASE}/data/fed_cup_projection.json`, { next: { revalidate: 600 } })
    return r.ok ? await r.json() : null
  } catch { return null }
}

// Moves: signings, claims, releases and trades (structured activity rows).
export type MoveRow = { id: string; when: string; sport: string; teamId: string; kind: string; player: string; team: string; pos: string; bid: number | null; text: string }
export type TradeRow = { id: string; when: string; sides: { teamId: string; gets: { name: string; sport: string; team: string; pos: string }[] }[]; text: string }
export async function loadMoves(leagueId: string) {
  const rows = await db.select().from(activity).where(eq(activity.leagueId, leagueId)).orderBy(desc(activity.createdAt)).limit(2000)
  const moves: MoveRow[] = [], trades: TradeRow[] = []
  for (const r of rows) {
    const d = safeParse<any>(r.data, null)
    const when = (r.createdAt ?? '').replace(' ', 'T')
    if (r.type === 'TRADE') { trades.push({ id: r.id, when, sides: d?.sides ?? [], text: r.message }); continue }
    if (!['WAIVER', 'ROSTER'].includes(r.type) || d?.kind === 'LINEUP_CHANGE') continue
    moves.push({ id: r.id, when, sport: d?.sport ?? '', teamId: r.teamId ?? '', kind: d?.kind ?? 'MOVE', player: d?.player ?? '', team: d?.team ?? '', pos: d?.pos ?? '', bid: d?.bid ?? null, text: r.message })
  }
  return { moves, trades }
}
