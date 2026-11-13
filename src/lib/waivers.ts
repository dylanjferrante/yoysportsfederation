import { db } from '@/db'
import { teams, rosters, players, teamRecords, waiverClaims, waiverWire } from '@/db/schema'
import { eq, and, lte } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { safeParse } from '@/lib/utils'
import { logActivity, notify, moveData } from '@/lib/activity'
import { sendPush } from '@/lib/push'
import { isYsf, claimLimitError, eligCapError, etMidnightUtc } from '@/lib/ysf-rules'

import { sql } from 'drizzle-orm'

const SPORTS = ['NFL', 'NHL', 'NBA', 'MLB']

export function mostRecentWaiverRun(day: number, hour: number, now: Date = new Date()): Date {
  const r = new Date(now)
  r.setHours(hour, 0, 0, 0)
  const diff = (r.getDay() - day + 7) % 7
  r.setDate(r.getDate() - diff)
  if (r > now) r.setDate(r.getDate() - 7)
  return r
}

// ── ySF waivers, as the four Fantrax leagues run them ──────────────────────────
//   ySFHL / ySFBA / ySFLB: a dropped player stays on waivers N days (League Settings, 2) and claims process
//                          at 3:00 AM ET on the day he clears
//   ySFFL:                 claims process Wednesdays at 3:00 AM ET; free agents also go on waivers 5 minutes
//                          before their game kicks off and stay there until Wednesday's run
//   all:                   at least 23 hours on waivers; a club can't claim back a player it just dropped;
//                          a player is a free agent (first come, first served) only after his claims process
const etYmd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d)
const at3amEt = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(etMidnightUtc(y, m, d).getTime() + 3 * 3_600_000) }
const plusDays = (ymd: string, n: number) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }
// next Wednesday 3:00 AM ET at least `minHours` away
export function nextNflRun(from = new Date(), minHours = 23): Date {
  let ymd = etYmd(from)
  for (let i = 0; i < 15; i++) { const t = at3amEt(ymd); if (new Date(ymd + 'T12:00:00Z').getUTCDay() === 3 && t.getTime() - from.getTime() >= minHours * 3_600_000) return t; ymd = plusDays(ymd, 1) }
  return new Date(from.getTime() + 7 * 86_400_000)
}
// the latest Wednesday 3:00 AM ET run at or before `now`
export function lastNflRun(now = new Date()): Date {
  let ymd = etYmd(now)
  for (let i = 0; i < 8; i++) { const t = at3amEt(ymd); if (new Date(ymd + 'T12:00:00Z').getUTCDay() === 3 && t <= now) return t; ymd = plusDays(ymd, -1) }
  return new Date(now.getTime() - 7 * 86_400_000)
}
export function ysfClearTime(sport: string | null, days: number, from = new Date()): Date {
  if (sport === 'NFL') return nextNflRun(from)
  const t = at3amEt(plusDays(etYmd(from), Math.max(1, days)))
  return t.getTime() - from.getTime() >= 23 * 3_600_000 ? t : at3amEt(plusDays(etYmd(from), Math.max(1, days) + 1))
}
// ySFFL: has this free agent's game this week started (5 minutes before kickoff)? He's on waivers until Wednesday.
export async function nflGameLocked(playerId: string, now = new Date()): Promise<boolean> {
  const [p] = await db.select({ team: players.realTeamAbbr, sport: players.sport }).from(players).where(eq(players.id, playerId)).limit(1)
  if (!p?.team || p.sport !== 'NFL') return false
  const since = Math.floor(lastNflRun(now).getTime() / 1000), until = Math.floor(now.getTime() / 1000) + 5 * 60
  const g = db.all<{ n: number }>(sql`SELECT COUNT(*) n FROM game_schedule WHERE sport = 'NFL' AND (home_abbr = ${p.team} OR away_abbr = ${p.team}) AND game_time_epoch >= ${since} AND game_time_epoch <= ${until}`)[0]
  return (g?.n ?? 0) > 0
}

