import 'server-only'
import { db } from '@/db'
import { leagues, teams, teamRecords, rosters, players, matchups, playerGameStats, playoffGames, leagueHistory } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { safeParse } from '@/lib/utils'
import { RESERVE_SLOTS } from '@/lib/defaults'
import { scorePlayer, generateStatLine } from '@/lib/scoring'
import { computeFederationStandings } from '@/lib/federation'
import { logActivity } from '@/lib/activity'

const isStarter = (slot: string) => !RESERVE_SLOTS.includes(slot)

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

// ── Regular-season scoring (the engine behind the once-manual "simulate") ────
async function scoreSportWeek(league: any, sport: string, week: number, detailed = true) {
  const scoring = (safeParse<any>(league.scoringSettings, {})[sport]) ?? {}
  const roster = await db
    .select({ playerId: rosters.playerId, teamId: rosters.teamId, slot: rosters.slot, position: players.position, projected: players.projectedPoints })
    .from(rosters).innerJoin(players, eq(rosters.playerId, players.id)).innerJoin(teams, eq(rosters.teamId, teams.id))
    .where(and(eq(teams.leagueId, league.id), eq(rosters.sport, sport)))
  if (!roster.length) return
  const avgProj = roster.reduce((a, r) => a + (r.projected ?? 0), 0) / roster.length || 1

  // Persist per-player box-score rows only for recent weeks (keeps bulk season
  // catch-up fast); older weeks still score the matchups + standings.
  if (detailed) await db.delete(playerGameStats).where(and(eq(playerGameStats.leagueId, league.id), eq(playerGameStats.season, league.season), eq(playerGameStats.week, week), eq(playerGameStats.sport, sport)))
  const pts: Record<string, number> = {}
  const rows: any[] = []
  for (const r of roster) {
    const stats = generateStatLine(sport, r.position, (r.projected ?? avgProj) / avgProj)
    const p = scorePlayer(stats, scoring)
    pts[r.playerId] = p
    if (detailed) rows.push({ id: nanoid(), leagueId: league.id, season: league.season, week, sport, playerId: r.playerId, teamId: r.teamId, stats: JSON.stringify(stats), points: p })
  }
  if (detailed && rows.length) await db.insert(playerGameStats).values(rows)
  // Sum each team's starters, applying the MLB starting-pitcher cap.
  const spCap = league.mlbSpCap ?? 0
  const byTeamStarters: Record<string, { position: string; pts: number }[]> = {}
  for (const r of roster) if (isStarter(r.slot)) (byTeamStarters[r.teamId] ??= []).push({ position: r.position, pts: pts[r.playerId] ?? 0 })
  const teamTotal: Record<string, number> = {}
  for (const [tid, st] of Object.entries(byTeamStarters)) teamTotal[tid] = +sumWithSpCap(sport, st, spCap).toFixed(1)

  const games = await db.select().from(matchups).where(and(eq(matchups.leagueId, league.id), eq(matchups.sport, sport), eq(matchups.week, week)))
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

async function scoreTeam(sport: string, teamId: string, scoring: Record<string, number>, spCap = 0) {
  const roster = await db.select({ slot: rosters.slot, position: players.position, projected: players.projectedPoints })
    .from(rosters).innerJoin(players, eq(rosters.playerId, players.id))
    .where(and(eq(rosters.teamId, teamId), eq(rosters.sport, sport)))
  const starters = roster.filter(r => isStarter(r.slot))
  if (!starters.length) return 0
  const avg = starters.reduce((a, r) => a + (r.projected ?? 0), 0) / starters.length || 1
  const scored = starters.map(r => ({ position: r.position, pts: scorePlayer(generateStatLine(sport, r.position, (r.projected ?? avg) / avg), scoring) }))
  return +sumWithSpCap(sport, scored, spCap).toFixed(1)
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

    let games = await db.select().from(playoffGames).where(and(eq(playoffGames.leagueId, league.id), eq(playoffGames.season, season), eq(playoffGames.sport, sport)))

    // Seed round 1 from final standings.
    if (!games.length) {
      const ranked = records.filter(r => r.sport === sport)
        .sort((a, b) => (a.finishPosition ?? 99) - (b.finishPosition ?? 99) || (b.wins ?? 0) - (a.wins ?? 0))
        .slice(0, nTeams)
      if (ranked.length < 2) continue
      let p = 1; while (p < ranked.length) p <<= 1
      const order = seedOrder(p)
      for (let i = 0, mi = 0; i < p; i += 2, mi++) {
        const hSeed = order[i], aSeed = order[i + 1]
        const home = ranked[hSeed - 1], away = ranked[aSeed - 1]
        await db.insert(playoffGames).values({
          id: nanoid(), leagueId: league.id, season, sport, round: 1, matchIndex: mi,
          homeSeed: home ? hSeed : null, awaySeed: away ? aSeed : null,
          homeTeamId: home?.teamId ?? null, awayTeamId: away?.teamId ?? null,
        })
      }
      games = await db.select().from(playoffGames).where(and(eq(playoffGames.leagueId, league.id), eq(playoffGames.season, season), eq(playoffGames.sport, sport)))
    }

    // Resolve each round whose playoff week has arrived (regEnd + round).
    const scoring = scoringAll[sport] ?? {}
    let safety = 0
    while (safety++ < 12) {
      const rounds = [...new Set(games.map(g => g.round))].sort((a, b) => a - b)
      const curRound = rounds.find(r => games.some(g => g.round === r && !g.isComplete))
      if (curRound == null) break
      if (target < regEnd + curRound) break // this playoff round's week hasn't arrived

      const roundGames = games.filter(g => g.round === curRound).sort((a, b) => a.matchIndex - b.matchIndex)
      // Resolve each game and capture the actual winner (don't re-read stale scores).
      const completed: { teamId: string | null; seed: number | null }[] = []
      for (const g of roundGames) {
        let winner = g.winnerTeamId ?? null
        if (!g.isComplete) {
          let hs = 0, as = 0
          if (g.homeTeamId && !g.awayTeamId) winner = g.homeTeamId
          else if (!g.homeTeamId && g.awayTeamId) winner = g.awayTeamId
          else if (g.homeTeamId && g.awayTeamId) {
            hs = await scoreTeam(sport, g.homeTeamId, scoring, league.mlbSpCap ?? 0)
            as = await scoreTeam(sport, g.awayTeamId, scoring, league.mlbSpCap ?? 0)
            if (hs === as) hs += 0.1
            winner = hs > as ? g.homeTeamId : g.awayTeamId
          }
          await db.update(playoffGames).set({ homeScore: hs, awayScore: as, winnerTeamId: winner, isComplete: true }).where(eq(playoffGames.id, g.id))
        }
        completed.push({ teamId: winner, seed: winner === g.homeTeamId ? g.homeSeed : g.awaySeed })
      }
      if (completed.length === 1) {
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
        }
        break
      } else {
        for (let j = 0; j < completed.length; j += 2) {
          const a = completed[j], b = completed[j + 1]
          await db.insert(playoffGames).values({
            id: nanoid(), leagueId: league.id, season, sport, round: curRound + 1, matchIndex: j / 2,
            homeSeed: a?.seed ?? null, awaySeed: b?.seed ?? null,
            homeTeamId: a?.teamId ?? null, awayTeamId: b?.teamId ?? null,
          })
        }
        games = await db.select().from(playoffGames).where(and(eq(playoffGames.leagueId, league.id), eq(playoffGames.season, season), eq(playoffGames.sport, sport)))
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
      await logActivity(league.id, 'LEAGUE', `🏆🏆 ${t?.name ?? 'A franchise'} is the Federation Champion!`, champId)
    }
  }
}

