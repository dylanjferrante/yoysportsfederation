// Commissioner: each club's account status and its invite link.
//   GET  → clubs with owner email (claimed or not) and any open invite
//   POST { teamId } → a new one-time invite link for that club (replaces an unused one)
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { createInvite, ensureInvites } from '@/lib/invites'

async function commish(id: string) {
  const session = await getServerSession(authOptions)
  const lg = db.all<{ c: string }>(sql`SELECT commissioner_id c FROM leagues WHERE id = ${id}`)[0]
  return session && lg && lg.c === session.user.id ? session : null
}
const origin = (req: Request) => process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? new URL(req.url).origin

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(await commish(id))) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
  ensureInvites()
  const now = new Date().toISOString()
  const rows = db.all<any>(sql`SELECT t.id, t.name, t.abbreviation, t.logo, u.name owner, u.email,
      (SELECT token FROM club_invites i WHERE i.team_id = t.id AND i.used_at IS NULL AND i.expires_at > ${now} ORDER BY created_at DESC LIMIT 1) token,
      (SELECT expires_at FROM club_invites i WHERE i.team_id = t.id AND i.used_at IS NULL AND i.expires_at > ${now} ORDER BY created_at DESC LIMIT 1) expires
    FROM teams t LEFT JOIN users u ON u.id = t.user_id WHERE t.league_id = ${id} ORDER BY t.name`)
  return NextResponse.json(rows.map(r => ({ ...r, claimed: !!r.email && !String(r.email).endsWith('@ysf.local'), url: r.token ? `${origin(req)}/invite/${r.token}` : null, token: undefined })))
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const s = await commish(id)
  if (!s) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
  const { teamId } = await req.json() as { teamId: string }
  if (!db.all(sql`SELECT 1 FROM teams WHERE id = ${teamId} AND league_id = ${id}`).length) return NextResponse.json({ error: 'Unknown club' }, { status: 400 })
  const inv = createInvite(id, teamId, s.user.id)
  return NextResponse.json({ url: `${origin(req)}/invite/${inv.token}`, expires: inv.expires_at })
}
