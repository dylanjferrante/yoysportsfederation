import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import {
  teams, leagues, users, teamRecords, rosters, draftPicks, matchups, trades, tradeItems,
  tradeApprovals, waiverClaims, playoffGames, leagueHistory, activity, leagueMembers,
  auctionBudgets, draftQueues, draftAutopick, playerGameStats,
} from '@/db/schema'
import { eq, and, or, ne, sql } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1).max(60).optional(),
  abbreviation: z.string().min(1).max(4).optional(),
  logo: z.string().max(2000).optional(),
  altLogo: z.string().max(2000).optional(),
  wordmark: z.string().max(2000).optional(),
  primaryColor: z.string().max(20).optional(),
  secondaryColor: z.string().max(20).optional(),
  logoBg: z.boolean().optional(),
  division: z.number().int().min(0).max(8).nullable().optional(),
  // Commissioner-only owner edits.
  ownerName: z.string().min(1).max(80).optional(),
  ownerEmail: z.string().email().max(160).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1)
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [league] = await db.select().from(leagues).where(eq(leagues.id, team.leagueId)).limit(1)
  if (team.userId !== session.user.id && league?.commissionerId !== session.user.id)
    return NextResponse.json({ error: 'Not your franchise' }, { status: 403 })

  const isCommish = league?.commissionerId === session.user.id

  try {
    const { ownerName, ownerEmail, ...teamFields } = schema.parse(await req.json())

    // Owner identity can only be changed by the commissioner.
    if ((ownerName !== undefined || ownerEmail !== undefined)) {
      if (!isCommish) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
      if (ownerEmail !== undefined) {
        const [clash] = await db.select({ id: users.id }).from(users)
          .where(and(eq(users.email, ownerEmail), ne(users.id, team.userId))).limit(1)
        if (clash) return NextResponse.json({ error: 'That email is already in use' }, { status: 409 })
      }
      const userPatch: Record<string, string> = {}
      if (ownerName !== undefined) userPatch.name = ownerName
      if (ownerEmail !== undefined) userPatch.email = ownerEmail
      if (Object.keys(userPatch).length) await db.update(users).set(userPatch).where(eq(users.id, team.userId))
    }

    let updated = team
    if (Object.keys(teamFields).length) {
      ;[updated] = await db.update(teams).set(teamFields).where(eq(teams.id, id)).returning()
    }
    return NextResponse.json(updated)
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// Commissioner removes a franchise from the league, cleaning up all references.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1)
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [league] = await db.select().from(leagues).where(eq(leagues.id, team.leagueId)).limit(1)
  if (league?.commissionerId !== session.user.id) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
  if (team.userId === league.commissionerId)
    return NextResponse.json({ error: "Can't remove the commissioner's own franchise" }, { status: 400 })

  // FK is enforced app-wide; turn it off briefly so we can delete the franchise
  // and every row that references it without ordering headaches.
  db.run(sql`PRAGMA foreign_keys = OFF`)
  try {
    await db.delete(tradeItems).where(or(eq(tradeItems.fromTeamId, id), eq(tradeItems.toTeamId, id)))
    await db.delete(tradeApprovals).where(eq(tradeApprovals.teamId, id))
    await db.delete(trades).where(or(eq(trades.initiatorId, id), eq(trades.recipientId, id)))
    await db.delete(draftPicks).where(or(eq(draftPicks.originalTeamId, id), eq(draftPicks.currentTeamId, id)))
    await db.delete(matchups).where(or(eq(matchups.homeTeamId, id), eq(matchups.awayTeamId, id)))
    await db.delete(playoffGames).where(or(eq(playoffGames.homeTeamId, id), eq(playoffGames.awayTeamId, id), eq(playoffGames.winnerTeamId, id)))
    await db.delete(waiverClaims).where(eq(waiverClaims.teamId, id))
    await db.delete(auctionBudgets).where(eq(auctionBudgets.teamId, id))
    await db.delete(draftQueues).where(eq(draftQueues.teamId, id))
    await db.delete(draftAutopick).where(eq(draftAutopick.teamId, id))
    await db.delete(playerGameStats).where(eq(playerGameStats.teamId, id))
    await db.delete(teamRecords).where(eq(teamRecords.teamId, id))
    await db.delete(rosters).where(eq(rosters.teamId, id))
    await db.update(leagueHistory).set({ championTeamId: null }).where(eq(leagueHistory.championTeamId, id))
    await db.update(leagueHistory).set({ runnerUpTeamId: null }).where(eq(leagueHistory.runnerUpTeamId, id))
    await db.update(activity).set({ teamId: null }).where(eq(activity.teamId, id))
    await db.delete(leagueMembers).where(and(eq(leagueMembers.leagueId, team.leagueId), eq(leagueMembers.userId, team.userId)))
    await db.delete(teams).where(eq(teams.id, id))
  } finally {
    db.run(sql`PRAGMA foreign_keys = ON`)
  }

  return NextResponse.json({ ok: true })
}
