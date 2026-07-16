import { NextResponse } from 'next/server'
import { db } from '@/db'
import { leagues, playoffGames, leagueHistory } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { advanceLeague } from '@/lib/advance'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await advanceLeague(league)
  const games = await db.select().from(playoffGames).where(and(eq(playoffGames.leagueId, id), eq(playoffGames.season, league.season)))
  const champions = await db.select().from(leagueHistory).where(and(eq(leagueHistory.leagueId, id), eq(leagueHistory.season, league.season)))
  return NextResponse.json({ games, champions })
}
