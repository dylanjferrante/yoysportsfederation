import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, rosters, players, teamRecords, waiverClaims } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { logActivity, notify } from '@/lib/activity'

// List a league's waiver claims (enriched with player + franchise names).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const claims = await db.select().from(waiverClaims).where(eq(waiverClaims.leagueId, id))
  const teamRows = await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation, userId: teams.userId }).from(teams).where(eq(teams.leagueId, id))
  const playerIds = [...new Set(claims.flatMap(c => [c.addPlayerId, c.dropPlayerId].filter(Boolean) as string[]))]
  const playerRows = playerIds.length ? await db.select({ id: players.id, name: players.name, position: players.position, sport: players.sport }).from(players).where(inArray(players.id, playerIds)) : []
  const pById = Object.fromEntries(playerRows.map(p => [p.id, p]))
  const tById = Object.fromEntries(teamRows.map(t => [t.id, t]))

  const enriched = claims.map(c => ({
    ...c,
    team: tById[c.teamId],
    addPlayer: pById[c.addPlayerId],
    dropPlayer: c.dropPlayerId ? pById[c.dropPlayerId] : null,
    mine: tById[c.teamId]?.userId === session.user.id,
  })).sort((a, b) => (b.claimedAt ?? '').localeCompare(a.claimedAt ?? ''))

  return NextResponse.json(enriched)
}

