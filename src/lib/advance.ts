import 'server-only'
import { db } from '@/db'
import { leagues, teams, teamRecords, rosters, players, matchups, playerGameStats, playoffGames, leagueHistory, realStatLines, rosterSnapshots } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { safeParse } from '@/lib/utils'
import { RESERVE_SLOTS, slotEligible, buildWeeklyPairings, sportsActiveInWeek, scheduleWeeks, lineupCadenceFor, type ScheduleEntry } from '@/lib/defaults'
import { weekDates, gameDateOf, leagueDayLineups } from '@/lib/dailylineup'
import { scorePlayer } from '@/lib/scoring'
import { computeFederationStandings } from '@/lib/federation'
import { logActivity } from '@/lib/activity'
import { runWaivers } from '@/lib/waivers'
import { snapshotSeasonBranding, snapshotSportRoster } from '@/lib/seasons'

const isStarter = (slot: string) => !RESERVE_SLOTS.includes(slot)

type ScoreRosterRow = { playerId: string; teamId: string; slot: string; position: string; projected: number | null; status: string | null; byeWeek: number | null; realTeamAbbr: string | null }

// The roster rows to score for a (season, sport). Liveness is decided PER SPORT,
// not per federation season: sports run sequentially, so a new football season
// can begin while the prior season's baseball is still being played. A sport is
// frozen the moment its champion is crowned (or a commissioner archives it),
// which writes a roster_snapshot; from then on that sport-season scores from the
// snapshot, so next-season roster moves can't retroactively change it. A sport
// with no snapshot yet — an in-progress sport, including a prior season's sport
// still in play — scores from the live rosters table and stays fully editable.
async function rostersForScoring(league: any, sport: string, teamId?: string): Promise<ScoreRosterRow[]> {
  const cols = {
    playerId: players.id, teamId: rosters.teamId, slot: rosters.slot, position: players.position,
    projected: players.projectedPoints, status: players.status, byeWeek: players.byeWeek, realTeamAbbr: players.realTeamAbbr,
  }
  const [frozen] = await db.select({ id: rosterSnapshots.id }).from(rosterSnapshots)
    .where(and(eq(rosterSnapshots.leagueId, league.id), eq(rosterSnapshots.season, league.season), eq(rosterSnapshots.sport, sport))).limit(1)
  if (!frozen) {
    const conds = [eq(teams.leagueId, league.id), eq(rosters.sport, sport)]
    if (teamId) conds.push(eq(rosters.teamId, teamId))
    const rows = await db.select(cols).from(rosters)
      .innerJoin(players, eq(rosters.playerId, players.id)).innerJoin(teams, eq(rosters.teamId, teams.id))
      .where(and(...conds))
    return rows.map(r => ({ ...r, slot: r.slot ?? 'BN' }))
  }
  const conds = [eq(rosterSnapshots.leagueId, league.id), eq(rosterSnapshots.season, league.season), eq(rosterSnapshots.sport, sport)]
  if (teamId) conds.push(eq(rosterSnapshots.teamId, teamId))
  const rows = await db.select({ ...cols, playerId: players.id, teamId: rosterSnapshots.teamId, slot: rosterSnapshots.slot })
    .from(rosterSnapshots).innerJoin(players, eq(rosterSnapshots.playerId, players.id))
    .where(and(...conds))
  return rows.map(r => ({ ...r, slot: r.slot ?? 'BN' }))
}

// A starter is auto-subbed if they're clearly unavailable that week.
const OUT_STATUSES = ['OUT', 'INJURED', 'IR', 'IL', 'DL', 'PUP', 'NFI', 'SUSPENDED', 'LTIR']
function isInactive(status: string | null | undefined, byeWeek: number | null | undefined, week: number): boolean {
  if (byeWeek != null && byeWeek === week) return true
  return OUT_STATUSES.includes((status ?? 'ACTIVE').toUpperCase())
}

type Scored = { slot: string; position: string; pts: number; status?: string | null; byeWeek?: number | null }

