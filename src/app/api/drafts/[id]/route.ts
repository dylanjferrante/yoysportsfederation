import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { drafts, leagues, teams, teamRecords, rosters, players, draftPicks, draftQueues, draftAutopick } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { safeParse } from '@/lib/utils'
import { computeFederationStandings } from '@/lib/federation'

const SPORTS = ['NFL', 'NBA', 'NHL', 'MLB']

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

// Projected-points share within each sport, so values are comparable across sports.
async function sportTotals() {
  const totals: Record<string, number> = {}
  for (const s of SPORTS) {
    const rows = await db.select({ p: players.projectedPoints }).from(players).where(eq(players.sport, s))
    totals[s] = rows.reduce((a, r) => a + (r.p ?? 0), 0) || 1
  }
  return totals
}
const shareValue = (p: { sport: string; projectedPoints: number | null }, totals: Record<string, number>) => (p.projectedPoints ?? 0) / (totals[p.sport] ?? 1)

async function rosteredSet(leagueId: string) {
  const rows = await db.select({ pid: rosters.playerId }).from(rosters).innerJoin(teams, eq(rosters.teamId, teams.id)).where(eq(teams.leagueId, leagueId))
  return new Set(rows.map(r => r.pid))
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const [draft] = await db.select().from(drafts).where(eq(drafts.id, id)).limit(1)
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const order = await draftOrder(draft.leagueId, draft.season)
  const total = (draft.rounds ?? 4) * order.length
  const myTeam = session ? order.find(o => o.userId === session.user.id) : null

  const made = await db
    .select({ pickNumber: draftPicks.pickNumber, sport: draftPicks.sport, teamId: draftPicks.currentTeamId, playerName: players.name, playerId: players.id, position: players.position })
    .from(draftPicks).leftJoin(players, eq(draftPicks.pickedPlayerId, players.id))
    .where(and(eq(draftPicks.draftId, id), eq(draftPicks.isUsed, true)))
  const madeByPick = Object.fromEntries(made.filter(m => m.pickNumber).map(m => [m.pickNumber, m]))

  // Full board: every pick, previous + upcoming.
  const board = Array.from({ length: total }, (_, i) => {
    const pk = i + 1
    const t = onClock(order, pk)
    return { pickNumber: pk, round: Math.ceil(pk / order.length), teamId: t?.id, teamAbbr: t?.abbreviation, player: madeByPick[pk] ? { name: madeByPick[pk].playerName, sport: madeByPick[pk].sport, position: madeByPick[pk].position } : null }
  })

  const current = draft.currentPick ?? 0
  const clock = draft.status === 'IN_PROGRESS' && current > 0 && current <= total ? onClock(order, current) : null

  const rostered = await rosteredSet(draft.leagueId)
  const sportsFilter = draft.scope === 'OVERALL' ? SPORTS : [draft.scope]
  const totals = await sportTotals()
  const pool = await db.select().from(players).where(inArray(players.sport, sportsFilter)).limit(5000)
  const available = pool.filter(p => !rostered.has(p.id))
    .map(p => ({ id: p.id, name: p.name, sport: p.sport, position: p.position, realTeam: p.realTeam, projectedPoints: p.projectedPoints, value: +(shareValue(p, totals) * 100).toFixed(2) }))
    .sort((a, b) => b.value - a.value).slice(0, 300)

  // Requesting user's queue + auto-pick state.
  let myQueue: any[] = [], myAutopick = false
  if (myTeam) {
    myQueue = await db.select({ playerId: draftQueues.playerId, position: draftQueues.position, name: players.name, sport: players.sport, pos: players.position })
      .from(draftQueues).innerJoin(players, eq(draftQueues.playerId, players.id))
      .where(and(eq(draftQueues.draftId, id), eq(draftQueues.teamId, myTeam.id)))
    myQueue.sort((a, b) => a.position - b.position)
    const [ap] = await db.select().from(draftAutopick).where(and(eq(draftAutopick.draftId, id), eq(draftAutopick.teamId, myTeam.id))).limit(1)
    myAutopick = !!ap?.enabled
  }

  return NextResponse.json({
    draft, order: order.map(o => ({ id: o.id, name: o.name, abbreviation: o.abbreviation, userId: o.userId })),
    board, made, current, total, onClockTeam: clock ? { id: clock.id, name: clock.name } : null,
    available, myTeamId: myTeam?.id ?? null, myQueue, myAutopick,
  })
}

