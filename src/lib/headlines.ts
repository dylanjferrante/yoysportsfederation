import { db } from '@/db'
import { leagues, teams, teamRecords, matchups, leagueHistory, playoffGames, trades, tradeItems, waiverClaims, proposals, players, playerGameStats } from '@/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { safeParse } from '@/lib/utils'
import { weekDateRange } from '@/lib/defaults'

// ── Federation "BottomLine" ticker ───────────────────────────────────────────
// Generates an ESPN-style headline feed for a league entirely from stored data
// (no provider calls). Each generator emits Headline objects; the builder ranks
// them by priority then recency, dedupes, and caps the list. Generators are
// individually guarded so one failing never blanks the ticker.

export type Headline = { id: string; category: string; sport?: string; priority: number; ts: number; text: string; href: string }

// Per-sport score bands for "blowout"/"nail-biter" flavor. Weekly point totals
// differ enormously by sport (an NBA week runs ~10x an NFL week), so a margin
// that's a rout in football is noise in basketball. Tune to your league's
// scoring; see docs/ticker-headlines.md for the reference totals these assume.
export const SCORE_BANDS: Record<string, { blowout: number; close: number }> = {
  NFL: { blowout: 35, close: 5 },   // ~110–170 pts/week
  NBA: { blowout: 250, close: 30 }, // ~900–1300 pts/week
  NHL: { blowout: 45, close: 6 },   // ~110–180 pts/week
  MLB: { blowout: 18, close: 3 },   // lower, pitcher-driven, can dip near 0
}
const DEFAULT_BAND = { blowout: 40, close: 5 }

const RESERVE = ['BN', 'IR', 'IL', 'DL', 'TAXI']

