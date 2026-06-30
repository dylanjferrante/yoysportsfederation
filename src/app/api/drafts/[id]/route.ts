import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { drafts, leagues, teams, teamRecords, rosters, players, draftPicks, draftQueues, draftAutopick, auctionBudgets, tradeItems, trades } from '@/db/schema'
import { eq, and, inArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { safeParse } from '@/lib/utils'
import { computeFederationStandings } from '@/lib/federation'

const SPORTS = ['NFL', 'NBA', 'NHL', 'MLB']

async function draftOrder(leagueId: string, season: string, manualOrderJson?: string | null) {
  const franchises = await db.select().from(teams).where(eq(teams.leagueId, leagueId))
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId)).limit(1)

  // A commissioner-set manual order takes precedence when present.
  const manual = safeParse<string[]>(manualOrderJson, [])
  if (Array.isArray(manual) && manual.length) {
    const byId = new Map(franchises.map(f => [f.id, f]))
    const ordered = manual.map(tid => byId.get(tid)).filter(Boolean) as typeof franchises
    // Append any franchises missing from the saved order (e.g. newly added).
    for (const f of franchises) if (!manual.includes(f.id)) ordered.push(f)
    if (ordered.length) return ordered
  }
  const fed = safeParse<any>(league?.federationScoring, { placement: [], championBonus: 0, regularSeasonBonus: 0, includedSports: [] })
  const records = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, leagueId), eq(teamRecords.season, season)))
  const standings = computeFederationStandings(
    franchises.map(f => ({ id: f.id })),
    records.map(r => ({ teamId: r.teamId, sport: r.sport, finishPosition: r.finishPosition, isChampion: r.isChampion })),
    fed, fed.includedSports ?? [],
  )
  // Worst → best by federation standings.
  const worstFirst = [...standings].reverse().map(s => franchises.find(f => f.id === s.team.id)!).filter(Boolean)
  if (!worstFirst.length) return franchises

  const method = league?.draftOrderMethod ?? 'REVERSE_STANDINGS'
  if (method === 'REVERSE_STANDINGS' || method === 'MANUAL') return worstFirst

  // Deterministic PRNG seeded by league+season so RANDOM/LOTTERY stay stable
  // across page loads (no need to persist the drawn order).
  const seedStr = `${leagueId}:${season}:${method}`
  let h = 2166136261
  for (const c of seedStr) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) }
  const rng = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; return ((h >>> 0) % 100000) / 100000 }

  if (method === 'RANDOM') {
    const a = [...worstFirst]
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
    return a
  }
  // LOTTERY: weighted by reverse standing — the worst team gets the most balls.
  const pool = worstFirst.map((team, i) => ({ team, weight: worstFirst.length - i }))
  const drawn: typeof worstFirst = []
  while (pool.length) {
    const total = pool.reduce((s, p) => s + p.weight, 0)
    let r = rng() * total
    let idx = 0
    while (idx < pool.length - 1 && (r -= pool[idx].weight) > 0) idx++
    drawn.push(pool[idx].team); pool.splice(idx, 1)
  }
  return drawn
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

  const order = await draftOrder(draft.leagueId, draft.season, draft.manualOrder)
  const total = (draft.rounds ?? 4) * order.length
  const myTeam = session ? order.find(o => o.userId === session.user.id) : null
  const [gleague] = await db.select({ commissionerId: leagues.commissionerId }).from(leagues).where(eq(leagues.id, draft.leagueId)).limit(1)
  const isCommish = !!session && gleague?.commissionerId === session.user.id

  const made = await db
    .select({ pickNumber: draftPicks.pickNumber, sport: draftPicks.sport, teamId: draftPicks.currentTeamId, playerName: players.name, playerId: players.id, position: players.position, realTeamAbbr: players.realTeamAbbr })
    .from(draftPicks).leftJoin(players, eq(draftPicks.pickedPlayerId, players.id))
    .where(and(eq(draftPicks.draftId, id), eq(draftPicks.isUsed, true)))
  const madeByPick = Object.fromEntries(made.filter(m => m.pickNumber).map(m => [m.pickNumber, m]))

  // Traded picks: a slot owned by someone other than its original (snake) team.
  // Build owner + a "VIA" chain (acquired-from … original) from trade history.
  const abbrById: Record<string, string> = Object.fromEntries(order.map(o => [o.id, o.abbreviation]))
  const dpicks = await db.select({ id: draftPicks.id, round: draftPicks.round, originalTeamId: draftPicks.originalTeamId, currentTeamId: draftPicks.currentTeamId })
    .from(draftPicks).where(eq(draftPicks.draftId, id))
  const tradedByRoundTeam = new Map<string, { ownerId: string; pickId: string }>()
  for (const p of dpicks) if (p.currentTeamId !== p.originalTeamId) tradedByRoundTeam.set(`${p.round}:${p.originalTeamId}`, { ownerId: p.currentTeamId, pickId: p.id })
  const viaByPickId: Record<string, string[]> = {}
  if (tradedByRoundTeam.size) {
    const pickIds = [...tradedByRoundTeam.values()].map(v => v.pickId)
    const items = await db.select({ pickId: tradeItems.pickId, fromTeamId: tradeItems.fromTeamId, createdAt: trades.createdAt })
      .from(tradeItems).leftJoin(trades, eq(tradeItems.tradeId, trades.id)).where(inArray(tradeItems.pickId, pickIds))
    const byPick: Record<string, { fromTeamId: string | null; createdAt: string | null }[]> = {}
    for (const it of items) if (it.pickId) (byPick[it.pickId] ??= []).push({ fromTeamId: it.fromTeamId, createdAt: it.createdAt })
    for (const [pid, list] of Object.entries(byPick)) {
      list.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      viaByPickId[pid] = list.map(x => abbrById[x.fromTeamId ?? ''] ?? '').filter(Boolean)
    }
  }

  // Full board: every pick, previous + upcoming.
  const board = Array.from({ length: total }, (_, i) => {
    const pk = i + 1
    const t = onClock(order, pk)
    const round = Math.ceil(pk / order.length)
    const pickInRound = ((pk - 1) % order.length) + 1
    const m = madeByPick[pk]
    // VIA chain for traded slots (column stays the original team; tile shows new owner).
    const traded = t ? tradedByRoundTeam.get(`${round}:${t.id}`) : undefined
    const via = traded ? (viaByPickId[traded.pickId]?.length ? viaByPickId[traded.pickId] : [t!.abbreviation]) : null
    const ownerAbbr = traded ? (abbrById[traded.ownerId] ?? null) : null
    return {
      pickNumber: pk, round, pickInRound, teamId: t?.id, teamAbbr: t?.abbreviation, via, ownerAbbr,
      player: m ? { name: m.playerName, sport: m.sport, position: m.position, realTeamAbbr: m.realTeamAbbr } : null,
    }
  })

  const current = draft.currentPick ?? 0
  const clock = draft.status === 'IN_PROGRESS' && current > 0 && current <= total ? onClock(order, current) : null

  const rostered = await rosteredSet(draft.leagueId)
  const sportsFilter = draft.scope === 'OVERALL' ? SPORTS : [draft.scope]
  const totals = await sportTotals()
  const pool = await db.select().from(players).where(inArray(players.sport, sportsFilter)).limit(5000)
  const available = pool.filter(p => !rostered.has(p.id))
    .map(p => ({ id: p.id, name: p.name, sport: p.sport, position: p.position, realTeam: p.realTeam, projectedPoints: p.projectedPoints, adp: p.adp, value: +(shareValue(p, totals) * 100).toFixed(2) }))
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

  // Auction state (budgets, current nomination, nominator).
  let auction: any = null
  if (draft.type === 'AUCTION') {
    const budgets = await db.select().from(auctionBudgets).where(eq(auctionBudgets.draftId, id))
    const budgetByTeam = Object.fromEntries(budgets.map(b => [b.teamId, { budget: b.budget ?? 0, spent: b.spent ?? 0, remaining: (b.budget ?? 0) - (b.spent ?? 0) }]))
    let nomPlayer = null
    if (draft.nomPlayerId) {
      const [np] = await db.select({ id: players.id, name: players.name, sport: players.sport, position: players.position, realTeam: players.realTeam }).from(players).where(eq(players.id, draft.nomPlayerId)).limit(1)
      nomPlayer = np ?? null
    }
    const nominator = draft.status === 'IN_PROGRESS' && (draft.currentPick ?? 1) <= total ? nominatorOf(order, draft.currentPick ?? 1) : null
    auction = {
      budgets: budgetByTeam,
      nomPlayer,
      highTeamId: draft.nomTeamId,
      highBid: draft.nomBid ?? 0,
      nominatorId: nominator?.id ?? null,
      myRemaining: myTeam ? (budgetByTeam[myTeam.id]?.remaining ?? 200) : 0,
    }
  }

  return NextResponse.json({
    draft, order: order.map(o => ({ id: o.id, name: o.name, abbreviation: o.abbreviation, userId: o.userId, logo: o.logo, primaryColor: o.primaryColor, secondaryColor: o.secondaryColor })),
    board, made, current, total, onClockTeam: clock ? { id: clock.id, name: clock.name } : null,
    available, myTeamId: myTeam?.id ?? null, myQueue, myAutopick, auction, isCommish,
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

// Auction nominator is the team at currentPick's slot, rotating each sale.
function nominatorOf(order: any[], pick: number) {
  if (!order.length) return null
  return order[(Math.max(1, pick) - 1) % order.length]
}

// Finalize the active nomination: roster the player to the high bidder, charge
// their budget, record the pick, and advance to the next nominator.
async function settleNomination(draft: any, order: any[], total: number, newDeadline: (s?: number) => string) {
  if (!draft.nomPlayerId || !draft.nomTeamId) return draft
  await commitPick(draft, order, draft.nomTeamId, draft.nomPlayerId, draft.currentPick ?? 1)
  await db.update(auctionBudgets)
    .set({ spent: sql`${auctionBudgets.spent} + ${draft.nomBid ?? 0}` })
    .where(and(eq(auctionBudgets.draftId, draft.id), eq(auctionBudgets.teamId, draft.nomTeamId)))
  const sold = draft.currentPick ?? 1
  const next = sold + 1
  const done = next > total
  await db.update(drafts).set({
    currentPick: next, nomPlayerId: null, nomTeamId: null, nomBid: 0,
    pickDeadline: done ? null : newDeadline(),
    status: done ? 'COMPLETED' : 'IN_PROGRESS',
  }).where(eq(drafts.id, draft.id))
  return { ...draft, currentPick: next, nomPlayerId: null, nomTeamId: null, nomBid: 0 }
}

async function runAuction(
  draft: any, league: any, order: any[], body: { action: string; playerId?: string; bid?: number },
  ctx: { isCommish: boolean; myTeam: any; sportsFilter: string[]; newDeadline: (s?: number) => string },
) {
  const { isCommish, myTeam, newDeadline } = ctx
  const total = (draft.rounds ?? 4) * order.length
  const budgetSecs = Math.min(draft.pickSeconds ?? 60, 30) // bids run on a short clock

  if (body.action === 'START') {
    if (!isCommish) return { error: 'Commissioner only' }
    // Seed each franchise's auction budget.
    for (const t of order) {
      await db.insert(auctionBudgets).values({ id: nanoid(), draftId: draft.id, teamId: t.id, budget: league?.auctionBudget ?? 200, spent: 0 }).onConflictDoNothing()
    }
    await db.update(drafts).set({ status: 'IN_PROGRESS', currentPick: 1, nomPlayerId: null, nomTeamId: null, nomBid: 0, pickDeadline: newDeadline() }).where(eq(drafts.id, draft.id))
    return { ok: true }
  }

  const budgetOf = async (teamId: string) => {
    const [b] = await db.select().from(auctionBudgets).where(and(eq(auctionBudgets.draftId, draft.id), eq(auctionBudgets.teamId, teamId))).limit(1)
    return b ? (b.budget ?? 0) - (b.spent ?? 0) : 0
  }

  if (body.action === 'NOMINATE' && body.playerId && myTeam) {
    if (draft.status !== 'IN_PROGRESS') return { error: 'Auction not active' }
    if (draft.nomPlayerId) return { error: 'A player is already up for bid' }
    const nominator = nominatorOf(order, draft.currentPick ?? 1)
    if (!isCommish && nominator?.id !== myTeam.id) return { error: 'Not your nomination' }
    const team = nominator ?? myTeam
    const bid = Math.max(1, Math.floor(body.bid ?? 1))
    if (bid > await budgetOf(team.id)) return { error: 'Opening bid exceeds budget' }
    const [pl] = await db.select().from(players).where(eq(players.id, body.playerId)).limit(1)
    if (!pl) return { error: 'Player not found' }
    await db.update(drafts).set({ nomPlayerId: body.playerId, nomTeamId: team.id, nomBid: bid, pickDeadline: newDeadline(budgetSecs) }).where(eq(drafts.id, draft.id))
    return { ok: true }
  }

  if (body.action === 'BID' && myTeam) {
    if (!draft.nomPlayerId) return { error: 'Nothing is up for bid' }
    const bid = Math.floor(body.bid ?? 0)
    if (bid <= (draft.nomBid ?? 0)) return { error: 'Bid must beat the current high bid' }
    if (bid > await budgetOf(myTeam.id)) return { error: 'Bid exceeds your budget' }
    await db.update(drafts).set({ nomTeamId: myTeam.id, nomBid: bid, pickDeadline: newDeadline(budgetSecs) }).where(eq(drafts.id, draft.id))
    return { ok: true }
  }

  // Clock expired → sell the active nomination, or auto-nominate if idle.
  if (body.action === 'TICK' || body.action === 'SETTLE') {
    const forced = body.action === 'SETTLE' && isCommish
    const expired = draft.pickDeadline && Date.now() >= Date.parse(draft.pickDeadline)
    if (draft.status === 'IN_PROGRESS' && (forced || expired)) {
      if (draft.nomPlayerId) {
        await settleNomination(draft, order, total, newDeadline)
      } else {
        // Nominator idled — auto-nominate the best available for them at $1 so the auction keeps moving.
        const nominator = nominatorOf(order, draft.currentPick ?? 1)
        if (nominator) {
          const rostered = await rosteredSet(draft.leagueId)
          const totals = await sportTotals()
          const pid = await autoSelect(draft, nominator.id, ctx.sportsFilter, rostered, totals)
          if (pid) await db.update(drafts).set({ nomPlayerId: pid, nomTeamId: nominator.id, nomBid: 1, pickDeadline: newDeadline(budgetSecs) }).where(eq(drafts.id, draft.id))
        }
      }
    }
    return { ok: true }
  }

  return { ok: true }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [draft] = await db.select().from(drafts).where(eq(drafts.id, id)).limit(1)
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [league] = await db.select().from(leagues).where(eq(leagues.id, draft.leagueId)).limit(1)
  const isCommish = league?.commissionerId === session.user.id
  const order = await draftOrder(draft.leagueId, draft.season, draft.manualOrder)
  const total = (draft.rounds ?? 4) * order.length
  const myTeam = order.find(o => o.userId === session.user.id)
  const sportsFilter = draft.scope === 'OVERALL' ? SPORTS : [draft.scope]

  const body = await req.json() as { action: string; playerId?: string; direction?: string; bid?: number; order?: string[] }

  const newDeadline = (secs = draft.pickSeconds ?? 90) => new Date(Date.now() + secs * 1000).toISOString()

  // Commissioner sets a manual draft order (only before the draft starts).
  if (body.action === 'SET_ORDER') {
    if (!isCommish) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
    if (draft.status !== 'PENDING') return NextResponse.json({ error: 'Order can only be set before the draft starts' }, { status: 400 })
    const ids = Array.isArray(body.order) ? body.order : []
    await db.update(drafts).set({ manualOrder: JSON.stringify(ids) }).where(eq(drafts.id, id))
    return NextResponse.json({ ok: true })
  }

  // ── Auction drafts: nomination + open bidding ──────────────────────────────
  if (draft.type === 'AUCTION') {
    const result = await runAuction(draft, league, order, body, { isCommish, myTeam, sportsFilter, newDeadline })
    return NextResponse.json(result)
  }

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

  // Commissioner pause / resume.
  if (body.action === 'PAUSE') {
    if (!isCommish) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
    await db.update(drafts).set({ status: 'PAUSED', pickDeadline: null }).where(eq(drafts.id, id))
    return NextResponse.json({ ok: true })
  }
  if (body.action === 'RESUME') {
    if (!isCommish) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
    await db.update(drafts).set({ status: 'IN_PROGRESS', pickDeadline: newDeadline() }).where(eq(drafts.id, id))
  }

  // Commissioner skips the current pick by forcing an auto-pick for whoever is on the clock.
  if (body.action === 'FORCE_AUTOPICK') {
    if (!isCommish) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
    if (draft.status === 'IN_PROGRESS') {
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
    } else if (['START', 'RESUME', 'PICK', 'AUTO_PICK', 'TICK', 'TOGGLE_AUTOPICK', 'FORCE_AUTOPICK'].includes(body.action)) {
      // A new team is on the clock — restart their timer.
      await db.update(drafts).set({ pickDeadline: newDeadline() }).where(eq(drafts.id, id))
    }
  }

  return NextResponse.json({ ok: true })
}
