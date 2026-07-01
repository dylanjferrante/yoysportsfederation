import { db } from '@/db'
import { leagues, teams, teamRecords, matchups, leagueHistory } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { safeParse, sportAbbrLabel, orderedSports } from '@/lib/utils'
import { computeFederationStandings } from '@/lib/federation'
import { buildHeadlines } from '@/lib/headlines'

export type WireItem = { id: string; text: string; href: string }
export type WireTopic = { key: string; title: string; sport?: string; items: WireItem[] }

// The wire's topic model: one topic per sport (this week's games with each club's
// sport record and a storyline), then the Federation Cup race, Breaking News, and
// Trades & Transactions. Sports always appear even in a quiet week.
export async function buildWireTopics(leagueId: string): Promise<WireTopic[]> {
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId)).limit(1)
  if (!league) return []
  const season = league.season
  const base = `/leagues/${leagueId}`
  const sportsEnabled = orderedSports(safeParse<string[]>(league.sportsEnabled, []), league.seasonStart)
  const sportAbbr = safeParse<Record<string, string>>(league.sportAbbr, {})
  const sn = (s: string) => sportAbbrLabel(s, sportAbbr)

  const teamRows = await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation }).from(teams).where(eq(teams.leagueId, leagueId))
  const tById = new Map(teamRows.map(t => [t.id, t]))
  const nm = (id: string | null | undefined) => (id && tById.get(id)?.name) || 'A club'
  const ab = (id: string | null | undefined) => (id && tById.get(id)?.abbreviation) || '—'

  const recsAll = await db.select().from(teamRecords).where(eq(teamRecords.leagueId, leagueId))
  const recs = recsAll.filter(r => r.season === season)
  const recOf = (teamId: string, sp: string) => recs.find(r => r.teamId === teamId && r.sport === sp)
  const rc = (teamId: string, sp: string) => { const r = recOf(teamId, sp); return `${r?.wins ?? 0}-${r?.losses ?? 0}` }

  const ms = await db.select().from(matchups).where(and(eq(matchups.leagueId, leagueId), eq(matchups.season, season)))

  // Current win/loss streak for a club in a sport, from completed games.
  const streakOf = (teamId: string, sp: string) => {
    const games = ms.filter(m => m.sport === sp && m.isComplete && m.awayTeamId && (m.homeTeamId === teamId || m.awayTeamId === teamId)).sort((a, b) => b.week - a.week)
    let n = 0; let win: boolean | null = null
    for (const g of games) {
      const my = g.homeTeamId === teamId ? (g.homeScore ?? 0) : (g.awayScore ?? 0)
      const op = g.homeTeamId === teamId ? (g.awayScore ?? 0) : (g.homeScore ?? 0)
      const w = my > op
      if (win === null) win = w
      if (w === win) n++; else break
    }
    return { win, n }
  }

  const topics: WireTopic[] = []

  // ── One topic per sport: this week's games, records, storylines ─────────────
  for (const sp of sportsEnabled) {
    const all = ms.filter(m => m.sport === sp && m.awayTeamId)
    const incomplete = all.filter(m => !m.isComplete)
    const complete = all.filter(m => m.isComplete)
    const week = incomplete.length ? Math.min(...incomplete.map(m => m.week)) : (complete.length ? Math.max(...complete.map(m => m.week)) : 0)
    const ranked = recs.filter(r => r.sport === sp).sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0) || (b.pointsFor ?? 0) - (a.pointsFor ?? 0))
    const topSet = new Set(ranked.slice(0, 2).map(r => r.teamId))
    const items: WireItem[] = []

    for (const g of all.filter(m => m.week === week)) {
      const a = g.awayTeamId as string, h = g.homeTeamId
      const href = `${base}/matchup/${g.id}`
      if (g.isComplete) {
        items.push({ id: `g-${g.id}`, text: `${nm(a)} (${rc(a, sp)}) ${(g.awayScore ?? 0).toFixed(1)}, ${nm(h)} (${rc(h, sp)}) ${(g.homeScore ?? 0).toFixed(1)} — Final`, href })
      } else {
        const ar = recOf(a, sp), hr = recOf(h, sp)
        const aStk = streakOf(a, sp), hStk = streakOf(h, sp)
        let story = ''
        if ((ar?.wins ?? 0) >= 2 && (ar?.losses ?? 1) === 0 && (hr?.wins ?? 0) >= 2 && (hr?.losses ?? 1) === 0) story = 'both unbeaten'
        else if (topSet.has(a) && topSet.has(h)) story = 'top-2 clash'
        else if (aStk.win && aStk.n >= 3) story = `${ab(a)} on a ${aStk.n}-game run`
        else if (hStk.win && hStk.n >= 3) story = `${ab(h)} on a ${hStk.n}-game run`
        items.push({ id: `g-${g.id}`, text: `${nm(a)} (${rc(a, sp)}) vs ${nm(h)} (${rc(h, sp)})${story ? ` · ${story}` : ''}`, href })
      }
    }
    if (!items.length) {
      const leader = ranked[0]
      items.push(leader
        ? { id: `lead-${sp}`, text: `${nm(leader.teamId)} leads the ${sn(sp)} at ${leader.wins ?? 0}-${leader.losses ?? 0}`, href: `${base}/sports/${sp}` }
        : { id: `soon-${sp}`, text: `${sn(sp)} season is on the way`, href: `${base}/sports/${sp}` })
    }
    topics.push({ key: sp, title: sn(sp), sport: sp, items })
  }

  // Reuse the rich headline generators for the non-game topics.
  const headlines = await buildHeadlines(leagueId)
  const toItems = (arr: typeof headlines) => arr.map(h => ({ id: h.id, text: h.text, href: h.href }))

  // ── Federation Cup Race ─────────────────────────────────────────────────────
  const fedItems = toItems(headlines.filter(h => h.category === 'FEDERATION')).slice(0, 6)
  if (fedItems.length) topics.push({ key: 'FEDCUP', title: 'Federation Cup Race', items: fedItems })

  // ── Breaking News ───────────────────────────────────────────────────────────
  const breaking: WireItem[] = []
  breaking.push(...toItems(headlines.filter(h =>
    h.category === 'CHAMPION' || h.category === 'PLAYOFF' || h.category === 'MILESTONE'
    || (h.category === 'STANDINGS' && /clinch|eliminat/i.test(h.text))
    || (h.category === 'SUPERLATIVE' && /season high/i.test(h.text)))))
  // All-time Federation Cup points — tightest gap (teams passing each other).
  const fedScoring = safeParse<any>(league.federationScoring, { placement: [], championBonus: 0, regularSeasonBonus: 0, includedSports: sportsEnabled })
  const allTime: Record<string, number> = {}
  for (const s of [...new Set(recsAll.map(r => r.season))]) {
    const standings = computeFederationStandings(
      teamRows.map(t => ({ id: t.id })),
      recsAll.filter(r => r.season === s).map(r => ({ teamId: r.teamId, sport: r.sport, finishPosition: r.finishPosition, isChampion: r.isChampion })),
      fedScoring, fedScoring.includedSports ?? sportsEnabled,
    )
    for (const row of standings) allTime[row.team.id] = (allTime[row.team.id] ?? 0) + (row.total ?? 0)
  }
  const ranked = Object.entries(allTime).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  for (let i = 1; i < Math.min(ranked.length, 8); i++) {
    const gap = ranked[i - 1][1] - ranked[i][1]
    if (gap > 0 && gap <= 3) breaking.push({ id: `alltime-${i}`, text: `${nm(ranked[i][0])} is ${gap.toFixed(0)} all-time Cup point${gap === 1 ? '' : 's'} from passing ${nm(ranked[i - 1][0])} for #${i}`, href: `${base}/history` })
  }
  if (breaking.length) topics.push({ key: 'BREAKING', title: 'Breaking News', items: breaking.slice(0, 8) })

  // ── Trades & Transactions ───────────────────────────────────────────────────
  const txItems = toItems(headlines.filter(h => h.category === 'TRANSACTION')).slice(0, 8)
  if (txItems.length) topics.push({ key: 'MOVES', title: 'Trades & Transactions', items: txItems })

  return topics.filter(t => t.items.length)
}
