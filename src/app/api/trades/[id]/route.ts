import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { trades, teams, rosters, tradeItems, tradeApprovals, players, leagues } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { logActivity, notify } from '@/lib/activity'
import { safeParse } from '@/lib/utils'
import { executeTrade, settleTrades } from '@/lib/trades'
import { isYsf, eligCapError, reviewState, RULES, LEAGUE_OF } from '@/lib/ysf-rules'
import { sql } from 'drizzle-orm'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { action, note } = await req.json() as { action: 'ACCEPT' | 'REJECT' | 'CANCEL' | 'COMPLAIN' | 'VETO' | 'OVERRIDE'; note?: string }

  const [trade] = await db.select().from(trades).where(eq(trades.id, id)).limit(1)
  if (!trade) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const items = await db.select().from(tradeItems).where(eq(tradeItems.tradeId, id))

  if (trade.status === 'REVIEW' && ['COMPLAIN', 'VETO', 'OVERRIDE'].includes(action)) {
    // Art. IV §B(6): any club may flag a bad-faith trade during review; the Commission (or, with a
    // Commission club in the deal, the Federation) may veto within 36 hours; the Federation may override
    const parties = [...new Set([trade.initiatorId, trade.recipientId, ...items.flatMap(i => [i.fromTeamId, i.toTeamId])].filter(Boolean) as string[])]
    const [me] = await db.select().from(teams).where(and(eq(teams.leagueId, trade.leagueId!), eq(teams.userId, session.user.id))).limit(1)
    if (!me) return NextResponse.json({ error: 'No club in this league' }, { status: 403 })
    if (parties.includes(me.id)) return NextResponse.json({ error: 'Clubs in the trade can’t file or vote on it' }, { status: 403 })
    const st = reviewState(trade, parties)
    const now = new Date().toISOString()
    if (action === 'COMPLAIN') {
      if (!st.complaintAt) db.run(sql`UPDATE trades SET complaint_at = ${now} WHERE id = ${id}`)
    } else {
      if (action === 'VETO' && !st.voters.includes(me.id)) return NextResponse.json({ error: st.commissionParty ? 'Only clubs outside the trade vote on this veto' : 'Only the Commission can veto this trade' }, { status: 403 })
      if (action === 'VETO' && !st.complaintAt) return NextResponse.json({ error: 'A bad-faith complaint has to be filed first' }, { status: 400 })
      if (action === 'VETO' && st.vetoEnds && now > st.vetoEnds) return NextResponse.json({ error: `The ${RULES.vetoHours}-hour veto window has closed` }, { status: 400 })
      if (action === 'OVERRIDE' && st.commissionParty) return NextResponse.json({ error: 'There is no Commission veto to override on this trade' }, { status: 400 })
    }
    db.run(sql`INSERT OR IGNORE INTO ysf_trade_votes (trade_id, team_id, kind, note, created_at) VALUES (${id}, ${me.id}, ${action === 'COMPLAIN' ? 'COMPLAINT' : action}, ${note ?? null}, ${now})`)
    if (action === 'COMPLAIN') {
      const others = await db.select({ u: teams.userId }).from(teams).where(eq(teams.leagueId, trade.leagueId!))
      await notify(others.map(o => o.u).filter(Boolean) as string[], `A trade under review has been flagged as possible bad faith`, `/leagues/${trade.leagueId}/trade`, 'TRADE')
    }
    await settleTrades(trade.leagueId!)
    const [cur] = await db.select().from(trades).where(eq(trades.id, id)).limit(1)
    return NextResponse.json({ ...cur, review: reviewState(cur, parties) })
  }
  if (trade.status !== 'PENDING') return NextResponse.json({ error: 'Trade is no longer pending' }, { status: 400 })

  // All franchises involved (initiator + recipient + any from/to on items).
  const teamSet = new Set<string>([trade.initiatorId])
  if (trade.recipientId) teamSet.add(trade.recipientId)
  for (const it of items) { if (it.fromTeamId) teamSet.add(it.fromTeamId); if (it.toTeamId) teamSet.add(it.toTeamId) }
  const teamRows = await db.select().from(teams).where(inArray(teams.id, [...teamSet]))
  const myTeam = teamRows.find(t => t.userId === session.user.id)
  const isInitiator = myTeam?.id === trade.initiatorId

  const finish = async (status: string) => {
    const [updated] = await db.update(trades).set({ status, processedAt: new Date().toISOString() }).where(eq(trades.id, id)).returning()
    return NextResponse.json(updated)
  }

  const initiatorTeam = teamRows.find(t => t.id === trade.initiatorId)

  if (action === 'CANCEL') {
    if (!isInitiator) return NextResponse.json({ error: 'Only the initiator can cancel' }, { status: 403 })
    return finish('CANCELLED')
  }
  if (action === 'REJECT') {
    if (!myTeam) return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
    if (initiatorTeam?.userId) await notify(initiatorTeam.userId, `${myTeam.name} rejected your trade proposal`, `/trade`, 'TRADE')
    return finish('REJECTED')
  }

  // ACCEPT — record this franchise's approval, execute once everyone has accepted.
  if (!myTeam || isInitiator) return NextResponse.json({ error: 'Only a recipient franchise can accept' }, { status: 403 })
  await db.update(tradeApprovals).set({ status: 'ACCEPTED' }).where(and(eq(tradeApprovals.tradeId, id), eq(tradeApprovals.teamId, myTeam.id)))

  const approvals = await db.select().from(tradeApprovals).where(eq(tradeApprovals.tradeId, id))
  const allAccepted = approvals.length > 0 && approvals.every(a => a.status === 'ACCEPTED')
  if (!allAccepted) return NextResponse.json({ status: 'PENDING', waiting: true })

  // Execute: route every asset from its source franchise to its destination, and log
  // a separate transaction entry for each asset (player or pick) with its details.
  const nameOf = (tid: string | null | undefined) => teamRows.find(t => t.id === tid)?.name ?? 'A franchise'

  // Resolve an item's from/to (mirrors the execution loop below).
  const routeOf = (it: typeof items[number]) => {
    let from = it.fromTeamId, to = it.toTeamId
    if (!from || !to) {
      from = it.direction === 'GIVING' ? trade.initiatorId : (trade.recipientId ?? trade.initiatorId)
      to = it.direction === 'GIVING' ? (trade.recipientId ?? trade.initiatorId) : trade.initiatorId
    }
    return { from, to }
  }

  // Pre-execution validation: hard salary cap and per-position roster limits on the
  // resulting rosters (only when the league enables them).
  const [lg] = await db.select().from(leagues).where(eq(leagues.id, trade.leagueId!)).limit(1)
  const capOn = !!lg?.salaryCapEnabled && (lg?.capMode ?? 'SOFT') === 'HARD'
  const posLimits = safeParse<Record<string, Record<string, { maxRostered?: number }>>>(lg?.positionLimits, {})
  const hasPosLimits = Object.keys(posLimits).length > 0
  if (capOn || hasPosLimits) {
    const teamIds = [...teamSet]
    const current = await db.select({ teamId: rosters.teamId, playerId: rosters.playerId, salary: rosters.salary, sport: players.sport, position: players.position })
      .from(rosters).innerJoin(players, eq(rosters.playerId, players.id)).where(inArray(rosters.teamId, teamIds))
    type RP = { playerId: string; salary: number; sport: string; position: string }
    const rosterByTeam: Record<string, RP[]> = Object.fromEntries(teamIds.map(t => [t, [] as RP[]]))
    const metaByPlayer: Record<string, RP> = {}
    for (const r of current) {
      const rp: RP = { playerId: r.playerId, salary: r.salary ?? 0, sport: r.sport, position: r.position }
      rosterByTeam[r.teamId].push(rp)
      metaByPlayer[r.playerId] = rp
    }
    // Apply each player move to the simulated rosters.
    for (const it of items) {
      if (!it.playerId) continue
      const { from, to } = routeOf(it)
      if (from && rosterByTeam[from]) rosterByTeam[from] = rosterByTeam[from].filter(p => p.playerId !== it.playerId)
      const meta = metaByPlayer[it.playerId]
      if (to && rosterByTeam[to] && meta) rosterByTeam[to].push(meta)
    }
    for (const tid of teamIds) {
      const list = rosterByTeam[tid] ?? []
      if (capOn) {
        const total = list.reduce((s, p) => s + (p.salary || 0), 0)
        if (total > (lg!.salaryCap ?? 0))
          return NextResponse.json({ error: `Trade rejected: ${nameOf(tid)} would be over the hard salary cap (${total} > ${lg!.salaryCap ?? 0})` }, { status: 400 })
      }
      if (hasPosLimits) {
        const counts: Record<string, number> = {}
        for (const p of list) {
          const cap = posLimits[p.sport]?.[p.position]?.maxRostered
          if (cap == null) continue
          const key = `${p.sport}:${p.position}`
          counts[key] = (counts[key] ?? 0) + 1
          if (counts[key] > cap)
            return NextResponse.json({ error: `Trade rejected: ${nameOf(tid)} would exceed the ${p.position} roster limit (${cap}) in ${p.sport}` }, { status: 400 })
        }
      }
    }
  }

  if (isYsf(trade.leagueId)) {
    // Art. V eligibility maxima on the resulting rosters, then the 48-hour review (Art. IV §B(4))
    const teamIds = [...teamSet]
    const cur = await db.select({ teamId: rosters.teamId, playerId: rosters.playerId, sport: players.sport, position: players.position, eligible: players.eligiblePositions })
      .from(rosters).innerJoin(players, eq(rosters.playerId, players.id)).where(inArray(rosters.teamId, teamIds))
    const byTeam: Record<string, typeof cur> = Object.fromEntries(teamIds.map(t => [t, cur.filter(r => r.teamId === t)]))
    for (const it of items) {
      if (!it.playerId) continue
      const { from, to } = routeOf(it)
      const meta = cur.find(r => r.playerId === it.playerId)
      if (from) byTeam[from] = (byTeam[from] ?? []).filter(r => r.playerId !== it.playerId)
      if (to && meta) byTeam[to] = [...(byTeam[to] ?? []), meta]
    }
    for (const tid of teamIds) for (const sp of ['NFL', 'NHL', 'MLB']) {
      const err = eligCapError(sp, (byTeam[tid] ?? []).filter(r => r.sport === sp))
      if (err) return NextResponse.json({ error: `Trade rejected: ${nameOf(tid)} — ${err}` }, { status: 400 })
    }
    const ends = new Date(Date.now() + RULES.reviewHours * 3_600_000).toISOString()
    const [upd] = await db.update(trades).set({ status: 'REVIEW', reviewDeadline: ends }).where(eq(trades.id, id)).returning()
    const all = await db.select({ u: teams.userId }).from(teams).where(eq(teams.leagueId, trade.leagueId!))
    await notify(all.map(a => a.u).filter(Boolean) as string[], `Trade accepted: ${teamRows.map(t => t.name).join(' / ')} — 48-hour review under way`, `/leagues/${trade.leagueId}/trade`, 'TRADE')
    await logActivity(trade.leagueId!, 'TRADE', `${teamRows.map(t => t.name).join(' and ')} agreed to a trade; it takes effect after the 48-hour review`, null)
    return NextResponse.json(upd)
  }

  await executeTrade(id)
  const [done] = await db.select().from(trades).where(eq(trades.id, id)).limit(1)
  return NextResponse.json(done)
}
