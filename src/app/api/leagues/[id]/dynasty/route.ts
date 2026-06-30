import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, drafts, draftPicks, rosters, teams } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { logActivity } from '@/lib/activity'

// The initial (dynasty) draft for a league. Its settings lock once it's
// COMPLETED; the commissioner can reset it to re-open editing.
async function dynastyDraft(leagueId: string) {
  const [d] = await db.select().from(drafts)
    .where(and(eq(drafts.leagueId, leagueId), eq(drafts.kind, 'DYNASTY'))).limit(1)
  return d ?? null
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const d = await dynastyDraft(id)
  return NextResponse.json({ draft: d ? { id: d.id, status: d.status, type: d.type, rounds: d.rounds } : null })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (league.commissionerId !== session.user.id) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })

  const { action } = await req.json() as { action?: string }
  const d = await dynastyDraft(id)
  if (!d) return NextResponse.json({ error: 'No dynasty draft' }, { status: 400 })

  if (action === 'RESET') {
    // Reopen the draft: clear its picks and remove every drafted roster spot.
    await db.update(drafts).set({ status: 'PENDING', currentPick: 0 }).where(eq(drafts.id, d.id))
    await db.update(draftPicks).set({ isUsed: false, pickedPlayerId: null }).where(eq(draftPicks.draftId, d.id))
    const teamRows = await db.select({ id: teams.id }).from(teams).where(eq(teams.leagueId, id))
    const teamIds = teamRows.map(t => t.id)
    if (teamIds.length) {
      await db.delete(rosters).where(and(inArray(rosters.teamId, teamIds), eq(rosters.acquisitionType, 'DRAFT')))
    }
    await logActivity(id, 'DRAFT', 'Commissioner reset the dynasty draft')
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
