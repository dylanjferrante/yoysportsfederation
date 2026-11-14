import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { sessionFor } from '@/lib/mobileAuth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagueMessages, leagueMembers, users, teams, activity } from '@/db/schema'
import { eq, and, desc, isNull, gte, inArray } from 'drizzle-orm'
import { YSF_LEAGUES } from '@/lib/ysf'
import { nanoid } from 'nanoid'

// Recent messages for a league (newest last), enriched with author + franchise.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionFor(req)
  if (!session) return NextResponse.json({ messages: [] })
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const limit = Math.min(100, Number(searchParams.get('limit')) || 50)
  const matchupId = searchParams.get('matchupId')
  // A matchupId scopes the thread to that matchup's trash talk; otherwise this
  // is the league-wide board (messages with no matchup attached).
  const scope = matchupId
    ? eq(leagueMessages.matchupId, matchupId)
    : isNull(leagueMessages.matchupId)

  const rows = await db
    .select({ id: leagueMessages.id, body: leagueMessages.body, createdAt: leagueMessages.createdAt, userId: leagueMessages.userId, userName: users.name })
    .from(leagueMessages).leftJoin(users, eq(leagueMessages.userId, users.id))
    .where(and(eq(leagueMessages.leagueId, id), scope))
    .orderBy(desc(leagueMessages.createdAt)).limit(limit)

  const teamRows = await db.select({ name: teams.name, abbreviation: teams.abbreviation, userId: teams.userId }).from(teams).where(eq(teams.leagueId, id))
  const teamByUser = Object.fromEntries(teamRows.map(t => [t.userId, t]))

  const messages: any[] = rows.reverse().map(m => ({
    id: m.id, body: m.body, createdAt: m.createdAt, userId: m.userId,
    author: m.userName, team: teamByUser[m.userId ?? '']?.name ?? null,
    mine: m.userId === session.user.id,
  }))

  // the league board also carries the Federation's moves as they happen — completed and agreed
  // trades, waiver claims and free-agent signings — from the same activity log as Moves and the ticker
  if (!matchupId) {
    const since = messages[0]?.createdAt ?? new Date(Date.now() - 7 * 86_400_000).toISOString().replace('T', ' ').slice(0, 19)
    const acts = await db.select().from(activity)
      .where(and(eq(activity.leagueId, id), inArray(activity.type, ['TRADE', 'WAIVER', 'ROSTER']), gte(activity.createdAt, since)))
      .orderBy(activity.createdAt).limit(200)
    const clubName = Object.fromEntries((await db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.leagueId, id))).map(t => [t.id, t.name]))
    const code = (sp: string) => YSF_LEAGUES.find(l => l.sport === sp)?.code ?? sp
    const tradeGroups = new Map<string, { at: string; got: Map<string, string[]> }>()
    for (const a of acts) {
      let d: any = null; try { d = a.data ? JSON.parse(a.data) : null } catch { /* plain message */ }
      const at = a.createdAt ?? ''
      if (a.type === 'TRADE' && d?.kind === 'TRADED') {
        const g = tradeGroups.get(at.slice(0, 16)) ?? { at, got: new Map() }
        const what = d.player ? `${d.player} (${code(d.sport)}-${d.team || 'FA'}, ${d.pos})` : d.text ?? 'a pick'
        g.got.set(a.teamId ?? '', [...(g.got.get(a.teamId ?? '') ?? []), what])
        tradeGroups.set(at.slice(0, 16), g)
      } else if (a.type === 'TRADE' && /agreed to a trade/.test(a.message ?? '')) {
        messages.push({ id: `ev-${a.id}`, system: 'TRADE AGREED', body: a.message, createdAt: at, link: `/leagues/${id}/trade` })
      } else if (d?.kind === 'CLAIMED' || d?.kind === 'SIGNED') {
        const who = clubName[a.teamId ?? ''] ?? 'A club'
        messages.push({ id: `ev-${a.id}`, system: d.kind === 'CLAIMED' ? 'WAIVER CLAIM' : 'SIGNING', createdAt: at, link: `/leagues/${id}/transactions`,
          body: `${who} ${d.kind === 'CLAIMED' ? 'claimed' : 'signed'} ${d.player} (${code(d.sport)}-${d.team || 'FA'}, ${d.pos})${d.bid ? ` for $${d.bid}` : ''}` })
      }
    }
    for (const [k, g] of tradeGroups) messages.push({ id: `ev-trade-${k}`, system: 'TRADE', createdAt: g.at, link: `/leagues/${id}/trade`,
      body: [...g.got].map(([tid, items]) => `${clubName[tid] ?? 'A club'} gets ${items.join(', ')}`).join(' · ') })
    messages.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  }
  return NextResponse.json({ messages })
}

// Post a message (members only).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionFor(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { body, matchupId } = await req.json() as { body?: string; matchupId?: string }
  const text = (body ?? '').trim()
  if (!text) return NextResponse.json({ error: 'Empty message' }, { status: 400 })
  if (text.length > 1000) return NextResponse.json({ error: 'Too long' }, { status: 400 })

  const [member] = await db.select().from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, session.user.id))).limit(1)
  if (!member) return NextResponse.json({ error: 'Only league members can post' }, { status: 403 })

  await db.insert(leagueMessages).values({ id: nanoid(), leagueId: id, userId: session.user.id, body: text, matchupId: matchupId ?? null })
  return NextResponse.json({ ok: true }, { status: 201 })
}