// Sum a team's starters for the week, auto-substituting an inactive starter with
// the best eligible active bench player, then applying the MLB SP cap.
function effectiveTotal(sport: string, spCap: number, week: number, roster: Scored[]): number {
  const starters = roster.filter(r => isStarter(r.slot))
  const bench = roster.filter(r => r.slot === 'BN' && !isInactive(r.status, r.byeWeek, week)).sort((a, b) => b.pts - a.pts)
  const used = new Set<number>()
  const effective: { position: string; pts: number }[] = []
  for (const st of starters) {
    if (!isInactive(st.status, st.byeWeek, week)) { effective.push({ position: st.position, pts: st.pts }); continue }
    const idx = bench.findIndex((b, i) => !used.has(i) && slotEligible(b.position, st.slot))
    if (idx >= 0) { used.add(idx); effective.push({ position: bench[idx].position, pts: bench[idx].pts }) }
    else effective.push({ position: st.position, pts: 0 }) // nobody eligible → 0 for the week
  }
  return +sumWithSpCap(sport, effective, spCap).toFixed(1)
}

// MLB weekly starting-pitcher cap: only the top `cap` SP scores count; extra
// starting pitchers contribute nothing that week. cap <= 0 means unlimited.
function sumWithSpCap(sport: string, starters: { position: string; pts: number }[], cap: number): number {
  if (sport !== 'MLB' || !cap || cap <= 0) return starters.reduce((a, s) => a + s.pts, 0)
  const sp = starters.filter(s => s.position === 'SP').sort((a, b) => b.pts - a.pts)
  const counted = new Set(sp.slice(0, cap))
  let total = 0
  for (const s of starters) {
    if (s.position === 'SP' && !counted.has(s)) continue
    total += s.pts
  }
  return total
}

// Shared week axis is anchored to ~Sep 1 of the season's first year; each
// fantasy week is 7 real days. So games complete on their own as time passes —
// no commissioner action required.
function targetWeek(season: string, now = Date.now()): number {
  const yr = parseInt(season.slice(0, 4)) || new Date().getFullYear()
  const anchor = new Date(yr, 8, 1).getTime()
  return Math.floor((now - anchor) / (7 * 86_400_000)) + 1
}

// Throttle read-triggered advances so page loads don't all do the work.
const lastRun = new Map<string, number>()

