import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, leagueMembers, users, proposals, proposalVotes } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { safeParse } from '@/lib/utils'
import { isCommissioner } from '@/lib/permissions'
import { logActivity, notify, logCommissionerAction } from '@/lib/activity'

type Settings = { policy: 'ANY' | 'COMMISH'; threshold: number; quorum: number; durationDays: number }
const defaults = (): Settings => ({ policy: 'ANY', threshold: 50, quorum: 0, durationDays: 3 })
const readSettings = (raw: string | null): Settings => ({ ...defaults(), ...safeParse<Partial<Settings>>(raw, {}) })

const isMember = async (leagueId: string, userId: string | null | undefined) => {
  if (!userId) return false
  const [m] = await db.select({ id: leagueMembers.id }).from(leagueMembers).where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId))).limit(1)
  return !!m
}

// Tally a proposal's votes and (if past its close time) resolve it to PASSED/FAILED.
function tally(votes: { vote: string }[]) {
  const yes = votes.filter(v => v.vote === 'YES').length
  const no = votes.filter(v => v.vote === 'NO').length
  const abstain = votes.filter(v => v.vote === 'ABSTAIN').length
  return { yes, no, abstain, ballots: yes + no + abstain }
}
function outcome(t: { yes: number; no: number; ballots: number }, threshold: number, quorum: number): 'PASSED' | 'FAILED' {
  if (t.ballots < quorum) return 'FAILED'
  const decisive = t.yes + t.no
  if (decisive === 0) return 'FAILED'
  return (t.yes / decisive) * 100 >= threshold ? 'PASSED' : 'FAILED'
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const settings = readSettings(league.proposalSettings)
  const rows = await db.select().from(proposals).where(eq(proposals.leagueId, id))
  const ids = rows.map(p => p.id)
  const votes = ids.length ? await db.select().from(proposalVotes).where(inArray(proposalVotes.proposalId, ids)) : []
  const votesByProp: Record<string, typeof votes> = {}
  for (const v of votes) (votesByProp[v.proposalId] ??= []).push(v)

  // Auto-resolve any open proposals whose voting window has closed.
  const nowIso = new Date().toISOString()
  for (const p of rows) {
    if (p.status === 'OPEN' && p.closesAt && p.closesAt <= nowIso) {
      const res = outcome(tally(votesByProp[p.id] ?? []), p.threshold ?? 50, p.quorum ?? 0)
      await db.update(proposals).set({ status: res, resolvedAt: nowIso }).where(eq(proposals.id, p.id))
      p.status = res; p.resolvedAt = nowIso
    }
  }

  const authorIds = [...new Set(rows.map(p => p.authorId))]
  const authors = authorIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, authorIds)) : []
  const nameOf = (uid: string) => authors.find(a => a.id === uid)?.name ?? 'A member'
  const members = await db.select({ id: leagueMembers.id }).from(leagueMembers).where(eq(leagueMembers.leagueId, id))

  const uid = session?.user?.id
  const list = rows
    .map(p => {
      const t = tally(votesByProp[p.id] ?? [])
      return {
        id: p.id, title: p.title, body: p.body, status: p.status, author: nameOf(p.authorId),
        threshold: p.threshold, quorum: p.quorum, closesAt: p.closesAt, resolvedAt: p.resolvedAt, createdAt: p.createdAt,
        ...t, myVote: (votesByProp[p.id] ?? []).find(v => v.userId === uid)?.vote ?? null,
      }
    })
    .sort((a, b) => (a.status === 'OPEN' ? 0 : 1) - (b.status === 'OPEN' ? 0 : 1) || String(b.createdAt).localeCompare(String(a.createdAt)))

  return NextResponse.json({
    settings, proposals: list, memberCount: members.length,
    isCommissioner: await isCommissioner(id, uid),
    canPropose: settings.policy === 'COMMISH' ? await isCommissioner(id, uid) : await isMember(id, uid),
    canVote: await isMember(id, uid),
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const uid = session.user.id
  const settings = readSettings(league.proposalSettings)
  const body = await req.json() as Record<string, any>

  switch (body.action) {
    case 'CREATE': {
      const allowed = settings.policy === 'COMMISH' ? await isCommissioner(id, uid) : await isMember(id, uid)
      if (!allowed) return NextResponse.json({ error: 'You are not allowed to create proposals in this league' }, { status: 403 })
      const title = String(body.title ?? '').trim().slice(0, 200)
      if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
      const closesAt = new Date(Date.now() + Math.max(1, settings.durationDays) * 86_400_000).toISOString()
      const pid = nanoid()
      await db.insert(proposals).values({ id: pid, leagueId: id, authorId: uid, title, body: String(body.body ?? '').slice(0, 10000), threshold: settings.threshold, quorum: settings.quorum, closesAt })
      await logActivity(id, 'PROPOSAL', `📋 New proposal up for a vote: “${title}”`)
      const members = await db.select({ userId: leagueMembers.userId }).from(leagueMembers).where(eq(leagueMembers.leagueId, id))
      await notify(members.map(m => m.userId).filter(u => u !== uid), `New proposal to vote on: “${title}”`, `/leagues/${id}/proposals`, 'LEAGUE')
      return NextResponse.json({ ok: true, id: pid })
    }

    case 'VOTE': {
      if (!(await isMember(id, uid))) return NextResponse.json({ error: 'Only league members can vote' }, { status: 403 })
      const vote = String(body.vote ?? '').toUpperCase()
      if (!['YES', 'NO', 'ABSTAIN'].includes(vote)) return NextResponse.json({ error: 'Invalid vote' }, { status: 400 })
      const [p] = await db.select().from(proposals).where(and(eq(proposals.id, body.proposalId), eq(proposals.leagueId, id))).limit(1)
      if (!p) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
      if (p.status !== 'OPEN') return NextResponse.json({ error: 'Voting on this proposal has closed' }, { status: 400 })
      const [existing] = await db.select({ id: proposalVotes.id }).from(proposalVotes).where(and(eq(proposalVotes.proposalId, p.id), eq(proposalVotes.userId, uid))).limit(1)
      if (existing) await db.update(proposalVotes).set({ vote }).where(eq(proposalVotes.id, existing.id))
      else await db.insert(proposalVotes).values({ id: nanoid(), proposalId: p.id, userId: uid, vote })
      return NextResponse.json({ ok: true })
    }

    case 'CLOSE': {
      if (!(await isCommissioner(id, uid))) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
      const [p] = await db.select().from(proposals).where(and(eq(proposals.id, body.proposalId), eq(proposals.leagueId, id))).limit(1)
      if (!p || p.status !== 'OPEN') return NextResponse.json({ error: 'Not an open proposal' }, { status: 400 })
      const votes = await db.select().from(proposalVotes).where(eq(proposalVotes.proposalId, p.id))
      const res = outcome(tally(votes), p.threshold ?? 50, p.quorum ?? 0)
      await db.update(proposals).set({ status: res, resolvedAt: new Date().toISOString() }).where(eq(proposals.id, p.id))
      await logCommissionerAction(id, uid, 'CLOSE_PROPOSAL', { proposalId: p.id, result: res })
      return NextResponse.json({ ok: true, result: res })
    }

    case 'SETTINGS': {
      if (!(await isCommissioner(id, uid))) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
      const next: Settings = {
        policy: body.policy === 'COMMISH' ? 'COMMISH' : 'ANY',
        threshold: Math.min(100, Math.max(1, Math.round(Number(body.threshold ?? 50)))),
        quorum: Math.max(0, Math.round(Number(body.quorum ?? 0))),
        durationDays: Math.max(1, Math.round(Number(body.durationDays ?? 3))),
      }
      await db.update(leagues).set({ proposalSettings: JSON.stringify(next) }).where(eq(leagues.id, id))
      await logCommissionerAction(id, uid, 'PROPOSAL_SETTINGS', next)
      return NextResponse.json({ ok: true, settings: next })
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