// Pick a player for a team: roster them, record the pick, drop from all queues.
async function commitPick(draft: any, order: any[], teamId: string, playerId: string, pickNumber: number) {
  const [pl] = await db.select().from(players).where(eq(players.id, playerId)).limit(1)
  if (!pl) return
  await db.insert(rosters).values({ id: nanoid(), teamId, playerId: pl.id, sport: pl.sport, slot: 'BN', acquisitionType: 'DRAFT' }).onConflictDoNothing()
  const [slot] = await db.select().from(draftPicks).where(and(eq(draftPicks.draftId, draft.id), eq(draftPicks.currentTeamId, teamId), eq(draftPicks.isUsed, false))).limit(1)
  if (slot) await db.update(draftPicks).set({ isUsed: true, pickedPlayerId: pl.id, pickNumber, sport: pl.sport }).where(eq(draftPicks.id, slot.id))
  else await db.insert(draftPicks).values({ id: nanoid(), leagueId: draft.leagueId, draftId: draft.id, sport: pl.sport, round: Math.ceil(pickNumber / order.length), year: Number(draft.season.slice(0, 4)) || 2027, originalTeamId: teamId, currentTeamId: teamId, isUsed: true, pickedPlayerId: pl.id, pickNumber })
  await db.delete(draftQueues).where(and(eq(draftQueues.draftId, draft.id), eq(draftQueues.playerId, pl.id)))
}

