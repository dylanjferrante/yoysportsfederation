// Commissioner warnings for rule violations found on the Compliance tab: notifies the club's owner(s)
// and records the warning (who, what, when) so the Commission can track the time to fix it.
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { notify, logActivity } from '@/lib/activity'
import { sendPush } from '@/lib/push'
import { ensureWarnings } from '@/lib/ysf-rules'


export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const lg = db.all<{ c: string }>(sql`SELECT commissioner_id c FROM leagues WHERE id = ${id}`)[0]
  if (!lg || lg.c !== session.user.id) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
  const b = await req.json() as { teamId: string; sport?: string; rule: string; detail?: string }
  const team = db.all<{ id: string; name: string; user_id: string | null }>(sql`SELECT id, name, user_id FROM teams WHERE id = ${b.teamId} AND league_id = ${id}`)[0]
  if (!team || !b.rule) return NextResponse.json({ error: 'Unknown club or rule' }, { status: 400 })
  ensureWarnings()
  const at = new Date().toISOString()
  db.run(sql`INSERT INTO ysf_warnings (team_id, sport, rule, detail, warned_at, warned_by) VALUES (${team.id}, ${b.sport ?? null}, ${b.rule}, ${b.detail ?? null}, ${at}, ${session.user.id})`)
  const managers = db.all<{ u: string }>(sql`SELECT user_id u FROM team_managers WHERE team_id = ${team.id}`).map(r => r.u)
  const to = [...new Set([team.user_id, ...managers].filter(Boolean) as string[])]
  const msg = `Commission warning: ${b.rule}${b.detail ? ` — ${b.detail}` : ''}`
  await notify(to, msg, `/leagues/${id}/myteam`, 'LEAGUE')
  await sendPush(to, 'Commission warning', msg, { type: 'LEAGUE', leagueId: id })
  await logActivity(id, 'COMMISH', `The Commission warned ${team.name}: ${b.rule}`, team.id)
  return NextResponse.json({ ok: true, warnedAt: at })
}