// ── Regular-season scoring (real-only: scores from ingested Tank01 stats) ────
async function scoreSportWeek(league: any, sport: string, week: number, detailed = true) {
  const scoring = (safeParse<any>(league.scoringSettings, {})[sport]) ?? {}
  const roster = await rostersForScoring(league, sport)
  if (!roster.length) return

  // Real-only: score strictly from ingested Tank01 stat lines. If none exist for
  // this sport + week yet, the games aren't final/ingested — leave the matchups
  // pending rather than fabricate scores. (The simulator is reserved for the
  // seed's demo data; real play never invents numbers.)
  const ids = roster.map(r => r.playerId)
  const realRows = ids.length
    ? await db.select({ playerId: realStatLines.playerId, stats: realStatLines.stats }).from(realStatLines)
        .where(and(eq(realStatLines.sport, sport), eq(realStatLines.season, league.season), eq(realStatLines.week, week), inArray(realStatLines.playerId, ids)))
    : []
  if (!realRows.length) return // no real stats yet → week stays pending
  const realBy = new Map(realRows.map(r => [r.playerId, safeParse<Record<string, number>>(r.stats, {})]))

  // Persist per-player box-score rows only for recent weeks (keeps bulk season
  // catch-up fast); older weeks still score the matchups + standings.
  if (detailed) await db.delete(playerGameStats).where(and(eq(playerGameStats.leagueId, league.id), eq(playerGameStats.season, league.season), eq(playerGameStats.week, week), eq(playerGameStats.sport, sport)))
  const pts: Record<string, number> = {}
  const rows: any[] = []
  for (const r of roster) {
    const stats = realBy.get(r.playerId)
    if (!stats) { pts[r.playerId] = 0; continue } // no real line → not counted (didn't play / not yet final)
    const p = scorePlayer(stats, scoring)
    pts[r.playerId] = p
    if (detailed) rows.push({ id: nanoid(), leagueId: league.id, season: league.season, week, sport, playerId: r.playerId, teamId: r.teamId, stats: JSON.stringify(stats), points: p })
  }
  if (detailed && rows.length) await db.insert(playerGameStats).values(rows)
  // Sum each team's starters — auto-substitute inactive starters, then SP cap.
  const spCap = league.mlbSpCap ?? 0
  const cadence = lineupCadenceFor(safeParse<Record<string, string>>(league.lineupCadence, {}), sport)
  const teamTotal: Record<string, number> = {}
  const scoredOf = (r: typeof roster[number], slot: string): Scored => ({ slot, position: r.position, pts: pts[r.playerId] ?? 0, status: r.status, byeWeek: r.byeWeek })

  if (cadence === 'DAILY') {
    // Each player scores on the day their game falls; that day's lineup (a daily
    // override, else the standing slot) decides whether they started. Summing
    // each day's started players lets one slot credit different players across
    // the week — a bench player can cover a day a starter is off.
    const dates = weekDates(league.season, week)
    const dayLineups = await leagueDayLineups(league.id, league.season, sport, dates)
    const buckets: Record<string, Scored[]> = {} // `${teamId}|${date}` → that day's roster
    for (const r of roster) {
      const gd = gameDateOf(sport, r.realTeamAbbr, league.season, week) ?? 'none'
      const key = `${r.teamId}|${gd}`
      const slot = dayLineups.get(key)?.[r.playerId] ?? r.slot
      ;(buckets[key] ??= []).push(scoredOf(r, slot))
    }
    for (const [key, rs] of Object.entries(buckets)) {
      const tid = key.slice(0, key.indexOf('|'))
      teamTotal[tid] = +((teamTotal[tid] ?? 0) + effectiveTotal(sport, spCap, week, rs)).toFixed(1)
    }
  } else {
    // Weekly: one standing lineup locks for the whole week.
    const byTeam: Record<string, Scored[]> = {}
    for (const r of roster) (byTeam[r.teamId] ??= []).push(scoredOf(r, r.slot))
    for (const [tid, rs] of Object.entries(byTeam)) teamTotal[tid] = effectiveTotal(sport, spCap, week, rs)
  }

  const games = await db.select().from(matchups).where(and(eq(matchups.leagueId, league.id), eq(matchups.season, league.season), eq(matchups.sport, sport), eq(matchups.week, week)))
  for (const g of games) {
    const hs = teamTotal[g.homeTeamId] ?? 0
    const as = g.awayTeamId ? (teamTotal[g.awayTeamId] ?? 0) : 0
    await db.update(matchups).set({ homeScore: hs, awayScore: as, isComplete: true }).where(eq(matchups.id, g.id))
  }

  // Recompute standings from all completed matchups this season.
  const allGames = await db.select().from(matchups).where(and(eq(matchups.leagueId, league.id), eq(matchups.sport, sport), eq(matchups.isComplete, true), eq(matchups.season, league.season)))
  const rec: Record<string, { w: number; l: number; t: number; pf: number; pa: number }> = {}
  const bump = (id: string) => (rec[id] ??= { w: 0, l: 0, t: 0, pf: 0, pa: 0 })
  for (const g of allGames) {
    if (!g.awayTeamId) continue
    const h = bump(g.homeTeamId), a = bump(g.awayTeamId)
    h.pf += g.homeScore ?? 0; h.pa += g.awayScore ?? 0; a.pf += g.awayScore ?? 0; a.pa += g.homeScore ?? 0
    if ((g.homeScore ?? 0) > (g.awayScore ?? 0)) { h.w++; a.l++ } else if ((g.homeScore ?? 0) < (g.awayScore ?? 0)) { a.w++; h.l++ } else { h.t++; a.t++ }
  }
  const ranked = Object.entries(rec).sort((x, y) => y[1].w - x[1].w || y[1].pf - x[1].pf)
  for (let i = 0; i < ranked.length; i++) {
    const [teamId, r] = ranked[i]
    await db.update(teamRecords).set({ wins: r.w, losses: r.l, ties: r.t, pointsFor: +r.pf.toFixed(1), pointsAgainst: +r.pa.toFixed(1), finishPosition: i + 1 })
      .where(and(eq(teamRecords.teamId, teamId), eq(teamRecords.leagueId, league.id), eq(teamRecords.season, league.season), eq(teamRecords.sport, sport)))
  }
}

// ── Playoffs ─────────────────────────────────────────────────────────────────
function seedOrder(n: number): number[] {
  let r = [1, 2]
  while (r.length < n) { const len = r.length * 2 + 1; const next: number[] = []; for (const s of r) { next.push(s); next.push(len - s) } r = next }
  return r
}