export async function buildHeadlines(leagueId: string): Promise<Headline[]> {
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId)).limit(1)
  if (!league) return []
  const season = league.season
  const base = `/leagues/${leagueId}`
  const sportsEnabled = safeParse<string[]>(league.sportsEnabled, [])
  const schedule = safeParse<{ sport: string; startWeek: number; endWeek: number }[]>(league.sportSchedule, [])
  const playoffTeams = league.playoffTeams ?? 4

  const teamRows = await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation }).from(teams).where(eq(teams.leagueId, leagueId))
  const teamsById = new Map(teamRows.map(t => [t.id, t]))
  const nm = (id: string | null | undefined) => (id && teamsById.get(id)?.name) || 'A team'

  const recs = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, leagueId), eq(teamRecords.season, season)))
  const ms = await db.select().from(matchups).where(and(eq(matchups.leagueId, leagueId), eq(matchups.season, season)))
  const history = await db.select().from(leagueHistory).where(eq(leagueHistory.leagueId, leagueId))

  // Per-sport matchup structure.
  type M = typeof ms[number]
  const bySport: Record<string, { complete: M[]; incomplete: M[]; lastWeek: number; curWeek: number; win: { sport: string; startWeek: number; endWeek: number } | undefined }> = {}
  for (const sp of sportsEnabled) {
    const all = ms.filter(m => m.sport === sp && m.awayTeamId) // skip bye placeholders
    const complete = all.filter(m => m.isComplete).sort((a, b) => a.week - b.week)
    const incomplete = all.filter(m => !m.isComplete).sort((a, b) => a.week - b.week)
    bySport[sp] = {
      complete, incomplete,
      lastWeek: complete.length ? Math.max(...complete.map(m => m.week)) : 0,
      curWeek: incomplete.length ? Math.min(...incomplete.map(m => m.week)) : 0,
      win: schedule.find(s => s.sport === sp),
    }
  }
  const recsBySport = (sp: string) => recs.filter(r => r.sport === sp)
    .sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0) || (b.pointsFor ?? 0) - (a.pointsFor ?? 0))
  const recOf = (teamId: string, sp: string) => recs.find(r => r.teamId === teamId && r.sport === sp)
  const tsOfWeek = (week: number) => { try { return weekDateRange(season, week || 1).start.getTime() } catch { return 0 } }
  const rec3 = (w: number, l: number, t: number) => `${w}-${l}${t ? `-${t}` : ''}`

  const out: Headline[] = []
  const run = (fn: () => Headline[] | void) => { try { const r = fn(); if (r) out.push(...r) } catch { /* one generator failing must not blank the ticker */ } }
  // Async generators (need extra queries) are awaited individually with the same guard.
  const runA = async (fn: () => Promise<Headline[] | void>) => { try { const r = await fn(); if (r) out.push(...r) } catch { /* ignore */ } }

  // Per-team ordered results in a sport (for streaks).
  const teamResults = (teamId: string, sp: string) => bySport[sp].complete
    .filter(m => m.homeTeamId === teamId || m.awayTeamId === teamId)
    .map(m => {
      const home = m.homeTeamId === teamId
      const mine = (home ? m.homeScore : m.awayScore) ?? 0
      const theirs = (home ? m.awayScore : m.homeScore) ?? 0
      return { week: m.week, res: mine > theirs ? 'W' : mine < theirs ? 'L' : 'T', opp: home ? m.awayTeamId : m.homeTeamId, mine, theirs }
    })

  // ── A. Scores (final + live) ───────────────────────────────────────────────
  run(() => sportsEnabled.flatMap(sp => {
    const wk = bySport[sp].lastWeek
    if (!wk) return []
    return bySport[sp].complete.filter(m => m.week === wk && Math.min(m.homeScore ?? 0, m.awayScore ?? 0) > 0).slice(0, 6).map(m => {
      const hs = m.homeScore ?? 0, as = m.awayScore ?? 0
      const winId = hs >= as ? m.homeTeamId : m.awayTeamId, loseId = hs >= as ? m.awayTeamId : m.homeTeamId
      const hi = Math.max(hs, as).toFixed(1), lo = Math.min(hs, as).toFixed(1)
      const margin = Math.abs(hs - as)
      const band = SCORE_BANDS[sp] ?? DEFAULT_BAND
      const flavor = margin >= band.blowout ? 'Blowout: ' : margin <= band.close ? 'Nail-biter: ' : ''
      const verb = margin <= band.close ? 'edges' : margin >= band.blowout ? 'routs' : 'def.'
      return { id: `score-${m.id}`, category: 'SCORE', sport: sp, priority: 60 + (flavor ? 5 : 0), ts: tsOfWeek(wk),
        text: `${flavor}${nm(winId)} ${verb} ${nm(loseId)}, ${hi}–${lo}`, href: `${base}/scores` }
    })
  }))
  if (league.liveScoring) run(() => sportsEnabled.flatMap(sp => bySport[sp].incomplete
    .filter(m => (m.homeScore ?? 0) > 0 || (m.awayScore ?? 0) > 0)
    .slice(0, 4)
    .map(m => ({ id: `live-${m.id}`, category: 'LIVE', sport: sp, priority: 85, ts: Date.now(),
      text: `LIVE · ${nm(m.homeTeamId)} ${(m.homeScore ?? 0).toFixed(1)} – ${(m.awayTeamId && (m.awayScore ?? 0).toFixed(1)) || '—'} ${nm(m.awayTeamId)}`, href: `${base}/scores` }))))

  // ── B. Previews (current week) ─────────────────────────────────────────────
  run(() => sportsEnabled.flatMap(sp => {
    const wk = bySport[sp].curWeek
    if (!wk) return []
    const top3 = new Set(recsBySport(sp).slice(0, 3).map(r => r.teamId))
    return bySport[sp].incomplete.filter(m => m.week === wk).slice(0, 4).map(m => {
      const hr = recOf(m.homeTeamId, sp), ar = m.awayTeamId ? recOf(m.awayTeamId, sp) : undefined
      const undef = [{ id: m.homeTeamId, r: hr }, { id: m.awayTeamId, r: ar }].find(x => x.r && (x.r.wins ?? 0) >= 3 && (x.r.losses ?? 0) === 0)
      let text: string, priority = 25
      if (undef) { const opp = undef.id === m.homeTeamId ? m.awayTeamId : m.homeTeamId
        text = `${nm(undef.id)} looks to stay perfect (${undef.r!.wins}-0) in ${sp} vs ${nm(opp)}`; priority = 50 }
      else if (top3.has(m.homeTeamId) && m.awayTeamId && top3.has(m.awayTeamId)) {
        text = `Top-3 clash in ${sp}: ${nm(m.homeTeamId)} vs ${nm(m.awayTeamId)}`; priority = 45 }
      else text = `${nm(m.homeTeamId)} (${rec3(hr?.wins ?? 0, hr?.losses ?? 0, hr?.ties ?? 0)}) vs ${nm(m.awayTeamId)} (${rec3(ar?.wins ?? 0, ar?.losses ?? 0, ar?.ties ?? 0)}) this week in ${sp}`
      return { id: `prev-${m.id}`, category: 'PREVIEW', sport: sp, priority, ts: tsOfWeek(wk), text, href: `${base}/scores` }
    })
  }))

  // ── C. Streaks ─────────────────────────────────────────────────────────────
  run(() => {
    const res: Headline[] = []
    for (const sp of sportsEnabled) for (const t of teamRows) {
      const r = teamResults(t.id, sp)
      if (r.length < 2) continue
      const last = r[r.length - 1]
      let streak = 1
      for (let i = r.length - 2; i >= 0 && r[i].res === last.res; i--) streak++
      const ts = tsOfWeek(last.week)
      const allW = r.every(x => x.res === 'W')
      if (last.res === 'W' && allW && r.length >= 3) {
        res.push({ id: `perfect-${sp}-${t.id}`, category: 'STREAK', sport: sp, priority: 65, ts, text: `${t.name} stays perfect at ${r.length}-0 in ${sp}`, href: base })
      } else if (last.res === 'W' && streak === 1) {
        // First win after a losing skid: find the previous win's week.
        let losses = 0; let i = r.length - 2
        for (; i >= 0 && r[i].res === 'L'; i--) losses++
        if (losses >= 2) {
          const prevWin = [...r].slice(0, r.length - 1).reverse().find(x => x.res === 'W')
          const since = prevWin ? `Week ${prevWin.week}` : 'the season opener'
          res.push({ id: `firstwin-${sp}-${t.id}`, category: 'STREAK', sport: sp, priority: 60, ts, text: `${t.name} gets its first ${sp} win since ${since}`, href: base })
        }
      } else if (last.res === 'W' && streak >= 3) {
        res.push({ id: `winstreak-${sp}-${t.id}`, category: 'STREAK', sport: sp, priority: 45, ts, text: `${t.name} rides a ${streak}-game win streak in ${sp}`, href: base })
      } else if (last.res === 'L' && streak >= 3) {
        res.push({ id: `loss-${sp}-${t.id}`, category: 'STREAK', sport: sp, priority: 38, ts, text: `${t.name} drops its ${streak}th straight in ${sp}`, href: base })
      }
      // Snapped: this week's loss ended a 3+ win streak.
      if (last.res === 'L') {
        let wbefore = 0
        for (let i = r.length - 2; i >= 0 && r[i].res === 'W'; i--) wbefore++
        if (wbefore >= 3) res.push({ id: `snap-${sp}-${t.id}`, category: 'STREAK', sport: sp, priority: 42, ts, text: `${nm(last.opp)} snaps ${t.name}'s ${wbefore}-game ${sp} win streak`, href: base })
      }
    }
    return res
  })

  // ── D. Standings & milestones ──────────────────────────────────────────────
  run(() => {
    const res: Headline[] = []
    for (const sp of sportsEnabled) {
      const table = recsBySport(sp)
      if (table.length < 2 || !bySport[sp].lastWeek) continue
      const win = bySport[sp].win
      const remaining = win ? Math.max(0, win.endWeek - bySport[sp].lastWeek) : 0
      const ts = tsOfWeek(bySport[sp].lastWeek)
      const leader = table[0], second = table[1]
      res.push({ id: `lead-${sp}`, category: 'STANDINGS', sport: sp, priority: 40, ts, text: `${nm(leader.teamId)} leads ${sp} at ${rec3(leader.wins ?? 0, leader.losses ?? 0, leader.ties ?? 0)}`, href: base })
      // Clinch / magic number for the #1 seed (wins-based approximation).
      if (remaining > 0) {
        const lead = (leader.wins ?? 0) - (second.wins ?? 0)
        if (lead > remaining) res.push({ id: `clinch1-${sp}`, category: 'STANDINGS', sport: sp, priority: 75, ts, text: `${nm(leader.teamId)} clinches the ${sp} #1 seed`, href: base })
        else { const magic = remaining - lead + 1; if (magic > 0 && magic <= 4) res.push({ id: `magic-${sp}`, category: 'STANDINGS', sport: sp, priority: 55, ts, text: `Magic number: ${nm(leader.teamId)} needs ${magic} more to clinch the ${sp} #1 seed`, href: base }) }
        // Elimination: can't reach the playoff cutoff even winning out.
        const cutoff = table[Math.min(playoffTeams, table.length) - 1]
        for (const r of table.slice(playoffTeams)) {
          if ((r.wins ?? 0) + remaining < (cutoff?.wins ?? 0)) res.push({ id: `elim-${sp}-${r.teamId}`, category: 'STANDINGS', sport: sp, priority: 50, ts, text: `${nm(r.teamId)} is eliminated from ${sp} playoff contention`, href: base })
        }
      }
    }
    return res
  })

  // ── E. Superlatives ────────────────────────────────────────────────────────
  run(() => sportsEnabled.flatMap(sp => {
    const c = bySport[sp].complete
    if (!c.length) return []
    const scores = c.flatMap(m => [{ team: m.homeTeamId, pts: m.homeScore ?? 0, week: m.week }, { team: m.awayTeamId!, pts: m.awayScore ?? 0, week: m.week }])
    const seasonHigh = scores.reduce((a, b) => (b.pts > a.pts ? b : a))
    const wk = bySport[sp].lastWeek
    const weekHigh = scores.filter(s => s.week === wk).reduce((a, b) => (b.pts > a.pts ? b : a), { team: '', pts: -1, week: wk })
    const res: Headline[] = []
    if (weekHigh.pts >= 0) res.push({ id: `wkhigh-${sp}-${wk}`, category: 'SUPERLATIVE', sport: sp, priority: 55, ts: tsOfWeek(wk), text: `Week ${wk} ${sp} high: ${nm(weekHigh.team)} drops ${weekHigh.pts.toFixed(1)}`, href: `${base}/scores` })
    if (seasonHigh.week === wk) res.push({ id: `seahigh-${sp}`, category: 'SUPERLATIVE', sport: sp, priority: 58, ts: tsOfWeek(wk), text: `Season high: ${nm(seasonHigh.team)}'s ${seasonHigh.pts.toFixed(1)} is the most in ${sp} all year`, href: `${base}/scores` })
    return res
  }))

  // ── F. Player performances (real stats) ────────────────────────────────────
  await runA(async () => {
    const res: Headline[] = []
    for (const sp of sportsEnabled) {
      const wk = bySport[sp].lastWeek
      if (!wk) continue
      const top = await db.select({ playerId: playerGameStats.playerId, teamId: playerGameStats.teamId, points: playerGameStats.points, name: players.name })
        .from(playerGameStats).innerJoin(players, eq(playerGameStats.playerId, players.id))
        .where(and(eq(playerGameStats.leagueId, leagueId), eq(playerGameStats.season, season), eq(playerGameStats.sport, sp), eq(playerGameStats.week, wk)))
      if (!top.length) continue
      const best = top.reduce((a, b) => ((b.points ?? 0) > (a.points ?? 0) ? b : a))
      if ((best.points ?? 0) > 0) res.push({ id: `perf-${sp}-${wk}`, category: 'PERFORMANCE', sport: sp, priority: 52, ts: tsOfWeek(wk),
        text: `${best.name} (${nm(best.teamId)}) leads ${sp} scorers in Week ${wk} with ${(best.points ?? 0).toFixed(1)}`, href: `${base}/scores` })
    }
    return res
  })

  // ── G. Transactions ────────────────────────────────────────────────────────
  await runA(async () => {
    const res: Headline[] = []
    const done = await db.select().from(trades).where(and(eq(trades.leagueId, leagueId), eq(trades.status, 'ACCEPTED')))
    const recent = done.sort((a, b) => (Date.parse(b.processedAt ?? b.updatedAt ?? '') || 0) - (Date.parse(a.processedAt ?? a.updatedAt ?? '') || 0)).slice(0, 3)
    for (const tr of recent) {
      const items = await db.select({ toTeamId: tradeItems.toTeamId, name: players.name }).from(tradeItems).leftJoin(players, eq(tradeItems.playerId, players.id)).where(eq(tradeItems.tradeId, tr.id))
      const names = items.filter(i => i.name).map(i => i.name)
      const label = names.length ? names.slice(0, 4).join(', ') : 'players & picks'
      res.push({ id: `trade-${tr.id}`, category: 'TRANSACTION', priority: 55, ts: Date.parse(tr.processedAt ?? tr.updatedAt ?? '') || 0, text: `Trade: ${nm(tr.initiatorId)} and ${nm(tr.recipientId)} swap ${label}`, href: `${base}/transactions` })
    }
    const claims = await db.select({ teamId: waiverClaims.teamId, sport: waiverClaims.sport, bid: waiverClaims.bidAmount, processedAt: waiverClaims.processedAt, name: players.name })
      .from(waiverClaims).innerJoin(players, eq(waiverClaims.addPlayerId, players.id))
      .where(and(eq(waiverClaims.leagueId, leagueId), eq(waiverClaims.status, 'SUCCESS')))
    for (const c of claims.sort((a, b) => (Date.parse(b.processedAt ?? '') || 0) - (Date.parse(a.processedAt ?? '') || 0)).slice(0, 3)) {
      res.push({ id: `waiver-${c.teamId}-${c.name}`, category: 'TRANSACTION', sport: c.sport ?? undefined, priority: 40, ts: Date.parse(c.processedAt ?? '') || 0, text: `${nm(c.teamId)} lands ${c.name} off waivers${(c.bid ?? 0) > 0 ? ` ($${c.bid} FAAB)` : ''}`, href: `${base}/transactions` })
    }
    return res
  })

  // ── H. Playoffs ────────────────────────────────────────────────────────────
  await runA(async () => {
    const pg = await db.select().from(playoffGames).where(and(eq(playoffGames.leagueId, leagueId), eq(playoffGames.season, season), eq(playoffGames.isComplete, true)))
    return pg.filter(g => (g.bracket ?? 'WINNERS') === 'WINNERS' && g.homeTeamId && g.awayTeamId).map(g => {
      const winId = g.winnerTeamId, loseId = winId === g.homeTeamId ? g.awayTeamId : g.homeTeamId
      const winSeed = winId === g.homeTeamId ? g.homeSeed : g.awaySeed, loseSeed = winId === g.homeTeamId ? g.awaySeed : g.homeSeed
      const upset = winSeed != null && loseSeed != null && winSeed > loseSeed
      const hi = Math.max(g.homeScore ?? 0, g.awayScore ?? 0).toFixed(1), lo = Math.min(g.homeScore ?? 0, g.awayScore ?? 0).toFixed(1)
      return { id: `po-${g.id}`, category: 'PLAYOFF', sport: g.sport, priority: upset ? 90 : 80, ts: tsOfWeek((bySport[g.sport]?.win?.endWeek ?? 0) + g.round),
        text: `${upset ? 'Upset! ' : ''}${nm(winId)}${winSeed ? ` (#${winSeed})` : ''} ${upset ? 'knocks off' : 'tops'} ${nm(loseId)}${loseSeed ? ` (#${loseSeed})` : ''} in the ${g.sport} playoffs, ${hi}–${lo}`, href: `${base}/playoffs` }
    })
  })
  // Championships (per sport) from history.
  run(() => history.filter(h => h.season === season && h.scope !== 'OVERALL' && h.championTeamId).map(h => ({
    id: `champ-${h.id}`, category: 'CHAMPION', sport: h.scope, priority: 95, ts: Date.now(), text: `🏆 ${nm(h.championTeamId)} wins the ${h.scope} championship!`, href: `${base}/history` })))

  // ── I. Federation / cross-sport ────────────────────────────────────────────
  run(() => history.filter(h => h.season === season && h.scope === 'OVERALL' && h.championTeamId).map(h => ({
    id: `fedchamp-${h.id}`, category: 'FEDERATION', priority: 100, ts: Date.now(), text: `👑 ${nm(h.championTeamId)} wins the Federation championship!`, href: `${base}/history` })))
  run(() => {
    // Weekly sweep: a team that won every sport it played in the latest shared week.
    const weeks = sportsEnabled.map(sp => bySport[sp].lastWeek).filter(Boolean)
    if (!weeks.length) return []
    const wk = Math.min(...weeks)
    const wins: Record<string, { w: number; played: number }> = {}
    for (const sp of sportsEnabled) for (const m of bySport[sp].complete.filter(x => x.week === wk)) {
      const hWin = (m.homeScore ?? 0) >= (m.awayScore ?? 0)
      for (const [id, won] of [[m.homeTeamId, hWin], [m.awayTeamId, !hWin]] as [string, boolean][]) {
        const a = (wins[id] ??= { w: 0, played: 0 }); a.played++; if (won) a.w++
      }
    }
    return Object.entries(wins).filter(([, v]) => v.played >= 2 && v.w === v.played)
      .map(([id, v]) => ({ id: `sweep-${id}-${wk}`, category: 'FEDERATION', priority: 70, ts: tsOfWeek(wk), text: `${nm(id)} swept Week ${wk} — wins in all ${v.played} sports`, href: base }))
  })

  // ── J. Governance ──────────────────────────────────────────────────────────
  await runA(async () => {
    const props = await db.select().from(proposals).where(eq(proposals.leagueId, leagueId))
    const res: Headline[] = []
    for (const p of props) {
      if (p.status === 'OPEN' && p.closesAt) {
        const ms = Date.parse(p.closesAt) - Date.now()
        if (ms > 0) { const d = Math.ceil(ms / 86_400_000); res.push({ id: `vote-${p.id}`, category: 'GOVERNANCE', priority: 48, ts: Date.now(), text: `🗳️ Vote open: “${p.title}” — ${d} day${d === 1 ? '' : 's'} left`, href: `${base}/proposals` }) }
      } else if ((p.status === 'PASSED' || p.status === 'FAILED') && p.resolvedAt) {
        res.push({ id: `prop-${p.id}`, category: 'GOVERNANCE', priority: 36, ts: Date.parse(p.resolvedAt) || 0, text: `Proposal ${p.status === 'PASSED' ? 'passed' : 'failed'}: “${p.title}”`, href: `${base}/proposals` })
      }
    }
    return res
  })

  // ── K. Situational (season phase) ──────────────────────────────────────────
  run(() => sportsEnabled.flatMap(sp => {
    const w = bySport[sp].win; if (!w) return []
    const res: Headline[] = []
    if (bySport[sp].curWeek === w.startWeek && bySport[sp].lastWeek === 0)
      res.push({ id: `open-${sp}`, category: 'SCHEDULE', sport: sp, priority: 32, ts: tsOfWeek(w.startWeek), text: `${sp} season opens this week`, href: `${base}/scores` })
    if (bySport[sp].lastWeek === w.endWeek && bySport[sp].incomplete.length === 0)
      res.push({ id: `wrap-${sp}`, category: 'SCHEDULE', sport: sp, priority: 34, ts: tsOfWeek(w.endWeek), text: `${sp} regular season wraps — playoffs next`, href: `${base}/playoffs` })
    return res
  }))

  // ── Rank, dedupe, then diversify so one category can't swamp the feed ───────
  const seen = new Set<string>()
  const ranked = out
    .filter(h => h.text && (seen.has(h.id) ? false : (seen.add(h.id), true)))
    .sort((a, b) => b.priority - a.priority || b.ts - a.ts)
  // Keep the highest-priority items per category up to a cap, so scores don't
  // crowd out streaks/standings/previews/transactions (ESPN-style variety).
  const CAP: Record<string, number> = { SCORE: 8, LIVE: 4, PREVIEW: 4, STREAK: 5, STANDINGS: 5, SUPERLATIVE: 4, PERFORMANCE: 4, TRANSACTION: 4, PLAYOFF: 6, CHAMPION: 4, FEDERATION: 3, GOVERNANCE: 3, SCHEDULE: 3 }
  const perCat: Record<string, number> = {}
  return ranked
    .filter(h => { const n = (perCat[h.category] = (perCat[h.category] ?? 0) + 1); return n <= (CAP[h.category] ?? 4) })
    .sort((a, b) => b.priority - a.priority || b.ts - a.ts)
    .slice(0, 28)
}
