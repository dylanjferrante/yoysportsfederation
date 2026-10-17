import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, teamRecords, matchups, users } from '@/db/schema'
import { eq, and, sql } from 'drizzle-orm'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const franchises = await db
    .select({ team: teams, user: { id: users.id, name: users.name, email: users.email } })
    .from(teams)
    .leftJoin(users, eq(teams.userId, users.id))
    .where(eq(teams.leagueId, id))

  const records = await db
    .select().from(teamRecords)
    .where(and(eq(teamRecords.leagueId, id), eq(teamRecords.season, league.season)))

  const currentMatchups = await db
    .select().from(matchups)
    .where(eq(matchups.leagueId, id))
    .limit(500)

  return NextResponse.json({ league, teams: franchises, records, matchups: currentMatchups })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (league.commissionerId !== session.user.id) return NextResponse.json({ error: 'Only the commissioner can delete this league' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { confirmName?: string; confirm?: boolean }
  if ((body.confirmName ?? '').trim() !== league.name) return NextResponse.json({ error: 'League name did not match' }, { status: 400 })
  if (body.confirm !== true) return NextResponse.json({ error: 'Confirmation required' }, { status: 400 })

  // Discover every table scoped to a league (those with a league_id column),
  // then delete this league's rows grandchildren-first. Table names come from
  // sqlite_master (schema, not user input), so raw interpolation is safe.
  // No PRAGMA foreign_keys toggle: libSQL/Turso don't hold a per-connection
  // pragma across requests, and the explicit ordering below needs none.
  const tableRows = await db.all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type='table'`)
  const tableNames = tableRows.map(t => t.name)
  const childDeletes: Array<[string, string, string]> = [
    ['trade_items', 'trade_id', 'trades'], ['trade_approvals', 'trade_id', 'trades'], ['trade_votes', 'trade_id', 'trades'],
    ['auction_budgets', 'draft_id', 'drafts'], ['draft_queues', 'draft_id', 'drafts'], ['draft_autopick', 'draft_id', 'drafts'],
    ['proposal_votes', 'proposal_id', 'proposals'],
  ]
  const leagueScoped: string[] = []
  for (const n of tableNames) {
    if (n === 'leagues') continue
    const cols = await db.all<{ name: string }>(sql.raw(`PRAGMA table_info("${n}")`))
    if (cols.some(c => c.name === 'league_id')) leagueScoped.push(n)
  }

  await db.transaction(async (tx) => {
    for (const [child, fk, parent] of childDeletes) {
      if (tableNames.includes(child)) {
        await tx.run(sql`DELETE FROM ${sql.identifier(child)} WHERE ${sql.identifier(fk)} IN (SELECT id FROM ${sql.identifier(parent)} WHERE league_id = ${id})`)
      }
    }
    for (const t of leagueScoped) {
      await tx.run(sql`DELETE FROM ${sql.identifier(t)} WHERE league_id = ${id}`)
    }
    await tx.run(sql`DELETE FROM leagues WHERE id = ${id}`)
  })

  return NextResponse.json({ ok: true })
}