// Playoff seeding tiebreakers.
const winPct = (r: any) => { const gp = (r.wins ?? 0) + (r.losses ?? 0) + (r.ties ?? 0); return gp ? ((r.wins ?? 0) + 0.5 * (r.ties ?? 0)) / gp : 0 }
function coinHash(teamId: string, season: string): number { let h = 0; const s = `${teamId}:${season}`; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h }
async function headToHeadWins(leagueId: string, season: string, sport: string): Promise<Record<string, number>> {
  const ms = await db.select().from(matchups).where(and(eq(matchups.leagueId, leagueId), eq(matchups.season, season), eq(matchups.sport, sport), eq(matchups.isComplete, true)))
  const wins: Record<string, number> = {}
  for (const m of ms) {
    if (!m.awayTeamId) continue
    const homeWin = (m.homeScore ?? 0) >= (m.awayScore ?? 0)
    const w = homeWin ? m.homeTeamId : m.awayTeamId
    if (w) wins[w] = (wins[w] ?? 0) + 1
  }
  return wins
}

async function scoreTeam(league: any, sport: string, teamId: string, scoring: Record<string, number>, spCap = 0, week = 0) {
  const roster = await rostersForScoring(league, sport, teamId)
  if (!roster.length) return 0
  // Real-only: score from ingested stat lines for this playoff week; a player
  // with no real line contributes 0 (runPlayoffs only resolves a round once real
  // data for its week exists, so this isn't reached for un-played weeks).
  const ids = roster.map(r => r.playerId)
  const realRows = ids.length
    ? await db.select({ playerId: realStatLines.playerId, stats: realStatLines.stats }).from(realStatLines)
        .where(and(eq(realStatLines.sport, sport), eq(realStatLines.season, league.season), eq(realStatLines.week, week), inArray(realStatLines.playerId, ids)))
    : []
  const realBy = new Map(realRows.map(r => [r.playerId, safeParse<Record<string, number>>(r.stats, {})]))
  const scored: Scored[] = roster.map(r => {
    const s = realBy.get(r.playerId)
    return { slot: r.slot, position: r.position, status: r.status, byeWeek: r.byeWeek, pts: s ? scorePlayer(s, scoring) : 0 }
  })
  return effectiveTotal(sport, spCap, week, scored)
}