// Auto-select for the on-the-clock team: top available queued player, else best available by share.
async function autoSelect(draft: any, teamId: string, sportsFilter: string[], rostered: Set<string | null>, totals: Record<string, number>) {
  const q = await db.select({ playerId: draftQueues.playerId, position: draftQueues.position, sport: players.sport })
    .from(draftQueues).innerJoin(players, eq(draftQueues.playerId, players.id))
    .where(and(eq(draftQueues.draftId, draft.id), eq(draftQueues.teamId, teamId)))
  const queued = q.filter(x => !rostered.has(x.playerId) && sportsFilter.includes(x.sport)).sort((a, b) => a.position - b.position)
  if (queued.length) return queued[0].playerId
  const pool = await db.select().from(players).where(inArray(players.sport, sportsFilter)).limit(5000)
  const best = pool.filter(p => !rostered.has(p.id)).sort((a, b) => shareValue(b, totals) - shareValue(a, totals))[0]
  return best?.id ?? null
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [draft] = await db.select().from(drafts).where(eq(drafts.id, id)).limit(1)
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [league] = await db.select().from(leagues).where(eq(leagues.id, draft.leagueId)).limit(1)
  const isCommish = league?.commissionerId === session.user.id
  const order = await draftOrder(draft.leagueId, draft.season)
  const total = (draft.rounds ?? 4) * order.length
  const myTeam = order.find(o => o.userId === session.user.id)
  const sportsFilter = draft.scope === 'OVERALL' ? SPORTS : [draft.scope]

  const body = await req.json() as { action: string; playerId?: string; direction?: string }

  const newDeadline = () => new Date(Date.now() + (draft.pickSeconds ?? 90) * 1000).toISOString()

  // Queue management
  if (body.action === 'QUEUE_ADD' && body.playerId && myTeam) {
    const existing = await db.select().from(draftQueues).where(and(eq(draftQueues.draftId, id), eq(draftQueues.teamId, myTeam.id)))
    const pos = existing.length ? Math.max(...existing.map(e => e.position)) + 1 : 1
    await db.insert(draftQueues).values({ id: nanoid(), draftId: id, teamId: myTeam.id, playerId: body.playerId, position: pos }).onConflictDoNothing()
    return NextResponse.json({ ok: true })
  }
  if (body.action === 'QUEUE_REMOVE' && body.playerId && myTeam) {
    await db.delete(draftQueues).where(and(eq(draftQueues.draftId, id), eq(draftQueues.teamId, myTeam.id), eq(draftQueues.playerId, body.playerId)))
    return NextResponse.json({ ok: true })
  }
  if (body.action === 'QUEUE_MOVE' && body.playerId && myTeam) {
    const rows = await db.select().from(draftQueues).where(and(eq(draftQueues.draftId, id), eq(draftQueues.teamId, myTeam.id)))
    rows.sort((a, b) => a.position - b.position)
    const i = rows.findIndex(r => r.playerId === body.playerId)
    const j = body.direction === 'up' ? i - 1 : i + 1
    if (i >= 0 && j >= 0 && j < rows.length) {
      await db.update(draftQueues).set({ position: rows[j].position }).where(eq(draftQueues.id, rows[i].id))
      await db.update(draftQueues).set({ position: rows[i].position }).where(eq(draftQueues.id, rows[j].id))
    }
    return NextResponse.json({ ok: true })
  }
  if (body.action === 'TOGGLE_AUTOPICK' && myTeam) {
    const [ap] = await db.select().from(draftAutopick).where(and(eq(draftAutopick.draftId, id), eq(draftAutopick.teamId, myTeam.id))).limit(1)
    if (ap) await db.update(draftAutopick).set({ enabled: !ap.enabled }).where(eq(draftAutopick.id, ap.id))
    else await db.insert(draftAutopick).values({ id: nanoid(), draftId: id, teamId: myTeam.id, enabled: true })
    // fall through to run autopick loop in case it's now this team's turn
  }

  if (body.action === 'START') {
    if (!isCommish) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
    await db.update(drafts).set({ status: 'IN_PROGRESS', currentPick: 1, pickDeadline: newDeadline() }).where(eq(drafts.id, id))
  }

  // Clock expiry: anyone may tick; the server only force-picks once the deadline passes.
  if (body.action === 'TICK') {
    if (draft.status === 'IN_PROGRESS' && draft.pickDeadline && Date.now() >= Date.parse(draft.pickDeadline)) {
      const clock = onClock(order, draft.currentPick ?? 1)
      if (clock) {
        const totals = await sportTotals()
        const rostered = await rosteredSet(draft.leagueId)
        const pid = await autoSelect(draft, clock.id, sportsFilter, rostered, totals)
        if (pid) {
          await commitPick(draft, order, clock.id, pid, draft.currentPick ?? 1)
          await db.update(drafts).set({ currentPick: (draft.currentPick ?? 1) + 1 }).where(eq(drafts.id, id))
        }
      }
    }
  }

  // Explicit human pick
  if (body.action === 'PICK' && body.playerId) {
    if (draft.status !== 'IN_PROGRESS') return NextResponse.json({ error: 'Draft not active' }, { status: 400 })
    const clock = onClock(order, draft.currentPick ?? 1)
    if (!clock) return NextResponse.json({ error: 'Draft complete' }, { status: 400 })
    if (!isCommish && myTeam?.id !== clock.id) return NextResponse.json({ error: 'Not your pick' }, { status: 403 })
    await commitPick(draft, order, clock.id, body.playerId, draft.currentPick ?? 1)
    await db.update(drafts).set({ currentPick: (draft.currentPick ?? 1) + 1 }).where(eq(drafts.id, id))
  }

  // Run auto-pick for any consecutive auto-enabled teams now on the clock.
  let [live] = await db.select().from(drafts).where(eq(drafts.id, id)).limit(1)
  if (live.status === 'IN_PROGRESS') {
    const totals = await sportTotals()
    let guard = 0
    while ((live.currentPick ?? 1) <= total && guard++ < total + 1) {
      const clock = onClock(order, live.currentPick ?? 1)
      if (!clock) break
      const [ap] = await db.select().from(draftAutopick).where(and(eq(draftAutopick.draftId, id), eq(draftAutopick.teamId, clock.id))).limit(1)
      const autoNow = body.action === 'AUTO_PICK' && clock.id === myTeam?.id
      if (!ap?.enabled && !autoNow) break
      const rostered = await rosteredSet(draft.leagueId)
      const pid = await autoSelect(live, clock.id, sportsFilter, rostered, totals)
      if (!pid) break
      await commitPick(live, order, clock.id, pid, live.currentPick ?? 1)
      const next = (live.currentPick ?? 1) + 1
      await db.update(drafts).set({ currentPick: next }).where(eq(drafts.id, id))
      live = { ...live, currentPick: next }
      if (autoNow) break // a manual "auto-pick my slot" only makes one pick
    }
    if ((live.currentPick ?? 1) > total) {
      await db.update(drafts).set({ status: 'COMPLETED', pickDeadline: null }).where(eq(drafts.id, id))
    } else if (['START', 'PICK', 'AUTO_PICK', 'TICK', 'TOGGLE_AUTOPICK'].includes(body.action)) {
      // A new team is on the clock — restart their timer.
      await db.update(drafts).set({ pickDeadline: newDeadline() }).where(eq(drafts.id, id))
    }
  }

  return NextResponse.json({ ok: true })
}
