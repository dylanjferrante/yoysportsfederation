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
  // Deterministic phrasing variety: same event always reads the same (no flicker
  // on refresh), but different events pick different wording, so the feed varies.
  const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
  const vary = (seed: string, ...opts: string[]) => opts[hashStr(seed) % opts.length]

  // Adaptive blowout/close bands. Rather than fixed margins, derive them from
  // the season's actual team scores in that sport — which already reflect the
  // current scoring settings — so changing scoring (or a sport's scale) auto-
  // adjusts what counts as a rout vs a nail-biter. A blowout is winning by ~25%
  // of a typical team's output; a nail-biter is within ~5%. Falls back to the
  // static SCORE_BANDS until enough games exist to measure.
  const bandFor = (sp: string) => {
    const scores = (bySport[sp]?.complete ?? []).flatMap(m => [m.homeScore ?? 0, m.awayScore ?? 0]).filter(v => v > 0)
    if (scores.length < 6) return SCORE_BANDS[sp] ?? DEFAULT_BAND
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    return { blowout: Math.max(1, +(avg * 0.25).toFixed(1)), close: Math.max(0.5, +(avg * 0.05).toFixed(1)) }
  }

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
      const band = bandFor(sp)
      const isBlow = margin >= band.blowout, isClose = margin <= band.close
      const prefix = isBlow ? vary(m.id, 'Blowout: ', 'Statement win: ', 'Rout: ', 'Laugher: ')
        : isClose ? vary(m.id, 'Nail-biter: ', 'Instant classic: ', 'Down to the wire: ', 'Thriller: ') : ''
      const verb = isClose ? vary(m.id, 'edges', 'sneaks past', 'survives', 'holds off', 'outlasts', 'nips')
        : isBlow ? vary(m.id, 'routs', 'demolishes', 'steamrolls', 'runs away from', 'hammers', 'blows out')
        : vary(m.id, 'def.', 'tops', 'takes down', 'handles', 'gets past', 'knocks off', 'outscores')
      return { id: `score-${m.id}`, category: 'SCORE', sport: sp, priority: 60 + (prefix ? 5 : 0), ts: tsOfWeek(wk),
        text: `${prefix}${nm(winId)} ${verb} ${nm(loseId)}, ${hi}–${lo}`, href: `${base}/scores` }
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

  // ── L. Stat-line milestones (real box scores) ──────────────────────────────
  await runA(async () => {
    const res: Headline[] = []
    for (const sp of sportsEnabled) {
      const wk = bySport[sp].lastWeek; if (!wk) continue
      const rows = (await db.select({ pid: playerGameStats.playerId, tid: playerGameStats.teamId, pts: playerGameStats.points, stats: playerGameStats.stats, name: players.name })
        .from(playerGameStats).innerJoin(players, eq(playerGameStats.playerId, players.id))
        .where(and(eq(playerGameStats.leagueId, leagueId), eq(playerGameStats.season, season), eq(playerGameStats.sport, sp), eq(playerGameStats.week, wk))))
        .sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0))
      const found: Headline[] = []
      for (const r of rows) {
        const s = safeParse<Record<string, number>>(r.stats ?? '{}', {})
        const who = `${r.name} (${nm(r.tid)})`
        const add = (txt: string, pr = 56) => found.push({ id: `mile-${sp}-${r.pid}-${wk}`, category: 'MILESTONE', sport: sp, priority: pr, ts: tsOfWeek(wk), text: `${who} ${txt}`, href: `${base}/scores` })
        if (sp === 'NHL') {
          const g = s.goals ?? 0, a = s.assists ?? 0, sv = s.saves ?? 0, ga = s.goalsAllowed ?? 0
          if (g >= 3) add(vary(r.pid, 'nets a hat trick', 'records a natural hat trick'), 62)
          else if (g + a >= 4) add(`piles up ${g + a} points (${g}G ${a}A)`, 58)
          else if (g === 2) add('bags a pair of goals')
          if (sv >= 28 && ga === 0) add(`slams the door — ${sv}-save shutout`, 60)
        } else if (sp === 'MLB') {
          const hr = s.homeRuns ?? 0, rbi = s.rbi ?? 0, kP = s.strikeoutsAsPitcher ?? 0
          const h = (s.singles ?? 0) + (s.doubles ?? 0) + (s.triples ?? 0) + hr
          if (hr >= 3) add(`goes deep ${hr} times`, 62)
          else if (hr === 2) add('launches a pair of homers', 58)
          if (rbi >= 5) add(`drives in ${rbi}`, 58)
          else if (kP >= 10) add(`fans ${kP} on the mound`, 60)
          else if (h >= 4) add(`collects ${h} hits`)
        } else if (sp === 'NBA') {
          const pts = s.points ?? 0, reb = (s.offRebounds ?? 0) + (s.defRebounds ?? 0), ast = s.assists ?? 0, stl = s.steals ?? 0, blk = s.blocks ?? 0, tpm = s.threesMade ?? 0
          const dd = [pts >= 10, reb >= 10, ast >= 10, stl >= 10, blk >= 10].filter(Boolean).length
          if (pts >= 10 && reb >= 10 && ast >= 10) add('posts a triple-double', 62)
          else if (dd >= 2) add(`logs a double-double (${pts}/${reb}/${ast})`, 56)
          else if (pts >= 40) add(`erupts for ${pts}`, 60)
          else if (tpm >= 7) add(`splashes ${tpm} threes`)
        } else if (sp === 'NFL') {
          const pY = s.passingYards ?? 0, pTD = s.passingTD ?? 0, rY = s.rushingYards ?? 0, reY = s.receivingYards ?? 0, rTD = s.rushingTD ?? 0, reTD = s.receivingTD ?? 0, rec = s.receptions ?? 0
          const td = pTD + rTD + reTD
          if (td >= 3) add(`accounts for ${td} touchdowns`, 60)
          else if (pY >= 300) add(`throws for ${pY} yards`)
          else if (rY >= 125) add(`runs for ${rY} yards`)
          else if (reY >= 110) add(`goes for ${reY} receiving yards${rec ? ` on ${rec} catches` : ''}`)
        }
      }
      res.push(...found.slice(0, 4))
    }
    return res
  })

  // ── M. Game of the week: shootout (highest combined) per sport ─────────────
  run(() => sportsEnabled.flatMap(sp => {
    const wk = bySport[sp].lastWeek; if (!wk) return []
    const games = bySport[sp].complete.filter(m => m.week === wk && Math.min(m.homeScore ?? 0, m.awayScore ?? 0) > 0)
    if (!games.length) return []
    const top = games.reduce((a, b) => ((b.homeScore ?? 0) + (b.awayScore ?? 0) > (a.homeScore ?? 0) + (a.awayScore ?? 0) ? b : a))
    const total = ((top.homeScore ?? 0) + (top.awayScore ?? 0)).toFixed(0)
    return [{ id: `shoot-${sp}-${wk}`, category: 'SHOOTOUT', sport: sp, priority: 50, ts: tsOfWeek(wk),
      text: `Shootout in ${sp}: ${nm(top.homeTeamId)} and ${nm(top.awayTeamId)} combine for ${total}`, href: `${base}/scores` }]
  }))

  // ── N. Power notes: scoring leader, best/worst overall, winless ────────────
  run(() => {
    const res: Headline[] = []
    for (const sp of sportsEnabled) {
      if (!bySport[sp].lastWeek) continue
      const ts = tsOfWeek(bySport[sp].lastWeek)
      const byPF = recsBySport(sp).slice().sort((a, b) => (b.pointsFor ?? 0) - (a.pointsFor ?? 0))
      if (byPF[0]) res.push({ id: `pf-${sp}`, category: 'POWER', sport: sp, priority: 44, ts, text: vary(`pf${sp}`, `${nm(byPF[0].teamId)} is the highest-scoring team in ${sp}`, `Nobody's scored more in ${sp} than ${nm(byPF[0].teamId)}`), href: base })
      const winless = recsBySport(sp).find(r => (r.wins ?? 0) === 0 && ((r.wins ?? 0) + (r.losses ?? 0) + (r.ties ?? 0)) >= 3)
      if (winless) res.push({ id: `winless-${sp}-${winless.teamId}`, category: 'POWER', sport: sp, priority: 36, ts, text: `${nm(winless.teamId)} is still searching for its first ${sp} win`, href: base })
    }
    // Best overall record across all sports.
    const totals = new Map<string, { w: number; l: number; pf: number }>()
    for (const r of recs) { const a = totals.get(r.teamId) ?? { w: 0, l: 0, pf: 0 }; a.w += r.wins ?? 0; a.l += r.losses ?? 0; a.pf += r.pointsFor ?? 0; totals.set(r.teamId, a) }
    const ranked = [...totals.entries()].sort((a, b) => b[1].w - a[1].w || b[1].pf - a[1].pf)
    if (ranked.length && ranked[0][1].w > 0) res.push({ id: 'best-overall', category: 'POWER', priority: 46, ts: Date.now(), text: vary('bestrec', `${nm(ranked[0][0])} owns the league's best overall record (${ranked[0][1].w}-${ranked[0][1].l})`, `${nm(ranked[0][0])} is the federation's winningest club at ${ranked[0][1].w}-${ranked[0][1].l}`), href: base })
    return res
  })

  // ── O. Pace projection ─────────────────────────────────────────────────────
  run(() => sportsEnabled.flatMap(sp => {
    const win = bySport[sp].win, leader = recsBySport(sp)[0]
    if (!win || !leader) return []
    const played = (leader.wins ?? 0) + (leader.losses ?? 0) + (leader.ties ?? 0)
    const total = win.endWeek - win.startWeek + 1
    if (played < 4 || played >= total - 1) return []
    const proj = Math.round((leader.wins ?? 0) / played * total)
    return [{ id: `pace-${sp}`, category: 'PACE', sport: sp, priority: 36, ts: tsOfWeek(bySport[sp].lastWeek),
      text: `${nm(leader.teamId)} is on pace for ${proj} wins in ${sp}`, href: base }]
  }))

  // ── P. Form: hot of late + league's longest active streak ──────────────────
  run(() => {
    const res: Headline[] = []
    for (const sp of sportsEnabled) {
      let longest = { team: '', n: 0 }
      for (const t of teamRows) {
        const r = teamResults(t.id, sp); if (r.length < 4) continue
        const last5 = r.slice(-5); const w = last5.filter(x => x.res === 'W').length
        let streak = 0; for (let i = r.length - 1; i >= 0 && r[i].res === 'W'; i--) streak++
        if (streak > longest.n) longest = { team: t.id, n: streak }
        if (w === 4 && last5.length === 5 && streak < 5) res.push({ id: `form-${sp}-${t.id}`, category: 'FORM', sport: sp, priority: 40, ts: tsOfWeek(bySport[sp].lastWeek), text: `${t.name} has won 4 of its last 5 in ${sp}`, href: base })
      }
      if (longest.n >= 4) res.push({ id: `longest-${sp}`, category: 'FORM', sport: sp, priority: 44, ts: tsOfWeek(bySport[sp].lastWeek), text: `${nm(longest.team)} owns the league's longest active ${sp} win streak (${longest.n})`, href: base })
    }
    return res
  })

  // ── Q. Federation total-points leader ──────────────────────────────────────
  run(() => {
    const pf = new Map<string, number>()
    for (const r of recs) pf.set(r.teamId, (pf.get(r.teamId) ?? 0) + (r.pointsFor ?? 0))
    const top = [...pf.entries()].sort((a, b) => b[1] - a[1])[0]
    if (!top || top[1] <= 0) return []
    return [{ id: 'fedpts', category: 'FEDERATION', priority: 42, ts: Date.now(), text: `${nm(top[0])} leads the federation in total points (${top[1].toFixed(0)})`, href: base }]
  })

  // ── R. Rivalry / rematch (current-week opponents who already met) ───────────
  run(() => sportsEnabled.flatMap(sp => {
    const wk = bySport[sp].curWeek; if (!wk) return []
    return bySport[sp].incomplete.filter(m => m.week === wk).flatMap(m => {
      const prior = bySport[sp].complete.find(p => (p.homeTeamId === m.homeTeamId && p.awayTeamId === m.awayTeamId) || (p.homeTeamId === m.awayTeamId && p.awayTeamId === m.homeTeamId))
      if (!prior) return []
      const homeWonFirst = (prior.homeTeamId === m.homeTeamId) === ((prior.homeScore ?? 0) >= (prior.awayScore ?? 0))
      const firstWinner = homeWonFirst ? m.homeTeamId : m.awayTeamId
      return [{ id: `rematch-${m.id}`, category: 'RIVALRY', sport: sp, priority: 30, ts: tsOfWeek(wk),
        text: vary(m.id, `Rematch in ${sp}: ${nm(firstWinner)} took the first meeting with ${nm(firstWinner === m.homeTeamId ? m.awayTeamId : m.homeTeamId)}`, `${nm(m.homeTeamId)} and ${nm(m.awayTeamId)} run it back in ${sp}`), href: `${base}/scores` }]
    })
  }))

  // ── S. Busiest GM (recent activity) ────────────────────────────────────────
  await runA(async () => {
    const tr = await db.select({ a: trades.initiatorId, b: trades.recipientId }).from(trades).where(and(eq(trades.leagueId, leagueId), eq(trades.status, 'ACCEPTED')))
    const wc = await db.select({ t: waiverClaims.teamId }).from(waiverClaims).where(and(eq(waiverClaims.leagueId, leagueId), eq(waiverClaims.status, 'SUCCESS')))
    const cnt = new Map<string, number>()
    for (const t of tr) { for (const id of [t.a, t.b]) if (id) cnt.set(id, (cnt.get(id) ?? 0) + 1) }
    for (const w of wc) cnt.set(w.t, (cnt.get(w.t) ?? 0) + 1)
    const top = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]
    if (!top || top[1] < 3) return []
    return [{ id: 'busiest-gm', category: 'TRANSACTION', priority: 33, ts: Date.now(), text: `${nm(top[0])} has been the league's busiest GM (${top[1]} moves)`, href: `${base}/transactions` }]
  })

  // ── T. Schedule: midpoint + playoff push ───────────────────────────────────
  run(() => sportsEnabled.flatMap(sp => {
    const win = bySport[sp].win; if (!win || !bySport[sp].lastWeek) return []
    const res: Headline[] = []
    const mid = Math.floor((win.startWeek + win.endWeek) / 2)
    if (bySport[sp].lastWeek === mid) res.push({ id: `mid-${sp}`, category: 'SCHEDULE', sport: sp, priority: 33, ts: tsOfWeek(mid), text: `${sp} hits the midpoint of the season`, href: base })
    const remaining = win.endWeek - bySport[sp].lastWeek
    if (remaining > 0 && remaining <= 3) res.push({ id: `push-${sp}`, category: 'SCHEDULE', sport: sp, priority: 46, ts: tsOfWeek(bySport[sp].lastWeek), text: `Playoff push: ${playoffTeams} ${sp} spots up for grabs with ${remaining} week${remaining === 1 ? '' : 's'} to play`, href: base })
    return res
  }))

  // ── Rank, dedupe, then diversify so one category can't swamp the feed ───────
  const seen = new Set<string>()
  const ranked = out
    .filter(h => h.text && (seen.has(h.id) ? false : (seen.add(h.id), true)))
    .sort((a, b) => b.priority - a.priority || b.ts - a.ts)
  // Keep the highest-priority items per category up to a cap, so scores don't
  // crowd out streaks/standings/previews/transactions (ESPN-style variety).
  const CAP: Record<string, number> = {
    SCORE: 7, LIVE: 4, PREVIEW: 4, STREAK: 4, STANDINGS: 4, SUPERLATIVE: 3, PERFORMANCE: 3,
    MILESTONE: 6, SHOOTOUT: 3, POWER: 4, PACE: 3, FORM: 4, RIVALRY: 3,
    TRANSACTION: 4, PLAYOFF: 6, CHAMPION: 4, FEDERATION: 3, GOVERNANCE: 3, SCHEDULE: 4,
  }
  const perCat: Record<string, number> = {}
  return ranked
    .filter(h => { const n = (perCat[h.category] = (perCat[h.category] ?? 0) + 1); return n <= (CAP[h.category] ?? 4) })
    .sort((a, b) => b.priority - a.priority || b.ts - a.ts)
    .slice(0, 40)
}