async function runPlayoffs(league: any, sports: string[], target: number) {
  const season = league.season
  const nTeams = league.playoffTeams ?? 4
  const schedule = safeParse<any[]>(league.sportSchedule, [])
  const scoringAll = safeParse<Record<string, Record<string, number>>>(league.scoringSettings, {})
  const records = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, league.id), eq(teamRecords.season, season)))

  for (const sport of sports) {
    const regEnd = schedule.find(s => s.sport === sport)?.endWeek ?? 0
    if (regEnd === 0 || target < regEnd + 1) continue // regular season not over yet
    // Regular season must be fully scored first.
    const incompleteReg = await db.select({ id: matchups.id }).from(matchups)
      .where(and(eq(matchups.leagueId, league.id), eq(matchups.season, season), eq(matchups.sport, sport), eq(matchups.isComplete, false))).limit(1)
    if (incompleteReg.length) continue

    const reloadGames = () => db.select().from(playoffGames).where(and(eq(playoffGames.leagueId, league.id), eq(playoffGames.season, season), eq(playoffGames.sport, sport)))
    let games = await reloadGames()

    // Build the bracket pools from final standings: the championship bracket (top seeds),
    // an optional consolation bracket (the next tier), and an optional losers/toilet bowl
    // bracket (the bottom seeds). Consolation and losers never overlap.
    // Seed by wins, then the configured tiebreaker (deterministic so re-runs are stable).
    const tb = league.playoffTiebreaker ?? 'POINTS_FOR'
    const h2h = tb === 'HEAD_TO_HEAD' ? await headToHeadWins(league.id, season, sport) : null
    const ranked = records.filter(r => r.sport === sport).sort((a, b) => {
      if ((b.wins ?? 0) !== (a.wins ?? 0)) return (b.wins ?? 0) - (a.wins ?? 0)
      if (tb === 'HEAD_TO_HEAD' && h2h) { const d = (h2h[b.teamId] ?? 0) - (h2h[a.teamId] ?? 0); if (d) return d }
      if (tb === 'RECORD') { const d = winPct(b) - winPct(a); if (d) return d }
      if (tb === 'COIN_FLIP') return coinHash(a.teamId, season) - coinHash(b.teamId, season)
      return (b.pointsFor ?? 0) - (a.pointsFor ?? 0) // POINTS_FOR (and final fallback)
    })
    const losersN = league.losersBracket ? (league.losersTeams ?? nTeams) : 0
    const consolationN = league.consolationBracket ? (league.consolationTeams ?? nTeams) : 0
    const losersPool = losersN ? ranked.slice(Math.max(nTeams, ranked.length - losersN)) : []
    const consolationPool = consolationN ? ranked.slice(nTeams, Math.min(ranked.length - losersPool.length, nTeams + consolationN)) : []
    const pools: { kind: string; pool: typeof ranked }[] = [{ kind: 'WINNERS', pool: ranked.slice(0, nTeams) }]
    if (consolationPool.length >= 2) pools.push({ kind: 'CONSOLATION', pool: consolationPool })
    if (losersPool.length >= 2) pools.push({ kind: 'LOSERS', pool: losersPool })
    if (pools[0].pool.length < 2) continue

    // Seed round 1 for any bracket that hasn't started yet (seeds are within the bracket).
    for (const { kind, pool } of pools) {
      if (pool.length < 2 || games.some(g => (g.bracket ?? 'WINNERS') === kind)) continue
      let p = 1; while (p < pool.length) p <<= 1
      const order = seedOrder(p)
      for (let i = 0, mi = 0; i < p; i += 2, mi++) {
        const hSeed = order[i], aSeed = order[i + 1]
        const home = pool[hSeed - 1], away = pool[aSeed - 1]
        await db.insert(playoffGames).values({
          id: nanoid(), leagueId: league.id, season, sport, round: 1, matchIndex: mi, bracket: kind,
          homeSeed: home ? hSeed : null, awaySeed: away ? aSeed : null,
          homeTeamId: home?.teamId ?? null, awayTeamId: away?.teamId ?? null,
        })
      }
    }
    games = await reloadGames()

    // Resolve each bracket independently, one round per playoff week (regEnd + round).
    const scoring = scoringAll[sport] ?? {}
    for (const { kind } of pools) {
      let safety = 0
      while (safety++ < 12) {
        const bg = games.filter(g => (g.bracket ?? 'WINNERS') === kind)
        const rounds = [...new Set(bg.map(g => g.round))].sort((a, b) => a - b)
        const curRound = rounds.find(r => bg.some(g => g.round === r && !g.isComplete))
        if (curRound == null) break
        if (target < regEnd + curRound) break // this playoff round's week hasn't arrived
        // Real-only: don't resolve a playoff round until its week's stats are
        // ingested (otherwise scores would be fabricated).
        const [anyReal] = await db.select({ id: realStatLines.id }).from(realStatLines)
          .where(and(eq(realStatLines.sport, sport), eq(realStatLines.season, season), eq(realStatLines.week, regEnd + curRound))).limit(1)
        if (!anyReal) break

        const roundGames = bg.filter(g => g.round === curRound).sort((a, b) => a.matchIndex - b.matchIndex)
        const completed: { teamId: string | null; seed: number | null }[] = []
        for (const g of roundGames) {
          let winner = g.winnerTeamId ?? null
          if (!g.isComplete) {
            let hs = 0, as = 0
            if (g.homeTeamId && !g.awayTeamId) winner = g.homeTeamId
            else if (!g.homeTeamId && g.awayTeamId) winner = g.awayTeamId
            else if (g.homeTeamId && g.awayTeamId) {
              hs = await scoreTeam(league, sport, g.homeTeamId, scoring, league.mlbSpCap ?? 0, target)
              as = await scoreTeam(league, sport, g.awayTeamId, scoring, league.mlbSpCap ?? 0, target)
              if (hs === as) hs += 0.1
              winner = hs > as ? g.homeTeamId : g.awayTeamId
            }
            await db.update(playoffGames).set({ homeScore: hs, awayScore: as, winnerTeamId: winner, isComplete: true }).where(eq(playoffGames.id, g.id))
          }
          completed.push({ teamId: winner, seed: winner === g.homeTeamId ? g.homeSeed : g.awaySeed })
        }
        if (completed.length === 1) {
          // Only the championship bracket crowns the sport (and feeds federation) champion.
          if (kind === 'WINNERS') {
            const champ = completed[0].teamId
            if (champ) {
              await db.update(teamRecords).set({ isChampion: true }).where(and(eq(teamRecords.leagueId, league.id), eq(teamRecords.season, season), eq(teamRecords.sport, sport), eq(teamRecords.teamId, champ)))
              const runner = roundGames[0].homeTeamId === champ ? roundGames[0].awayTeamId : roundGames[0].homeTeamId
              const existing = await db.select({ id: leagueHistory.id }).from(leagueHistory).where(and(eq(leagueHistory.leagueId, league.id), eq(leagueHistory.season, season), eq(leagueHistory.scope, sport))).limit(1)
              if (!existing.length) {
                await db.insert(leagueHistory).values({ id: nanoid(), leagueId: league.id, season, scope: sport, championTeamId: champ, runnerUpTeamId: runner ?? null })
                const [t] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, champ)).limit(1)
                await logActivity(league.id, 'LEAGUE', `🏆 ${t?.name ?? 'A franchise'} won the ${sport} championship!`, champ)
              }
              // This sport-season is now decided: freeze its rosters. From here it
              // scores from the snapshot, so franchises can still trade/draft (those
              // moves belong to the next season) without changing this one.
              await snapshotSportRoster(league.id, season, sport)
            }
          }
          break
        } else {
          // Pair the advancing teams for the next round. With re-seeding, sort survivors by
          // seed and match best-vs-worst (1 v 6, 2 v 5, …); otherwise keep bracket order.
          let pairs = completed
          if (league.playoffReseed) {
            const withTeam = completed.filter(c => c.teamId).sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99))
            pairs = []
            let lo = 0, hi = withTeam.length - 1
            while (lo < hi) { pairs.push(withTeam[lo]); pairs.push(withTeam[hi]); lo++; hi-- }
            if (lo === hi) { pairs.push(withTeam[lo]); pairs.push({ teamId: null, seed: null }) }
          }
          for (let j = 0; j < pairs.length; j += 2) {
            const a = pairs[j], b = pairs[j + 1]
            await db.insert(playoffGames).values({
              id: nanoid(), leagueId: league.id, season, sport, round: curRound + 1, matchIndex: j / 2, bracket: kind,
              homeSeed: a?.seed ?? null, awaySeed: b?.seed ?? null,
              homeTeamId: a?.teamId ?? null, awayTeamId: b?.teamId ?? null,
            })
          }
          games = await reloadGames()
        }
      }
    }
  }

  // Crown the federation champion once every sport has a champion.
  const champs = await db.select().from(leagueHistory).where(and(eq(leagueHistory.leagueId, league.id), eq(leagueHistory.season, season)))
  const sportChamps = champs.filter(c => c.scope !== 'OVERALL')
  if (sportChamps.length >= sports.length && !champs.some(c => c.scope === 'OVERALL')) {
    const franchises = await db.select().from(teams).where(eq(teams.leagueId, league.id))
    const fed = safeParse<any>(league.federationScoring, { placement: [], championBonus: 0, regularSeasonBonus: 0, includedSports: sports })
    const recs = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, league.id), eq(teamRecords.season, season)))
    const standings = computeFederationStandings(
      franchises.map(f => ({ id: f.id })),
      recs.map(r => ({ teamId: r.teamId, sport: r.sport, finishPosition: r.finishPosition, isChampion: r.isChampion })),
      fed, fed.includedSports ?? sports,
    )
    const champId = standings[0]?.team.id
    if (champId) {
      await db.insert(leagueHistory).values({ id: nanoid(), leagueId: league.id, season, scope: 'OVERALL', championTeamId: champId, runnerUpTeamId: standings[1]?.team.id ?? null, note: 'Federation champion' })
      const [t] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, champId)).limit(1)
      await logActivity(league.id, 'LEAGUE', `🏆🏆 ${t?.name ?? 'A franchise'} are the ${league.name} Champions!`, champId)
    }
  }
}