// Submit a claim, cancel one, or (commissioner) process the waiver period.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json() as { action: 'SUBMIT' | 'CANCEL' | 'PROCESS'; addPlayerId?: string; dropPlayerId?: string; bidAmount?: number; claimId?: string }

  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 })

  // The user's franchise in this league.
  const [myTeam] = await db.select().from(teams).where(and(eq(teams.leagueId, id), eq(teams.userId, session.user.id))).limit(1)

  if (body.action === 'CANCEL' && body.claimId) {
    if (!myTeam) return NextResponse.json({ error: 'No franchise' }, { status: 403 })
    await db.delete(waiverClaims).where(and(eq(waiverClaims.id, body.claimId), eq(waiverClaims.teamId, myTeam.id), eq(waiverClaims.status, 'PENDING')))
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'SUBMIT' && body.addPlayerId) {
    if (!myTeam) return NextResponse.json({ error: 'You have no franchise in this league' }, { status: 403 })
    const [add] = await db.select().from(players).where(eq(players.id, body.addPlayerId)).limit(1)
    if (!add) return NextResponse.json({ error: 'Player not found' }, { status: 400 })

    // Must be a free agent in this league.
    const rostered = await db.select({ id: rosters.id }).from(rosters)
      .innerJoin(teams, eq(rosters.teamId, teams.id))
      .where(and(eq(rosters.playerId, body.addPlayerId), eq(teams.leagueId, id))).limit(1)
    if (rostered.length) return NextResponse.json({ error: 'Player is already rostered' }, { status: 400 })

    const bid = Math.max(0, Math.floor(body.bidAmount ?? 0))
    if (league.waiverType === 'FAAB') {
      const [rec] = await db.select().from(teamRecords)
        .where(and(eq(teamRecords.teamId, myTeam.id), eq(teamRecords.season, league.season), eq(teamRecords.sport, add.sport))).limit(1)
      if (bid > (rec?.faabRemaining ?? 0)) return NextResponse.json({ error: `Bid exceeds your ${add.sport} FAAB ($${rec?.faabRemaining ?? 0})` }, { status: 400 })
    }
    const [rec] = await db.select({ p: teamRecords.waiverPriority }).from(teamRecords)
      .where(and(eq(teamRecords.teamId, myTeam.id), eq(teamRecords.season, league.season), eq(teamRecords.sport, add.sport))).limit(1)

    await db.insert(waiverClaims).values({
      id: nanoid(), leagueId: id, teamId: myTeam.id, sport: add.sport,
      addPlayerId: body.addPlayerId, dropPlayerId: body.dropPlayerId ?? null,
      bidAmount: bid, priority: rec?.p ?? 99, status: 'PENDING',
    })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'PROCESS') {
    if (league.commissionerId !== session.user.id) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
    const result = await processWaivers(league)
    return NextResponse.json(result)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// Resolve all pending claims for a league, honoring its waiver type.
async function processWaivers(league: any) {
  const pending = await db.select().from(waiverClaims).where(and(eq(waiverClaims.leagueId, league.id), eq(waiverClaims.status, 'PENDING')))
  if (!pending.length) return { processed: 0, awarded: 0 }

  const teamRows = await db.select().from(teams).where(eq(teams.leagueId, league.id))
  const tById = Object.fromEntries(teamRows.map(t => [t.id, t]))
  const isFaab = league.waiverType === 'FAAB'

  // Live per-sport budgets / priorities so multiple awards in one run stay consistent.
  const recs = await db.select().from(teamRecords).where(eq(teamRecords.season, league.season))
  const recKey = (teamId: string, sport: string) => `${teamId}:${sport}`
  const budget: Record<string, number> = {}
  const priority: Record<string, number> = {}
  for (const r of recs) {
    if (!tById[r.teamId]) continue
    budget[recKey(r.teamId, r.sport)] = r.faabRemaining ?? 0
    priority[recKey(r.teamId, r.sport)] = r.waiverPriority ?? 99
  }

  // Group contested claims per add-player.
  const byPlayer: Record<string, typeof pending> = {}
  for (const c of pending) (byPlayer[c.addPlayerId] ??= []).push(c)

  const awarded: string[] = []
  const taken = new Set<string>() // players already awarded this run

  // FAAB: process the biggest bids first so budgets resolve fairly across players.
  const playerOrder = Object.keys(byPlayer).sort((a, b) => {
    if (!isFaab) return 0
    const maxBid = (pid: string) => Math.max(...byPlayer[pid].map(c => c.bidAmount ?? 0))
    return maxBid(b) - maxBid(a)
  })

  for (const playerId of playerOrder) {
    if (taken.has(playerId)) continue
    const sport = byPlayer[playerId][0].sport ?? 'NFL'

    // Rank claimants: FAAB by bid desc then priority asc; PRIORITY by priority asc.
    const ranked = byPlayer[playerId].slice().sort((a, b) => {
      if (isFaab && (b.bidAmount ?? 0) !== (a.bidAmount ?? 0)) return (b.bidAmount ?? 0) - (a.bidAmount ?? 0)
      return (priority[recKey(a.teamId, a.sport ?? sport)] ?? 99) - (priority[recKey(b.teamId, b.sport ?? sport)] ?? 99)
    })

    let winner: typeof pending[number] | null = null
    for (const c of ranked) {
      // Still a free agent?
      const rostered = await db.select({ id: rosters.id }).from(rosters)
        .innerJoin(teams, eq(rosters.teamId, teams.id))
        .where(and(eq(rosters.playerId, playerId), eq(teams.leagueId, league.id))).limit(1)
      if (rostered.length) break
      // Affordable?
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

    // Execute the winning claim.
    const [add] = await db.select().from(players).where(eq(players.id, playerId)).limit(1)
    if (winner.dropPlayerId) {
      await db.delete(rosters).where(and(eq(rosters.teamId, winner.teamId), eq(rosters.playerId, winner.dropPlayerId)))
    }
    await db.insert(rosters).values({ id: nanoid(), teamId: winner.teamId, playerId, sport: add?.sport ?? sport, slot: 'BN', acquisitionType: 'WAIVER' }).onConflictDoNothing()
    await db.update(waiverClaims).set({ status: 'WON', processedAt: new Date().toISOString() }).where(eq(waiverClaims.id, winner.id))
    taken.add(playerId)

    const k = recKey(winner.teamId, winner.sport ?? sport)
    if (isFaab) {
      budget[k] = (budget[k] ?? 0) - (winner.bidAmount ?? 0)
      await db.update(teamRecords).set({ faabRemaining: budget[k] })
        .where(and(eq(teamRecords.teamId, winner.teamId), eq(teamRecords.season, league.season), eq(teamRecords.sport, winner.sport ?? sport)))
    } else {
      // Winner drops to the back of the line; everyone better than them shifts up one.
      const maxPriority = Math.max(...Object.entries(priority).filter(([key]) => key.endsWith(`:${winner!.sport ?? sport}`)).map(([, v]) => v), teamRows.length)
      const oldP = priority[k] ?? maxPriority
      for (const [key, v] of Object.entries(priority)) {
        if (!key.endsWith(`:${winner.sport ?? sport}`)) continue
        if (v > oldP) { priority[key] = v - 1 }
      }
      priority[k] = maxPriority
    }

    const tName = tById[winner.teamId]?.name ?? 'A franchise'
    await logActivity(league.id, 'WAIVER', `${tName} claimed ${add?.name ?? 'a player'} off waivers${isFaab ? ` ($${winner.bidAmount})` : ''}`, winner.teamId)
    const owner = tById[winner.teamId]?.userId
    if (owner) await notify(owner, `You won ${add?.name ?? 'a player'} on waivers${isFaab ? ` for $${winner.bidAmount}` : ''}`, `/teams/${winner.teamId}`)
    awarded.push(playerId)
  }

  // Persist updated priority order (PRIORITY leagues).
  if (!isFaab) {
    for (const [key, v] of Object.entries(priority)) {
      const [tid, sport] = key.split(':')
      await db.update(teamRecords).set({ waiverPriority: v })
        .where(and(eq(teamRecords.teamId, tid), eq(teamRecords.season, league.season), eq(teamRecords.sport, sport)))
    }
  }

  return { processed: pending.length, awarded: awarded.length }
}
