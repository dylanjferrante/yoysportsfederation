import { db } from '@/db'
import { trades, teams, rosters, tradeItems, draftPicks, players, teamRecords, leagues } from '@/db/schema'
import { eq, inArray, and } from 'drizzle-orm'
import { reviewState, LEAGUE_OF } from '@/lib/ysf-rules'
import { nanoid } from 'nanoid'
import { logActivity, notify } from '@/lib/activity'
import { sendPush } from '@/lib/push'

export async function executeTrade(tradeId: string): Promise<boolean> {
  const [trade] = await db.select().from(trades).where(eq(trades.id, tradeId)).limit(1)
  if (!trade || (trade.status !== 'PENDING' && trade.status !== 'REVIEW')) return false
  const [lg] = trade.leagueId ? await db.select({ season: leagues.season }).from(leagues).where(eq(leagues.id, trade.leagueId)).limit(1) : []
  const items = await db.select().from(tradeItems).where(eq(tradeItems.tradeId, tradeId))

  const teamSet = new Set<string>([trade.initiatorId])
  if (trade.recipientId) teamSet.add(trade.recipientId)
  for (const it of items) { if (it.fromTeamId) teamSet.add(it.fromTeamId); if (it.toTeamId) teamSet.add(it.toTeamId) }
  const teamRows = await db.select().from(teams).where(inArray(teams.id, [...teamSet]))
  const nameOf = (tid: string | null | undefined) => teamRows.find(t => t.id === tid)?.name ?? 'A franchise'

  for (const it of items) {
    let from = it.fromTeamId, to = it.toTeamId
    if (!from || !to) {
      from = it.direction === 'GIVING' ? trade.initiatorId : (trade.recipientId ?? trade.initiatorId)
      to = it.direction === 'GIVING' ? (trade.recipientId ?? trade.initiatorId) : trade.initiatorId
    }
    if (it.playerId && to) {
      const [pl] = await db.select({ name: players.name, sport: players.sport }).from(players).where(eq(players.id, it.playerId)).limit(1)
      const [existing] = await db.select({ salary: rosters.salary, contractYears: rosters.contractYears }).from(rosters).where(eq(rosters.playerId, it.playerId)).limit(1)
      await db.delete(rosters).where(eq(rosters.playerId, it.playerId))
      await db.insert(rosters).values({ id: nanoid(), teamId: to, playerId: it.playerId, sport: pl?.sport ?? 'NFL', slot: 'BN', acquisitionType: 'TRADE', salary: existing?.salary ?? 0, contractYears: existing?.contractYears ?? null }).onConflictDoNothing()
      await logActivity(trade.leagueId!, 'TRADE', `${nameOf(from)} traded ${pl?.name ?? 'a player'} (${pl?.sport ?? '—'}) to ${nameOf(to)}`, to ?? null)
    }
    if (it.faabSport && it.faabAmount && from && to && lg) {
      for (const [tid, d] of [[from, -it.faabAmount], [to, it.faabAmount]] as [string, number][]) {
        const [rec] = await db.select({ id: teamRecords.id, f: teamRecords.faabRemaining }).from(teamRecords).where(and(eq(teamRecords.teamId, tid), eq(teamRecords.season, lg.season), eq(teamRecords.sport, it.faabSport))).limit(1)
        if (rec) await db.update(teamRecords).set({ faabRemaining: (rec.f ?? 0) + d }).where(eq(teamRecords.id, rec.id))
      }
      await logActivity(trade.leagueId!, 'TRADE', `${nameOf(from)} traded $${it.faabAmount} of ${LEAGUE_OF[it.faabSport] ?? it.faabSport} FAAB to ${nameOf(to)}`, to)
    }
    if (it.pickId && to) {
      const [pk] = await db.select({ year: draftPicks.year, sport: draftPicks.sport, round: draftPicks.round }).from(draftPicks).where(eq(draftPicks.id, it.pickId)).limit(1)
      await db.update(draftPicks).set({ currentTeamId: to }).where(eq(draftPicks.id, it.pickId))
      await logActivity(trade.leagueId!, 'TRADE', `${nameOf(from)} traded a ${pk?.year ?? ''} ${pk?.sport ?? 'OVERALL'} round ${pk?.round ?? '?'} pick to ${nameOf(to)}`, to ?? null)
    }
  }

  await db.update(trades).set({ status: 'ACCEPTED', processedAt: new Date().toISOString() }).where(eq(trades.id, tradeId))
  const partyNames = teamRows.map(t => t.name).join(' / ')
  const partyUsers = teamRows.map(t => t.userId).filter(Boolean) as string[]
  await notify(partyUsers, `Your trade is complete: ${partyNames}`, `/trade`, 'TRADE')
  await sendPush(partyUsers, '🔁 Trade complete', `${partyNames} — assets have moved.`, { type: 'TRADE', leagueId: trade.leagueId })
  return true
}

// ySF: trades in their 48-hour review take effect once it (and any veto window) has passed;
// a vetoed trade is closed. Assets that left a club during review fail the trade.
export async function settleTrades(leagueId: string) {
  const due = await db.select().from(trades).where(and(eq(trades.leagueId, leagueId), eq(trades.status, 'REVIEW')))
  for (const t of due) {
    const items = await db.select().from(tradeItems).where(eq(tradeItems.tradeId, t.id))
    const parties = [...new Set([t.initiatorId, t.recipientId, ...items.flatMap(i => [i.fromTeamId, i.toTeamId])].filter(Boolean) as string[])]
    const st = reviewState(t, parties)
    if (st.outcome === 'VETOED') {
      await db.update(trades).set({ status: 'VETOED', processedAt: new Date().toISOString() }).where(eq(trades.id, t.id))
      const us = await db.select({ u: teams.userId }).from(teams).where(inArray(teams.id, parties))
      await notify(us.map(x => x.u).filter(Boolean) as string[], 'Your trade was vetoed', `/leagues/${leagueId}/trade`, 'TRADE')
      continue
    }
    if (st.outcome !== 'CLEARED') continue
    let ok = true
    for (const it of items) {
      if (!it.playerId || !it.fromTeamId) continue
      const [r] = await db.select({ id: rosters.id }).from(rosters).where(and(eq(rosters.teamId, it.fromTeamId), eq(rosters.playerId, it.playerId))).limit(1)
      if (!r) ok = false
    }
    if (!ok) { await db.update(trades).set({ status: 'FAILED', processedAt: new Date().toISOString() }).where(eq(trades.id, t.id)); continue }
    await executeTrade(t.id)
  }
}
