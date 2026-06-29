import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { teams, users } from '@/db/schema'
import { eq } from 'drizzle-orm'

// Franchises in a league — used by the trade builder's partner picker.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const leagueId = searchParams.get('leagueId')
  if (!leagueId) return NextResponse.json({ error: 'leagueId required' }, { status: 400 })

  const rows = await db
    .select({
      id: teams.id, name: teams.name, abbreviation: teams.abbreviation, logo: teams.logo,
      userId: teams.userId, ownerName: users.name,
    })
    .from(teams)
    .leftJoin(users, eq(teams.userId, users.id))
    .where(eq(teams.leagueId, leagueId))

  return NextResponse.json(rows)
}
