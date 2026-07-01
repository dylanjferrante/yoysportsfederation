import { db } from '@/db'
import { leagues, teams, teamRecords, matchups, leagueHistory, playerGameStats, playerDayStats, players, rosters } from '@/db/schema'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { safeParse, sportAbbrLabel, orderedSports } from '@/lib/utils'
import { computeFederationStandings } from '@/lib/federation'
import { buildHeadlines } from '@/lib/headlines'

export type WireItem = { id: string; text: string; href: string }
export type WireTopic = { key: string; title: string; sport?: string; items: WireItem[] }

// A SportsCenter-style slide: either a single game (two clubs with records,
// scores, and a storyline "note" off to the side) or a news headline.
export type SlideTeam = { name: string; abbr: string; logo: string | null; primary: string; secondary: string; record: string; standing: number; score: number; win: boolean }
export type WireSlide =
  | { kind: 'game'; id: string; sport: string; sportName: string; sportLogo: string | null; status: 'Final' | 'LIVE' | 'PRE'; away: SlideTeam; home: SlideTeam; note: string; href: string }
  | { kind: 'news'; id: string; topic: string; sport?: string; text: string; href: string }

export type Wire = { topics: WireTopic[]; slides: WireSlide[] }

// The wire's topic/slide model: one topic per sport (this week's games with each
// club's sport record and a storyline), then the Federation Cup race, Breaking
// News, and Trades & Transactions. Sports always appear even in a quiet week.
export async function buildWire(leagueId: string): Promise<Wire> {
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId)).limit(1)
  if (!league) return { topics: [], slides: [] }
  const season = league.season
  const base = `/leagues/${leagueId}`
  const sportsEnabled = orderedSports(safeParse<string[]>(league.sportsEnabled, []), league.seasonStart)
  const sportAbbr = safeParse<Record<string, string>>(league.sportAbbr, {})
  const sportNames = safeParse<Record<string, string>>(league.sportNames, {})
  const divisionLogos = safeParse<Record<string, string>>(league.divisionLogos, {})
  const divisionLogosAlt = safeParse<Record<string, string>>(league.divisionLogosAlt, {})
  const sn = (s: string) => sportAbbrLabel(s, sportAbbr)
  const spLogo = (s: string) => divisionLogosAlt[s] || divisionLogos[s] || null
  const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }

  const teamRows = await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation, division: teams.division, rivals: teams.rivals, logo: teams.logo, altLogo: teams.altLogo, primary: teams.primaryColor, secondary: teams.secondaryColor }).from(teams).where(eq(teams.leagueId, leagueId))
  const tById = new Map(teamRows.map(t => [t.id, t]))
  const nm = (id: string | null | undefined) => (id && tById.get(id)?.name) || 'A club'
  const ab = (id: string | null | undefined) => (id && tById.get(id)?.abbreviation) || '—'
  const divisions = league.divisions ?? 0
  const divOf = (id: string) => tById.get(id)?.division ?? null
  const rivalsOf = (id: string) => safeParse<string[]>(tById.get(id)?.rivals ?? '[]', [])
  const areRivals = (a: string, h: string) => rivalsOf(a).includes(h) || rivalsOf(h).includes(a)
  const playoffTeams = league.playoffTeams ?? 6

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

  // ── Recap ingredients: weekly star lines, daily box lines, injuries ──────────
  const teamIds = teamRows.map(t => t.id)
  const pgs = teamIds.length
    ? await db.select({ teamId: playerGameStats.teamId, sport: playerGameStats.sport, week: playerGameStats.week, points: playerGameStats.points, name: players.name })
        .from(playerGameStats).innerJoin(players, eq(playerGameStats.playerId, players.id))
        .where(and(eq(playerGameStats.leagueId, leagueId), eq(playerGameStats.season, season)))
    : []
  const pds = teamIds.length
    ? await db.select({ teamId: playerDayStats.teamId, sport: playerDayStats.sport, week: playerDayStats.week, date: playerDayStats.date, points: playerDayStats.points })
        .from(playerDayStats).where(and(eq(playerDayStats.leagueId, leagueId), eq(playerDayStats.season, season)))
    : []
  const injured = teamIds.length
    ? await db.select({ teamId: rosters.teamId, sport: rosters.sport, name: players.name, status: players.status })
        .from(rosters).innerJoin(players, eq(rosters.playerId, players.id))
        .where(and(inArray(rosters.teamId, teamIds), ne(players.status, 'ACTIVE')))
    : []

  const shortName = (full: string) => { const p = full.trim().split(/\s+/); return p.length > 1 ? `${p[0][0]}. ${p[p.length - 1]}` : full }

  // The winner's top scorers that week (the players who carried the club).
  const topPerformers = (teamId: string, sp: string, wk: number) => {
    const rows = pgs.filter(r => r.teamId === teamId && r.sport === sp && r.week === wk).sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    return rows.slice(0, 2).filter(r => (r.points ?? 0) > 0).map(r => `${shortName(r.name)} (${(r.points ?? 0).toFixed(1)})`)
  }

  // A finished game that snapped a losing skid, and how long.
  const skidSnapped = (teamId: string, sp: string, wk: number) => {
    const prior = ms.filter(m => m.sport === sp && m.isComplete && m.awayTeamId && m.week < wk && (m.homeTeamId === teamId || m.awayTeamId === teamId)).sort((a, b) => b.week - a.week)
    let n = 0
    for (const g of prior) {
      const my = g.homeTeamId === teamId ? (g.homeScore ?? 0) : (g.awayScore ?? 0)
      const op = g.homeTeamId === teamId ? (g.awayScore ?? 0) : (g.homeScore ?? 0)
      if (my > op) break
      n++
    }
    return n
  }

  // Standings order (by wins, then points) through a given week for a sport.
  const rankThrough = (sp: string, upto: number, teamId: string) => {
    const w: Record<string, number> = {}, pf: Record<string, number> = {}
    for (const m of ms) {
      if (m.sport !== sp || !m.isComplete || !m.awayTeamId || m.week > upto) continue
      const hs = m.homeScore ?? 0, as = m.awayScore ?? 0, hw = hs >= as
      const hid = m.homeTeamId as string, aid = m.awayTeamId as string
      w[hid] = (w[hid] ?? 0) + (hw ? 1 : 0); w[aid] = (w[aid] ?? 0) + (hw ? 0 : 1)
      pf[hid] = (pf[hid] ?? 0) + hs; pf[aid] = (pf[aid] ?? 0) + as
    }
    return teamIds.slice().sort((a, b) => (w[b] ?? 0) - (w[a] ?? 0) || (pf[b] ?? 0) - (pf[a] ?? 0)).indexOf(teamId)
  }

  // The club's live standing in a sport — the exact order (wins, then points)
  // shown as "#N" on the slide, so recap claims never contradict it.
  const recRank = (sp: string, teamId: string) =>
    recs.filter(r => r.sport === sp).sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0) || (b.pointsFor ?? 0) - (a.pointsFor ?? 0)).findIndex(r => r.teamId === teamId)

  // Whether the winner climbed the playoff race with this result. Phrased
  // qualitatively (no absolute rank number) and gated on the displayed standing
  // so it can't disagree with the "#N" on the slide.
  const climbNote = (teamId: string, sp: string, wk: number, cut: number) => {
    if (wk <= 1) return null
    const before = rankThrough(sp, wk - 1, teamId), nowM = rankThrough(sp, wk, teamId)
    if (nowM >= before) return null
    const nowDisp = recRank(sp, teamId)
    if (cut > 0 && before >= cut && nowDisp >= 0 && nowDisp < cut) return 'climbing into the playoff picture'
    return 'climbing the standings'
  }

  // For daily sports, whether the winner trailed on cumulative day totals before
  // pulling ahead by week's end.
  const comebackNote = (winner: string, loser: string, sp: string, wk: number) => {
    const dates = [...new Set(pds.filter(r => r.sport === sp && r.week === wk && (r.teamId === winner || r.teamId === loser)).map(r => r.date))].sort()
    if (dates.length < 2) return null
    let cw = 0, cl = 0, trailed = false
    for (let i = 0; i < dates.length; i++) {
      cw += pds.filter(r => r.teamId === winner && r.sport === sp && r.week === wk && r.date === dates[i]).reduce((s, r) => s + (r.points ?? 0), 0)
      cl += pds.filter(r => r.teamId === loser && r.sport === sp && r.week === wk && r.date === dates[i]).reduce((s, r) => s + (r.points ?? 0), 0)
      if (i < dates.length - 1 && cl - cw >= 3) trailed = true
    }
    return trailed && cw >= cl ? 'rallying from an early-week deficit' : null
  }

  const injuryNote = (teamId: string, sp: string) => {
    const hit = injured.find(r => r.teamId === teamId && r.sport === sp)
    return hit ? shortName(hit.name) : null
  }

  const slideTeam = (id: string | null, sp: string, score: number, other: number, complete: boolean, standing: number): SlideTeam => {
    const tm = id ? tById.get(id) : undefined
    return {
      name: tm?.name ?? '—',
      abbr: (tm?.abbreviation || tm?.name || '?').slice(0, 4).toUpperCase(),
      logo: tm?.altLogo || tm?.logo || null,
      primary: tm?.primary ?? '#0f172a', secondary: tm?.secondary ?? '#ffffff',
      record: id ? rc(id, sp) : '', standing, score: +score.toFixed(1), win: complete && score >= other,
    }
  }

  const topics: WireTopic[] = []
  const slides: WireSlide[] = []

  // ── One topic per sport: this week's games, records, storylines ─────────────
  for (const sp of sportsEnabled) {
    const all = ms.filter(m => m.sport === sp && m.awayTeamId)
    const incomplete = all.filter(m => !m.isComplete)
    const complete = all.filter(m => m.isComplete)
    const week = incomplete.length ? Math.min(...incomplete.map(m => m.week)) : (complete.length ? Math.max(...complete.map(m => m.week)) : 0)
    const ranked = recs.filter(r => r.sport === sp).sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0) || (b.pointsFor ?? 0) - (a.pointsFor ?? 0))
    const rankOf = new Map(ranked.map((r, i) => [r.teamId, i]))
    const pfRank = new Map([...ranked].sort((a, b) => (b.pointsFor ?? 0) - (a.pointsFor ?? 0)).map((r, i) => [r.teamId, i]))
    const N = ranked.length
    const maxWeek = all.length ? Math.max(...all.map(m => m.week)) : week
    const weeksLeft = Math.max(0, maxWeek - week)
    const cut = playoffTeams

    // The single most compelling angle for an upcoming game.
    const storyFor = (a: string, h: string): string => {
      const ar = recOf(a, sp), hr = recOf(h, sp)
      const ra = rankOf.get(a) ?? 99, rh = rankOf.get(h) ?? 99
      const aStk = streakOf(a, sp), hStk = streakOf(h, sp)
      const undA = (ar?.wins ?? 0) >= 2 && (ar?.losses ?? 1) === 0
      const undH = (hr?.wins ?? 0) >= 2 && (hr?.losses ?? 1) === 0
      const nearCut = (r: number) => cut > 0 && r >= cut - 2 && r <= cut          // straddling the playoff line
      // Prior meetings this season → revenge (biggest loss) and sweep watch.
      const priors = complete.filter(m => (m.homeTeamId === a && m.awayTeamId === h) || (m.homeTeamId === h && m.awayTeamId === a))
      let revengeFor: string | null = null, revMargin = 0
      const priorWinners = priors.map(m => (m.homeScore ?? 0) >= (m.awayScore ?? 0) ? m.homeTeamId : m.awayTeamId)
      for (const m of priors) {
        const margin = Math.abs((m.homeScore ?? 0) - (m.awayScore ?? 0))
        const winner = (m.homeScore ?? 0) >= (m.awayScore ?? 0) ? m.homeTeamId : m.awayTeamId
        if (margin > revMargin) { revMargin = margin; revengeFor = winner === a ? h : a }
      }
      const sweeper = priors.length >= 1 && priorWinners.every(w => w === priorWinners[0]) ? priorWinners[0] : null
      const winsA = ar?.wins ?? 0, winsH = hr?.wins ?? 0
      const milestone = (id: string, w: number, l: number) =>
        w === 9 ? `${ab(id)} a win from double digits` : (w === 0 && l >= 4 ? `${ab(id)} still chasing win #1` : null)

      // Current-form angles first — the freshest hook wins.
      if (undA && undH) return 'both unbeaten'
      if ((ra === 0 && rh === 1) || (ra === 1 && rh === 0)) return '1-seed showdown'
      if (undA) return `${ab(a)} unbeaten and rolling`
      if (undH) return `${ab(h)} unbeaten and rolling`
      if (areRivals(a, h)) return 'rivalry renewed'
      if (divisions > 0 && divOf(a) != null && divOf(a) === divOf(h)) return 'division rivalry'
      if (weeksLeft <= 3 && nearCut(ra) && nearCut(rh)) return 'win-and-in — a playoff spot on the line'
      if (weeksLeft <= 3 && (nearCut(ra) || nearCut(rh))) return 'playoff seeding at stake'
      if (aStk.win && aStk.n >= 3) return `${ab(a)} riding a ${aStk.n}-game win streak`
      if (hStk.win && hStk.n >= 3) return `${ab(h)} riding a ${hStk.n}-game win streak`
      if (aStk.win === false && aStk.n >= 3) return `${ab(a)} out to snap a ${aStk.n}-game slide`
      if (hStk.win === false && hStk.n >= 3) return `${ab(h)} out to snap a ${hStk.n}-game slide`
      if (ra === 0 && rh === N - 1) return 'best vs worst'
      if (rh === 0 && ra === N - 1) return 'best vs worst'
      if ((pfRank.get(a) ?? 99) <= 1 && (pfRank.get(h) ?? 99) <= 1) return "shootout — the sport's two top scorers"
      // History-based angles only when nothing fresher applies.
      if (revengeFor && revMargin >= 25) return `${ab(revengeFor)} out for revenge after a ${revMargin.toFixed(0)}-pt loss`
      if (sweeper && priors.length >= 2 && (sweeper === a || sweeper === h)) return `${ab(sweeper)} going for the season sweep`
      const mile = milestone(a, winsA, ar?.losses ?? 0) ?? milestone(h, winsH, hr?.losses ?? 0)
      if (mile) return mile
      if (N >= 6 && ra >= N - 3 && rh >= N - 3) return 'cellar clash'
      if (priors.length === 0) return 'first meeting of the season'
      return ''
    }

    // Recap flavor for a finished game: an upset, a rout, or a nail-biter.
    const flavorDone = (a: string, h: string, as: number, hs: number): string => {
      const total = as + hs, margin = Math.abs(as - hs)
      const winner = as >= hs ? a : h, loser = winner === a ? h : a
      const rw = rankOf.get(winner) ?? 99, rl = rankOf.get(loser) ?? 99
      if (rw - rl >= 3) return 'upset'
      if (total > 0 && margin / total >= 0.22) return 'in a rout'
      if (total > 0 && margin / total <= 0.03) return 'a nail-biter'
      return ''
    }

    // A finished game's recap: the result, the situational story (skid snapped,
    // week-long comeback, playoff climb), the players who carried it, and any
    // notable injury the loser played through.
    const recapNote = (a: string, h: string, as: number, hs: number, wk: number): string => {
      const winner = as >= hs ? a : h, loser = winner === a ? h : a
      const flav = flavorDone(a, h, as, hs)
      const verb = flav === 'upset' ? 'pull off the upset' : flav === 'in a rout' ? 'roll in a rout' : flav === 'a nail-biter' ? 'survive a nail-biter' : 'take it'
      const situ: string[] = []
      // Cap the skid to the record's actual losses so it agrees with the W-L shown.
      const skid = Math.min(skidSnapped(winner, sp, wk), recOf(winner, sp)?.losses ?? 0)
      if (skid >= 3) situ.push(`snapping a ${skid}-game skid`)
      const cb = comebackNote(winner, loser, sp, wk); if (cb) situ.push(cb)
      const climb = climbNote(winner, sp, wk, cut); if (climb) situ.push(climb)
      const parts = [`${nm(winner)} ${verb}${situ.length ? `, ${situ.slice(0, 2).join(' and ')}` : ''}`]
      const perf = topPerformers(winner, sp, wk)
      if (perf.length) {
        const who = perf.join(' and ')
        // Vary the credit so recaps don't all end "led by X and Y".
        switch (hashStr(`${winner}-${wk}-perf`) % 5) {
          case 0: parts.push(`led by ${who}`); break
          case 1: parts.push(`behind ${who}`); break
          case 2: parts.push(`powered by ${who}`); break
          case 3: parts.push(`${who} pacing the win`); break
          default: parts.push(`${who} doing the damage`)
        }
      }
      const inj = injuryNote(loser, sp); if (inj) parts.push(`${ab(loser)} played without ${inj}`)
      return parts.join(' — ')
    }

    const stand = (id: string) => (rankOf.get(id) ?? -1) + 1

    const items: WireItem[] = []
    for (const g of all.filter(m => m.week === week)) {
      const a = g.awayTeamId as string, h = g.homeTeamId
      const href = `${base}/matchup/${g.id}`
      const live = !g.isComplete && league.liveScoring && ((g.homeScore ?? 0) > 0 || (g.awayScore ?? 0) > 0)
      const status: 'Final' | 'LIVE' | 'PRE' = g.isComplete ? 'Final' : live ? 'LIVE' : 'PRE'
      if (g.isComplete) {
        const flav = flavorDone(a, h, g.awayScore ?? 0, g.homeScore ?? 0)
        items.push({ id: `g-${g.id}`, text: `${nm(a)} (${rc(a, sp)}) ${(g.awayScore ?? 0).toFixed(1)}, ${nm(h)} (${rc(h, sp)}) ${(g.homeScore ?? 0).toFixed(1)} — Final${flav ? ` · ${flav}` : ''}`, href })
        slides.push({ kind: 'game', id: `g-${g.id}`, sport: sp, sportName: sn(sp), sportLogo: spLogo(sp), status, href, note: recapNote(a, h, g.awayScore ?? 0, g.homeScore ?? 0, g.week),
          away: slideTeam(a, sp, g.awayScore ?? 0, g.homeScore ?? 0, true, stand(a)), home: slideTeam(h as string, sp, g.homeScore ?? 0, g.awayScore ?? 0, true, stand(h as string)) })
      } else {
        const story = storyFor(a, h)
        items.push({ id: `g-${g.id}`, text: `${nm(a)} (${rc(a, sp)}) vs ${nm(h)} (${rc(h, sp)})${story ? ` · ${story}` : ''}`, href })
        slides.push({ kind: 'game', id: `g-${g.id}`, sport: sp, sportName: sn(sp), sportLogo: spLogo(sp), status, href, note: story || `${sn(sp)} action`,
          away: slideTeam(a, sp, g.awayScore ?? 0, g.homeScore ?? 0, false, stand(a)), home: slideTeam(h as string, sp, g.homeScore ?? 0, g.awayScore ?? 0, false, stand(h as string)) })
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
  const toSlides = (topic: string, arr: WireItem[], sport?: string) => arr.map(i => ({ kind: 'news' as const, id: i.id, topic, sport, text: i.text, href: i.href }))

  // ── Federation Cup Race ─────────────────────────────────────────────────────
  const fedItems = toItems(headlines.filter(h => h.category === 'FEDERATION')).slice(0, 6)
  if (fedItems.length) { topics.push({ key: 'FEDCUP', title: 'Federation Cup Race', items: fedItems }); slides.push(...toSlides('Federation Cup Race', fedItems)) }

  // ── Breaking News ───────────────────────────────────────────────────────────
  const breaking: WireItem[] = []
  breaking.push(...toItems(headlines.filter(h =>
    h.category === 'CHAMPION' || h.category === 'PLAYOFF'
    // Only elite, rare feats reach Breaking News — routine milestones (a 4-hit
    // night, a double-double, 300 passing yards) stay in their sport topic.
    || (h.category === 'MILESTONE' && (h.priority ?? 0) >= 60)
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
  const rankedAt = Object.entries(allTime).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  // Only the very top of the all-time race is newsworthy — passing for #1–#3.
  for (let i = 1; i < Math.min(rankedAt.length, 4); i++) {
    const gap = rankedAt[i - 1][1] - rankedAt[i][1]
    if (gap > 0 && gap <= 3) breaking.push({ id: `alltime-${i}`, text: `${nm(rankedAt[i][0])} is ${gap.toFixed(0)} all-time Cup point${gap === 1 ? '' : 's'} from passing ${nm(rankedAt[i - 1][0])} for #${i}`, href: `${base}/history` })
  }
  const breakingTop = breaking.slice(0, 8)
  if (breakingTop.length) { topics.push({ key: 'BREAKING', title: 'Breaking News', items: breakingTop }); slides.push(...toSlides('Breaking News', breakingTop)) }

  // ── Trades & Transactions ───────────────────────────────────────────────────
  const txItems = toItems(headlines.filter(h => h.category === 'TRANSACTION')).slice(0, 8)
  if (txItems.length) { topics.push({ key: 'MOVES', title: 'Trades & Transactions', items: txItems }); slides.push(...toSlides('Trades & Transactions', txItems)) }

  return { topics: topics.filter(t => t.items.length), slides }
}

// Back-compat: existing callers that only need topics.
export async function buildWireTopics(leagueId: string): Promise<WireTopic[]> {
  return (await buildWire(leagueId)).topics
}
