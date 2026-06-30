import { db } from '@/db'
import { trades, teams, rosters, tradeItems, draftPicks, players } from '@/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { logActivity, notify } from '@/lib/activity'
import { sendPush } from '@/lib/push'

export async function executeTrade(tradeId: string): Promise<boolean> {
  const [trade] = await db.select().from(trades).where(eq(trades.id, tradeId)).limit(1)
  if (!trade || trade.status !== 'PENDING') return false
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
