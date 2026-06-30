import { db } from '@/db'
import { teams, rosters, players, teamRecords, waiverClaims, waiverWire } from '@/db/schema'
import { eq, and, lte } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { safeParse } from '@/lib/utils'
import { logActivity, notify } from '@/lib/activity'

const SPORTS = ['NFL', 'NHL', 'NBA', 'MLB']

// The most recent past occurrence of a weekly (weekday, hour) waiver run.
export function mostRecentWaiverRun(day: number, hour: number, now: Date = new Date()): Date {
  const r = new Date(now)
  r.setHours(hour, 0, 0, 0)
  const diff = (r.getDay() - day + 7) % 7
  r.setDate(r.getDate() - diff)
  if (r > now) r.setDate(r.getDate() - 7)
  return r
}

// Put a dropped player on the wire for `days` (claim-only until it clears).
export async function placeOnWaivers(leagueId: string, playerId: string, sport: string | null, droppedByTeamId: string, days: number) {
  if (days <= 0) return
  const clearsAt = new Date(Date.now() + days * 86_400_000).toISOString()
  await db.delete(waiverWire).where(and(eq(waiverWire.leagueId, leagueId), eq(waiverWire.playerId, playerId)))
  await db.insert(waiverWire).values({ id: nanoid(), leagueId, playerId, sport, droppedByTeamId, clearsAt })
}

// Is this player currently held on the wire in the league (not yet cleared)?
export async function onWaivers(leagueId: string, playerId: string, now: Date = new Date()): Promise<boolean> {
  const [w] = await db.select({ clearsAt: waiverWire.clearsAt }).from(waiverWire)
    .where(and(eq(waiverWire.leagueId, leagueId), eq(waiverWire.playerId, playerId))).limit(1)
  return !!w && new Date(w.clearsAt) > now
}

// Drop cleared rows so those players become ordinary free agents.
export async function clearExpiredWire(leagueId: string, now: Date = new Date()) {
  await db.delete(waiverWire).where(and(eq(waiverWire.leagueId, leagueId), lte(waiverWire.clearsAt, now.toISOString())))
}

// Resolve a set of pending claims, honoring the league's waiver type (FAAB or priority).
async function awardClaims(league: any, pending: any[]) {
  if (!pending.length) return { processed: 0, awarded: 0 }
  const teamRows = await db.select().from(teams).where(eq(teams.leagueId, league.id))
  const tById = Object.fromEntries(teamRows.map(t => [t.id, t]))
  const isFaab = league.waiverType === 'FAAB'

  const recs = await db.select().from(teamRecords).where(eq(teamRecords.season, league.season))
  const recKey = (teamId: string, sport: string) => `${teamId}:${sport}`
  const budget: Record<string, number> = {}
  const priority: Record<string, number> = {}
  for (const r of recs) {
    if (!tById[r.teamId]) continue
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
      // The dropped player goes on the wire too.
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
    await logActivity(league.id, 'WAIVER', claimMsg, winner.teamId)
    const owner = tById[winner.teamId]?.userId
    if (owner) await notify(owner, `You won ${add?.name ?? 'a player'} on waivers${isFaab ? ` for $${winner.bidAmount}` : ''}`, `/teams/${winner.teamId}`, 'WAIVER')
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

// Commissioner "process now": clear the wire and award every pending claim immediately.
export async function processAllNow(league: any) {
  await clearExpiredWire(league.id)
  const pending = await db.select().from(waiverClaims).where(and(eq(waiverClaims.leagueId, league.id), eq(waiverClaims.status, 'PENDING')))
  return awardClaims(league, pending)
}

// Automatic run (called from advanceLeague): clear the wire, then for each sport award
// claims that were placed before that sport's most recent scheduled waiver run.
export async function runWaivers(league: any) {
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
