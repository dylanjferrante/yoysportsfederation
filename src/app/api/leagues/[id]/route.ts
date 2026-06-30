import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, teamRecords, matchups, users } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

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

  const sqlite = (db as unknown as { $client: { prepare: (s: string) => { all: (...a: unknown[]) => unknown[]; run: (...a: unknown[]) => unknown }; pragma: (s: string) => void; transaction: (fn: () => void) => () => void } }).$client

  const tableNames = (sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]).map(t => t.name)
  const childDeletes: Array<[string, string, string]> = [
    ['trade_items', 'trade_id', 'trades'], ['trade_approvals', 'trade_id', 'trades'], ['trade_votes', 'trade_id', 'trades'],
    ['auction_budgets', 'draft_id', 'drafts'], ['draft_queues', 'draft_id', 'drafts'], ['draft_autopick', 'draft_id', 'drafts'],
    ['proposal_votes', 'proposal_id', 'proposals'],
  ]
  const leagueScoped = tableNames.filter(n => n !== 'leagues' &&
    (sqlite.prepare(`PRAGMA table_info("${n}")`).all() as { name: string }[]).some(c => c.name === 'league_id'))

  sqlite.pragma('foreign_keys = OFF')
  try {
    const tx = sqlite.transaction(() => {
      for (const [child, fk, parent] of childDeletes) {
        if (tableNames.includes(child)) sqlite.prepare(`DELETE FROM "${child}" WHERE "${fk}" IN (SELECT id FROM "${parent}" WHERE league_id = ?)`).run(id)
      }
      for (const t of leagueScoped) sqlite.prepare(`DELETE FROM "${t}" WHERE league_id = ?`).run(id)
      sqlite.prepare(`DELETE FROM leagues WHERE id = ?`).run(id)
    })
    tx()
  } finally {
    sqlite.pragma('foreign_keys = ON')
  }

  return NextResponse.json({ ok: true })
}