export async function placeOnWaivers(leagueId: string, playerId: string, sport: string | null, droppedByTeamId: string, days: number) {
  if (days <= 0) return
  const clearsAt = (isYsf(leagueId) ? ysfClearTime(sport, days) : new Date(Date.now() + days * 86_400_000)).toISOString()
  await db.delete(waiverWire).where(and(eq(waiverWire.leagueId, leagueId), eq(waiverWire.playerId, playerId)))
  await db.insert(waiverWire).values({ id: nanoid(), leagueId, playerId, sport, droppedByTeamId, clearsAt })
}

export async function onWaivers(leagueId: string, playerId: string, now: Date = new Date()): Promise<boolean> {
  const [w] = await db.select({ clearsAt: waiverWire.clearsAt }).from(waiverWire)
    .where(and(eq(waiverWire.leagueId, leagueId), eq(waiverWire.playerId, playerId))).limit(1)
  // ySF: a player stays on waivers until his claims have processed (the wire row is removed then)
  if (isYsf(leagueId)) return !!w || await nflGameLocked(playerId, now)
  return !!w && new Date(w.clearsAt) > now
}
// when a ySF player on waivers clears (his claims process then)
export async function ysfWaiverClears(leagueId: string, playerId: string, now = new Date()): Promise<Date | null> {
  const [w] = await db.select({ clearsAt: waiverWire.clearsAt }).from(waiverWire).where(and(eq(waiverWire.leagueId, leagueId), eq(waiverWire.playerId, playerId))).limit(1)
  if (w) return new Date(w.clearsAt)
  return (await nflGameLocked(playerId, now)) ? nextNflRun(now, 0) : null
}
// ySF: process every claim whose player has cleared, then release cleared players to free agency.
// Runs whenever the Players page, waivers or rosters are touched, and from ysf:refresh.
export async function settleYsfWaivers(league: any, now = new Date()) {
  const pending = await db.select().from(waiverClaims).where(and(eq(waiverClaims.leagueId, league.id), eq(waiverClaims.status, 'PENDING')))
  const wire = await db.select().from(waiverWire).where(eq(waiverWire.leagueId, league.id))
  const clears = new Map(wire.map(w => [w.playerId, new Date(w.clearsAt)]))
  const lastRun = lastNflRun(now)
  const due = pending.filter(c => {
    const t = clears.get(c.addPlayerId)
    if (t) return t <= now
    // ySFFL game-locked free agents: claims made before the latest Wednesday run
    return (c.sport ?? '') === 'NFL' ? !!c.claimedAt && new Date(c.claimedAt.includes('T') ? c.claimedAt : c.claimedAt.replace(' ', 'T') + 'Z') < lastRun : true
  })
  const res = due.length ? await awardClaims(league, due) : { processed: 0, awarded: 0 }
  for (const w of wire) if (new Date(w.clearsAt) <= now) await db.delete(waiverWire).where(eq(waiverWire.id, w.id))
  return res
}

export async function clearExpiredWire(leagueId: string, now: Date = new Date()) {
  await db.delete(waiverWire).where(and(eq(waiverWire.leagueId, leagueId), lte(waiverWire.clearsAt, now.toISOString())))
}

