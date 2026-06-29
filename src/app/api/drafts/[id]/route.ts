import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { drafts, leagues, teams, teamRecords, rosters, players, draftPicks } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { safeParse } from '@/lib/utils'
import { computeFederationStandings } from '@/lib/federation'

// Compute the snake draft order (reverse federation standings, worst pick first).
async function draftOrder(leagueId: string, season: string) {
  const franchises = await db.select().from(teams).where(eq(teams.leagueId, leagueId))
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId)).limit(1)
  const fed = safeParse<any>(league?.federationScoring, { placement: [], championBonus: 0, regularSeasonBonus: 0, includedSports: [] })
  const records = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, leagueId), eq(teamRecords.season, season)))
  const standings = computeFederationStandings(
    franchises.map(f => ({ id: f.id })),
    records.map(r => ({ teamId: r.teamId, sport: r.sport, finishPosition: r.finishPosition, isChampion: r.isChampion })),
    fed, fed.includedSports ?? [],
  )
  const order = [...standings].reverse().map(s => franchises.find(f => f.id === s.team.id)!).filter(Boolean)
  return order.length ? order : franchises
}

function onClock(order: any[], pick: number) {
  const n = order.length
  if (!n) return null
  const round = Math.ceil(pick / n)
  const within = (pick - 1) % n
  const roundOrder = round % 2 === 1 ? order : [...order].reverse()
  return roundOrder[within]
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, id)).limit(1)
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const order = await draftOrder(draft.leagueId, draft.season)
  const total = (draft.rounds ?? 4) * order.length

  const made = await db
    .select({ pickNumber: draftPicks.pickNumber, sport: draftPicks.sport, teamId: draftPicks.currentTeamId, playerName: players.name, playerId: players.id, position: players.position })
    .from(draftPicks).leftJoin(players, eq(draftPicks.pickedPlayerId, players.id))
    .where(and(eq(draftPicks.draftId, id), eq(draftPicks.isUsed, true)))
  made.sort((a, b) => (a.pickNumber ?? 0) - (b.pickNumber ?? 0))

  const current = draft.currentPick ?? 0
  const clock = draft.status === 'IN_PROGRESS' && current > 0 && current <= total ? onClock(order, current) : null

  // Available players: free agents in the draft's sport(s), not rostered in the league.
  const rosteredRows = await db.select({ pid: rosters.playerId }).from(rosters).innerJoin(teams, eq(rosters.teamId, teams.id)).where(eq(teams.leagueId, draft.leagueId))
  const rosteredIds = new Set(rosteredRows.map(r => r.pid))
  const sportsFilter = draft.scope === 'OVERALL' ? ['NFL', 'NBA', 'NHL', 'MLB'] : [draft.scope]
  const pool = await db.select().from(players).where(inArray(players.sport, sportsFilter)).limit(4000)
  const available = pool.filter(p => !rosteredIds.has(p.id)).sort((a, b) => (b.seasonPoints ?? 0) - (a.seasonPoints ?? 0)).slice(0, 250)

  return NextResponse.json({
    draft, order: order.map(o => ({ id: o.id, name: o.name, abbreviation: o.abbreviation, userId: o.userId })),
    made, current, total, onClockTeam: clock ? { id: clock.id, name: clock.name } : null,
    available: available.map(p => ({ id: p.id, name: p.name, sport: p.sport, position: p.position, realTeam: p.realTeam, seasonPoints: p.seasonPoints })),
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [draft] = await db.select().from(drafts).where(eq(drafts.id, id)).limit(1)
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [league] = await db.select().from(leagues).where(eq(leagues.id, draft.leagueId)).limit(1)
  const isCommish = league?.commissionerId === session.user.id

  const body = await req.json() as { action: string; playerId?: string }
  const order = await draftOrder(draft.leagueId, draft.season)
  const total = (draft.rounds ?? 4) * order.length

  if (body.action === 'START') {
    if (!isCommish) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
    await db.update(drafts).set({ status: 'IN_PROGRESS', currentPick: 1 }).where(eq(drafts.id, id))
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'PICK' && body.playerId) {
    if (draft.status !== 'IN_PROGRESS') return NextResponse.json({ error: 'Draft not active' }, { status: 400 })
    const current = draft.currentPick ?? 1
    const clock = onClock(order, current)
    if (!clock) return NextResponse.json({ error: 'Draft complete' }, { status: 400 })
    const myTeam = order.find(o => o.userId === session.user.id)
    if (!isCommish && myTeam?.id !== clock.id) return NextResponse.json({ error: 'Not your pick' }, { status: 403 })

    const [pl] = await db.select().from(players).where(eq(players.id, body.playerId)).limit(1)
    if (!pl) return NextResponse.json({ error: 'Player not found' }, { status: 400 })

    // Roster the player to the on-the-clock team and record the pick.
    await db.insert(rosters).values({ id: nanoid(), teamId: clock.id, playerId: pl.id, sport: pl.sport, slot: 'BN', acquisitionType: 'DRAFT' }).onConflictDoNothing()
    // Consume one of that team's unused pick slots for this draft, else create a row.
    const [slot] = await db.select().from(draftPicks).where(and(eq(draftPicks.draftId, id), eq(draftPicks.currentTeamId, clock.id), eq(draftPicks.isUsed, false))).limit(1)
    if (slot) {
      await db.update(draftPicks).set({ isUsed: true, pickedPlayerId: pl.id, pickNumber: current, sport: pl.sport }).where(eq(draftPicks.id, slot.id))
    } else {
      await db.insert(draftPicks).values({ id: nanoid(), leagueId: draft.leagueId, draftId: id, sport: pl.sport, round: Math.ceil(current / order.length), year: Number(draft.season.slice(0, 4)) || 2027, originalTeamId: clock.id, currentTeamId: clock.id, isUsed: true, pickedPlayerId: pl.id, pickNumber: current })
    }

    const next = current + 1
    if (next > total) await db.update(drafts).set({ status: 'COMPLETED', currentPick: next }).where(eq(drafts.id, id))
    else await db.update(drafts).set({ currentPick: next }).where(eq(drafts.id, id))
    return NextResponse.json({ ok: true, nextPick: next, complete: next > total })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