// Bring a league fully up to date: score every due regular-season week and
// resolve playoffs through the current date. Safe to call repeatedly.
// Advance ONE federation season (league.season is the target). Date-driven, so
// each season progresses on its own calendar axis.
async function advanceSeason(league: any): Promise<void> {
  const sports = safeParse<string[]>(league.sportsEnabled, [])
  const target = targetWeek(league.season)
  if (target < 1) return

  const due = await db.select({ sport: matchups.sport, week: matchups.week }).from(matchups)
    .where(and(eq(matchups.leagueId, league.id), eq(matchups.season, league.season), eq(matchups.isComplete, false)))
  const toScore = [...new Map(due.filter(d => d.week <= target).map(d => [`${d.sport}:${d.week}`, d])).values()]
    .sort((a, b) => a.week - b.week)
  for (const d of toScore) await scoreSportWeek(league, d.sport, d.week, d.week >= target - 3)

  await runPlayoffs(league, sports, target)
}

// "2025-26" → "2026-27" and back.
function nextSeason(s: string): string { const y = parseInt(s.slice(0, 4)) || new Date().getFullYear(); return `${y + 1}-${String(y + 2).slice(2)}` }
function prevSeason(s: string): string { const y = parseInt(s.slice(0, 4)) || new Date().getFullYear(); return `${y - 1}-${String(y).slice(2)}` }