async function awardClaims(league: any, pending: any[]) {
  if (!pending.length) return { processed: 0, awarded: 0 }
  const teamRows = await db.select().from(teams).where(eq(teams.leagueId, league.id))
  const tById = Object.fromEntries(teamRows.map(t => [t.id, t]))
  const isFaab = league.waiverType === 'FAAB'

  const recs = await db.select().from(teamRecords).where(eq(teamRecords.season, league.season))
  const recKey = (teamId: string, sport: string) => `${teamId}:${sport}`
  const budget: Record<string, number> = {}
  const priority: Record<string, number> = {}
  const winPct: Record<string, number> = {}
  for (const r of recs) {
    if (!tById[r.teamId]) continue
    const g = (r.wins ?? 0) + (r.losses ?? 0) + (r.ties ?? 0)
    winPct[recKey(r.teamId, r.sport)] = g ? ((r.wins ?? 0) + (r.ties ?? 0) / 2) / g : 0.5
    budget[recKey(r.teamId, r.sport)] = r.faabRemaining ?? 0
    priority[recKey(r.teamId, r.sport)] = r.waiverPriority ?? 99
  }

  const byPlayer: Record<string, any[]> = {}
  for (const c of pending) (byPlayer[c.addPlayerId] ??= []).push(c)

  const awarded: string[] = []
  const taken = new Set<string>()
  const playerOrder = Object.keys(byPlayer).sort((a, b) => {
    if (!isFaab) return 0
    const maxBid = (pid: string) => Math.max(...byPlayer[pid].map(c => c.bidAmount ?? 0))
    return maxBid(b) - maxBid(a)
  })

  for (const playerId of playerOrder) {
    if (taken.has(playerId)) continue
    const sport = byPlayer[playerId][0].sport ?? 'NFL'
    const ranked = byPlayer[playerId].slice().sort((a, b) => {
      if (isFaab && (b.bidAmount ?? 0) !== (a.bidAmount ?? 0)) return (b.bidAmount ?? 0) - (a.bidAmount ?? 0)
      // Art. IV §A: tied FAAB bids go to the club with the worse record
      if (isYsf(league.id)) { const d = (winPct[recKey(a.teamId, a.sport ?? sport)] ?? 0.5) - (winPct[recKey(b.teamId, b.sport ?? sport)] ?? 0.5); if (d) return d }
      return (priority[recKey(a.teamId, a.sport ?? sport)] ?? 99) - (priority[recKey(b.teamId, b.sport ?? sport)] ?? 99)
    })

    let winner: any = null
    for (const c of ranked) {
      const rostered = await db.select({ id: rosters.id }).from(rosters)
        .innerJoin(teams, eq(rosters.teamId, teams.id))
        .where(and(eq(rosters.playerId, playerId), eq(teams.leagueId, league.id))).limit(1)
      if (rostered.length) break
      if (isFaab && (c.bidAmount ?? 0) > (budget[recKey(c.teamId, c.sport ?? sport)] ?? 0)) {
        await db.update(waiverClaims).set({ status: 'FAILED', processedAt: new Date().toISOString() }).where(eq(waiverClaims.id, c.id))
        continue
      }
      if (isYsf(league.id)) {
        // Fed. Res. III weekly claim limit and Art. V eligibility maxima, as of processing
        const [addP] = await db.select().from(players).where(eq(players.id, playerId)).limit(1)
        const cur = await db.select({ pid: rosters.playerId, position: players.position, eligible: players.eligiblePositions }).from(rosters)
          .innerJoin(players, eq(rosters.playerId, players.id)).where(and(eq(rosters.teamId, c.teamId), eq(rosters.sport, c.sport ?? sport)))
        if (claimLimitError(league.id, c.teamId, c.sport ?? sport) || eligCapError(c.sport ?? sport, [...cur.filter(r => r.pid !== c.dropPlayerId), { position: addP?.position ?? null, eligible: addP?.eligiblePositions ?? null }])) {
          await db.update(waiverClaims).set({ status: 'FAILED', processedAt: new Date().toISOString() }).where(eq(waiverClaims.id, c.id))
          continue
        }
      }
      winner = c; break
    }
    for (const c of ranked) {
      if (winner && c.id === winner.id) continue
      await db.update(waiverClaims).set({ status: 'LOST', processedAt: new Date().toISOString() }).where(eq(waiverClaims.id, c.id))
    }
    if (!winner) continue

    const [add] = await db.select().from(players).where(eq(players.id, playerId)).limit(1)
    let droppedName: string | null = null
    if (winner.dropPlayerId) {
      const [drop] = await db.select().from(players).where(eq(players.id, winner.dropPlayerId)).limit(1)
      droppedName = drop?.name ?? null
      await db.delete(rosters).where(and(eq(rosters.teamId, winner.teamId), eq(rosters.playerId, winner.dropPlayerId)))
      await placeOnWaivers(league.id, winner.dropPlayerId, drop?.sport ?? null, winner.teamId, league.waiverPeriodDays ?? 0)
    }
    await db.insert(rosters).values({ id: nanoid(), teamId: winner.teamId, playerId, sport: add?.sport ?? sport, slot: 'BN', acquisitionType: 'WAIVER' }).onConflictDoNothing()
    await db.delete(waiverWire).where(and(eq(waiverWire.leagueId, league.id), eq(waiverWire.playerId, playerId)))
    await db.update(waiverClaims).set({ status: 'WON', processedAt: new Date().toISOString() }).where(eq(waiverClaims.id, winner.id))
    taken.add(playerId)

    const k = recKey(winner.teamId, winner.sport ?? sport)
    if (isFaab) {
      budget[k] = (budget[k] ?? 0) - (winner.bidAmount ?? 0)
      await db.update(teamRecords).set({ faabRemaining: budget[k] })
        .where(and(eq(teamRecords.teamId, winner.teamId), eq(teamRecords.season, league.season), eq(teamRecords.sport, winner.sport ?? sport)))
    } else {
      const maxPriority = Math.max(...Object.entries(priority).filter(([key]) => key.endsWith(`:${winner.sport ?? sport}`)).map(([, v]) => v), teamRows.length)
      const oldP = priority[k] ?? maxPriority
      for (const [key, v] of Object.entries(priority)) {
        if (!key.endsWith(`:${winner.sport ?? sport}`)) continue
        if (v > oldP) priority[key] = v - 1
      }
      priority[k] = maxPriority
    }

    const tName = tById[winner.teamId]?.name ?? 'A franchise'
    const claimMsg = `${tName} claimed ${add?.name ?? 'a player'}${add?.sport ? ` (${add.sport})` : ''}${isFaab ? ` for $${winner.bidAmount}` : ''}` + (droppedName ? `, dropped ${droppedName}` : '')
    await logActivity(league.id, 'WAIVER', claimMsg, winner.teamId, await moveData(playerId, 'CLAIMED', { bid: isFaab ? winner.bidAmount : null }))
    if (winner.dropPlayerId) await logActivity(league.id, 'WAIVER', `${tName} dropped ${droppedName ?? 'a player'}`, winner.teamId, await moveData(winner.dropPlayerId, 'DROPPED'))
    const owner = tById[winner.teamId]?.userId
    if (owner) {
      const wmsg = `You won ${add?.name ?? 'a player'} on waivers${isFaab ? ` for $${winner.bidAmount}` : ''}`
      await notify(owner, wmsg, `/leagues/${league.id}/myteam`, 'WAIVER')
      await sendPush([owner], '✅ Waiver claim won', wmsg, { type: 'WAIVER', leagueId: league.id })
    }
    awarded.push(playerId)
  }

  if (!isFaab) {
    for (const [key, v] of Object.entries(priority)) {
      const [tid, sport] = key.split(':')
      await db.update(teamRecords).set({ waiverPriority: v })
        .where(and(eq(teamRecords.teamId, tid), eq(teamRecords.season, league.season), eq(teamRecords.sport, sport)))
    }
  }
  return { processed: pending.length, awarded: awarded.length }
}