// Bring a league fully up to date: score every due regular-season week and
// resolve playoffs through the current date. Safe to call repeatedly.
export async function advanceLeague(leagueOrId: string | any, force = false): Promise<void> {
  try {
    const league = typeof leagueOrId === 'string'
      ? (await db.select().from(leagues).where(eq(leagues.id, leagueOrId)).limit(1))[0]
      : leagueOrId
    if (!league) return
    if (!force) { const last = lastRun.get(league.id) ?? 0; if (Date.now() - last < 30_000) return }
    lastRun.set(league.id, Date.now())

    const sports = safeParse<string[]>(league.sportsEnabled, [])
    const target = targetWeek(league.season)
    if (target < 1) return

    // Score any due, still-incomplete regular-season weeks.
    const due = await db.select({ sport: matchups.sport, week: matchups.week }).from(matchups)
      .where(and(eq(matchups.leagueId, league.id), eq(matchups.season, league.season), eq(matchups.isComplete, false)))
    const toScore = [...new Map(due.filter(d => d.week <= target).map(d => [`${d.sport}:${d.week}`, d])).values()]
      .sort((a, b) => a.week - b.week)
    for (const d of toScore) await scoreSportWeek(league, d.sport, d.week, d.week >= target - 3)

    await runPlayoffs(league, sports, target)
  } catch (e) {
    console.error('advanceLeague failed', e)
  }
}
