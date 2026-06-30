import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/db'
import { users, teams, leagues } from '@/db/schema'
import { eq, inArray, or } from 'drizzle-orm'
import { signMobileToken } from '@/lib/mobileAuth'

// Native-app login: verify credentials and return a Bearer token + the user's
// leagues (with their team in each). The token goes in SecureStore on the device
// and authorizes the other /api/mobile/* endpoints.
export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({})) as { email?: string; password?: string }
  if (!email || !password) return NextResponse.json({ error: 'Email and password required' }, { status: 400 })

  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1)
  if (!user || !(await bcrypt.compare(password, user.password))) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })

  // Leagues the user belongs to (has a team in) or commissions.
  const myTeams = await db.select({ id: teams.id, leagueId: teams.leagueId, name: teams.name }).from(teams).where(eq(teams.userId, user.id))
  const leagueIds = [...new Set(myTeams.map(t => t.leagueId))]
  const lgRows = await db.select({ id: leagues.id, name: leagues.name, season: leagues.season, commissionerId: leagues.commissionerId })
    .from(leagues).where(leagueIds.length ? or(inArray(leagues.id, leagueIds), eq(leagues.commissionerId, user.id)) : eq(leagues.commissionerId, user.id))

  const teamByLeague = Object.fromEntries(myTeams.map(t => [t.leagueId, { id: t.id, name: t.name }]))
  const userLeagues = lgRows.map(l => ({ id: l.id, name: l.name, season: l.season, isCommissioner: l.commissionerId === user.id, team: teamByLeague[l.id] ?? null }))

  const token = signMobileToken({ uid: user.id })
  return NextResponse.json({ token, user: { id: user.id, name: user.name, email: user.email }, leagues: userLeagues })
}