async function seasonExists(leagueId: string, season: string): Promise<boolean> {
  const [m] = await db.select({ id: matchups.id }).from(matchups)
    .where(and(eq(matchups.leagueId, leagueId), eq(matchups.season, season))).limit(1)
  return !!m
}
async function seasonCrowned(leagueId: string, season: string): Promise<boolean> {
  const [h] = await db.select({ id: leagueHistory.id }).from(leagueHistory)
    .where(and(eq(leagueHistory.leagueId, leagueId), eq(leagueHistory.season, season), eq(leagueHistory.scope, 'OVERALL'))).limit(1)
  return !!h
}

// Spin up the next federation season: fresh per-sport records (rosters carry over
// in this dynasty model) and a full overlapping matchup schedule.
async function createSeason(league: any, season: string): Promise<void> {
  const sports = safeParse<string[]>(league.sportsEnabled, [])
  const schedule = safeParse<ScheduleEntry[]>(league.sportSchedule, [])
  if (!schedule.length) return
  const breaks = safeParse<Record<string, number[]>>(league.breakWeeks, {})
  const teamRows = await db.select({ id: teams.id }).from(teams).where(eq(teams.leagueId, league.id))
  const teamIds = teamRows.map(t => t.id)
  if (teamIds.length < 2) return

  // Per-sport records for the new season.
  for (const t of teamIds) for (const sport of sports) {
    await db.insert(teamRecords).values({ id: nanoid(), teamId: t, leagueId: league.id, season, sport, faabRemaining: league.faabBudget ?? 100 }).onConflictDoNothing()
  }

  // Overlapping matchups (same weekly pairing across concurrently-active sports).
  const pairings = buildWeeklyPairings(teamIds)
  if (!pairings.length) return
  const maxWeek = scheduleWeeks(schedule)
  const rows: any[] = []
  for (let week = 1; week <= maxWeek; week++) {
    const active = sportsActiveInWeek(schedule, week)
    const pairs = pairings[(week - 1) % pairings.length]
    for (const sport of active) {
      // Break weeks (all-star / Olympics) are NOT empty byes — the week's matchup
      // simply spans the break (a longer calendar window), so it still gets a game.
      for (const [home, away] of pairs) rows.push({ id: nanoid(), leagueId: league.id, sport, season, week, homeTeamId: home, awayTeamId: away, homeScore: 0, awayScore: 0, isComplete: false })
    }
  }
  if (rows.length) await db.insert(matchups).values(rows)
}