export async function processAllNow(league: any) {
  if (isYsf(league.id)) return settleYsfWaivers(league)
  await clearExpiredWire(league.id)
  const pending = await db.select().from(waiverClaims).where(and(eq(waiverClaims.leagueId, league.id), eq(waiverClaims.status, 'PENDING')))
  return awardClaims(league, pending)
}

export async function runWaivers(league: any) {
  if (isYsf(league.id)) return settleYsfWaivers(league)
  if (league.waiverType === 'FREE_AGENT') { await clearExpiredWire(league.id); return { processed: 0, awarded: 0 } }
  await clearExpiredWire(league.id)
  const schedule = safeParse<Record<string, { day: number; hour: number }>>(league.waiverSchedule, {})
  const pending = await db.select().from(waiverClaims).where(and(eq(waiverClaims.leagueId, league.id), eq(waiverClaims.status, 'PENDING')))
  if (!pending.length) return { processed: 0, awarded: 0 }
  const now = new Date()
  const due: any[] = []
  for (const c of pending) {
    const sp = c.sport ?? 'NFL'
    const sch = schedule[sp] ?? { day: league.waiverDay ?? 3, hour: league.waiverHour ?? 3 }
    const run = mostRecentWaiverRun(sch.day ?? 3, sch.hour ?? 3, now)
    if (c.claimedAt && new Date(c.claimedAt) < run) due.push(c)
  }
  if (!due.length) return { processed: 0, awarded: 0 }
  return awardClaims(league, due)
}

export { SPORTS }
