import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, matchups } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

// Commissioner editing of regular-season matchups: set pairings, override
// scores/results, or copy one sport's weekly pairings onto every other sport
// active that week (the shared cross-sport pairing).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (league.commissionerId !== session.user.id) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })

  const body = await req.json()

  // Update one matchup's pairing and/or score/result.
  if (body.action === 'UPDATE' && body.matchupId) {
    const patch: Record<string, unknown> = {}
    if ('homeTeamId' in body) patch.homeTeamId = body.homeTeamId
    if ('awayTeamId' in body) patch.awayTeamId = body.awayTeamId || null
    if ('homeScore' in body) patch.homeScore = body.homeScore
    if ('awayScore' in body) patch.awayScore = body.awayScore
    if ('isComplete' in body) patch.isComplete = !!body.isComplete
    if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    await db.update(matchups).set(patch).where(and(eq(matchups.id, body.matchupId), eq(matchups.leagueId, id)))
    return NextResponse.json({ ok: true })
  }

  // Copy a week's pairings from one sport onto all other sports active that week,
  // so the same two franchises meet in every sport (shared pairing).
  if (body.action === 'COPY_WEEK_PAIRINGS' && body.week && body.fromSport) {
    const all = await db.select().from(matchups)
      .where(and(eq(matchups.leagueId, id), eq(matchups.season, league.season), eq(matchups.week, body.week)))
    const source = all.filter(m => m.sport === body.fromSport).sort((a, b) => a.id.localeCompare(b.id))
    const sports = [...new Set(all.map(m => m.sport))].filter(s => s !== body.fromSport)
    for (const sport of sports) {
      const targets = all.filter(m => m.sport === sport && !m.isComplete).sort((a, b) => a.id.localeCompare(b.id))
      for (let i = 0; i < targets.length && i < source.length; i++) {
        await db.update(matchups).set({ homeTeamId: source[i].homeTeamId, awayTeamId: source[i].awayTeamId })
          .where(eq(matchups.id, targets[i].id))
      }
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
