// An owner claiming their club from an invite link.
//   PUT  → remember the invite (httpOnly cookie) before signing in with Google or Apple
//   POST { name, email, password } → claim with an email and password
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import { claimInvite, openInvite, emailTaken } from '@/lib/invites'

export async function PUT(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!openInvite(token)) return NextResponse.json({ error: 'This invite link has expired or was already used' }, { status: 410 })
  const res = NextResponse.json({ ok: true })
  res.cookies.set('ysf_invite', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 30 * 60 })
  return res
}

const body = z.object({ name: z.string().trim().min(2).max(60), email: z.string().trim().email(), password: z.string().min(8).max(200) })

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!openInvite(token)) return NextResponse.json({ error: 'This invite link has expired or was already used' }, { status: 410 })
  const p = body.safeParse(await req.json().catch(() => ({})))
  if (!p.success) return NextResponse.json({ error: 'Enter your name, a valid email and a password of at least 8 characters' }, { status: 400 })
  const session = await getServerSession(authOptions)
  if (emailTaken(p.data.email) && !session) return NextResponse.json({ error: 'That email already has an account — sign in first, then open this link again' }, { status: 409 })
  const id = await claimInvite(token, { ...p.data, signedInAs: session?.user?.id ?? null })
  if (!id) return NextResponse.json({ error: 'That email belongs to a different account' }, { status: 409 })
  return NextResponse.json({ ok: true, email: p.data.email.toLowerCase() })
}
