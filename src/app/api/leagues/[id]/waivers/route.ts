import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, rosters, players, teamRecords, waiverClaims } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { processAllNow } from '@/lib/waivers'

// List a league's waiver claims (enriched with player + franchise names).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const all = await db.select().from(waiverClaims).where(eq(waiverClaims.leagueId, id))
  const teamRows = await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation, userId: teams.userId }).from(teams).where(eq(teams.leagueId, id))
  const tById = Object.fromEntries(teamRows.map(t => [t.id, t]))

  // Sniping guard: a PENDING claim is only visible to its own franchise. Settled
  // claims (WON/LOST/FAILED) are public history once the period has processed.
  const myTeamIds = new Set(teamRows.filter(t => t.userId === session.user.id).map(t => t.id))
  const pendingCount = all.filter(c => c.status === 'PENDING').length
  const claims = all.filter(c => c.status !== 'PENDING' || myTeamIds.has(c.teamId))

  const playerIds = [...new Set(claims.flatMap(c => [c.addPlayerId, c.dropPlayerId].filter(Boolean) as string[]))]
  const playerRows = playerIds.length ? await db.select({ id: players.id, name: players.name, position: players.position, sport: players.sport }).from(players).where(inArray(players.id, playerIds)) : []
  const pById = Object.fromEntries(playerRows.map(p => [p.id, p]))

  const enriched = claims.map(c => ({
    ...c,
    team: tById[c.teamId],
    addPlayer: pById[c.addPlayerId],
    dropPlayer: c.dropPlayerId ? pById[c.dropPlayerId] : null,
    mine: tById[c.teamId]?.userId === session.user.id,
  })).sort((a, b) => (b.claimedAt ?? '').localeCompare(a.claimedAt ?? ''))

  return NextResponse.json({ claims: enriched, pendingCount })
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
    const result = await processAllNow(league)
    return NextResponse.json(result)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