// Play out every still-unplayed regular-season week for every sport so the season
// is fully scored before it is archived. Without this, a season archived mid-
// calendar leaves later-starting sports (e.g. MLB, whose window opens after the
// football/winter phases) with no game logs at all — the historical roster and
// scores pages would then show that sport as empty. scoreSportWeek persists full
// per-player box scores and recomputes standings, so the archived season reads
// exactly as it stood in its final week.
export async function finalizeSeason(leagueOrId: string | any): Promise<void> {
  const league = typeof leagueOrId === 'string'
    ? (await db.select().from(leagues).where(eq(leagues.id, leagueOrId)).limit(1))[0]
    : leagueOrId
  if (!league) return
  const sports = safeParse<string[]>(league.sportsEnabled, [])
  for (const sport of sports) {
    const incomplete = await db.select({ week: matchups.week }).from(matchups)
      .where(and(eq(matchups.leagueId, league.id), eq(matchups.season, league.season), eq(matchups.sport, sport), eq(matchups.isComplete, false)))
    const weeks = [...new Set(incomplete.map(m => m.week))].sort((a, b) => a - b)
    for (const week of weeks) await scoreSportWeek(league, sport, week, true)
  }
}

// Commissioner-triggered manual rollover: finalize the outgoing season (so every
// sport is fully scored), snapshot its branding + rosters, then spin up the next
// season immediately (independent of the calendar). Rosters carry over (dynasty);
// the new season gets fresh records + a full schedule.
export async function renewSeason(leagueOrId: string | any): Promise<{ season: string } | { error: string }> {
  const league = typeof leagueOrId === 'string'
    ? (await db.select().from(leagues).where(eq(leagues.id, leagueOrId)).limit(1))[0]
    : leagueOrId
  if (!league) return { error: 'League not found' }
  const nxt = nextSeason(league.season)
  if (await seasonExists(league.id, nxt)) return { error: `The ${nxt} season already exists` }
  await finalizeSeason(league)
  await snapshotSeasonBranding(league.id, league.season)
  // Rosters are frozen per sport as each sport-season is crowned (see runPlayoffs),
  // not wholesale here — a sport still in play stays live and editable.
  await createSeason(league, nxt)
  await db.update(leagues).set({ season: nxt }).where(eq(leagues.id, league.id))
  return { season: nxt }
}

export async function advanceLeague(leagueOrId: string | any, force = false): Promise<void> {
  try {
    const league = typeof leagueOrId === 'string'
      ? (await db.select().from(leagues).where(eq(leagues.id, leagueOrId)).limit(1))[0]
      : leagueOrId
    if (!league) return
    if (!force) { const last = lastRun.get(league.id) ?? 0; if (Date.now() - last < 30_000) return }
    lastRun.set(league.id, Date.now())

    // Roll over into the next season once its calendar has started — the prior
    // season keeps running below (its playoffs finish concurrently).
    let current = league.season
    const nxt = nextSeason(current)
    if (targetWeek(nxt) >= 1 && !(await seasonExists(league.id, nxt))) {
      await finalizeSeason({ ...league, season: current }) // play out the rest of the season
      await snapshotSeasonBranding(league.id, current) // freeze the outgoing season's logos
      // Rosters freeze per sport at each championship (runPlayoffs), so a sport
      // still being played in the outgoing season stays live and editable.
      await createSeason(league, nxt)
      await db.update(leagues).set({ season: nxt }).where(eq(leagues.id, league.id))
      league.season = nxt
      current = nxt
    }

    // Advance the current season and, concurrently, the immediately-prior season
    // if it hasn't crowned its federation champion yet (overlapping postseasons).
    const toAdvance = [current]
    const prev = prevSeason(current)
    if (await seasonExists(league.id, prev) && !(await seasonCrowned(league.id, prev))) toAdvance.push(prev)
    for (const s of toAdvance) await advanceSeason({ ...league, season: s })

    // Clear expired waiver holds and process any claims whose scheduled run has passed.
    await runWaivers(league)
  } catch (e) {
    console.error('advanceLeague failed', e)
  }
}

// Re-score specific (sport, week) pairs even if already complete. Used when real
// stats arrive after a week was first scored (daily-finalize / live / "pull now").
// scoreSportWeek recomputes standings from scratch, so this is idempotent.
export async function rescoreWeeks(leagueOrId: string | any, pairs: { sport: string; week: number }[]): Promise<void> {
  const league = typeof leagueOrId === 'string'
    ? (await db.select().from(leagues).where(eq(leagues.id, leagueOrId)).limit(1))[0]
    : leagueOrId
  if (!league) return
  const seen = new Set<string>()
  for (const { sport, week } of pairs) {
    const k = `${sport}:${week}`
    if (seen.has(k) || !week) continue
    seen.add(k)
    await scoreSportWeek(league, sport, week, true)
  }
}
