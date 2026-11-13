// Club invites: one-time links that hand a club's account to its real owner.
// Claiming sets the club's account email (and password, if they chose one) to the owner's; if that email
// already has an account, the club moves to it instead.
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/db'
import { sql } from 'drizzle-orm'

const DAYS = 14
export type Invite = { token: string; league_id: string; team_id: string; created_at: string; expires_at: string; used_at: string | null; used_by: string | null }

export function ensureInvites() {
  db.run(sql`CREATE TABLE IF NOT EXISTS club_invites (token TEXT PRIMARY KEY, league_id TEXT NOT NULL, team_id TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, used_by TEXT)`)
}

export function createInvite(leagueId: string, teamId: string, by: string): Invite {
  ensureInvites()
  // a new link replaces any unused one for the club
  db.run(sql`DELETE FROM club_invites WHERE team_id = ${teamId} AND used_at IS NULL`)
  const token = crypto.randomBytes(24).toString('base64url')
  const now = new Date(), exp = new Date(now.getTime() + DAYS * 86_400_000)
  db.run(sql`INSERT INTO club_invites (token, league_id, team_id, created_by, created_at, expires_at) VALUES (${token}, ${leagueId}, ${teamId}, ${by}, ${now.toISOString()}, ${exp.toISOString()})`)
  return { token, league_id: leagueId, team_id: teamId, created_at: now.toISOString(), expires_at: exp.toISOString(), used_at: null, used_by: null }
}

// a usable invite (exists, not used, not expired), with its club
export function openInvite(token: string | null | undefined) {
  if (!token) return null
  ensureInvites()
  const r = db.all<Invite & { team_name: string; logo: string | null; abbreviation: string; user_id: string | null }>(sql`SELECT i.*, t.name team_name, t.logo, t.abbreviation, t.user_id
    FROM club_invites i JOIN teams t ON t.id = i.team_id WHERE i.token = ${token}`)[0]
  if (!r || r.used_at || Date.parse(r.expires_at) < Date.now()) return null
  return r
}

// hand the club to this owner; returns the user id that now holds the club
export async function claimInvite(token: string, who: { email: string; name?: string | null; password?: string; signedInAs?: string | null }): Promise<string | null> {
  const inv = openInvite(token)
  if (!inv) return null
  const email = who.email.trim().toLowerCase()
  // Google/Apple sign-ins get an unguessable password, so the placeholder account's old one stops working
  const hash = await bcrypt.hash(who.password ?? crypto.randomBytes(24).toString('base64url'), 10)
  const existing = db.all<{ id: string }>(sql`SELECT id FROM users WHERE lower(email) = ${email}`)[0]
  let userId: string
  if (existing) {
    // the email already has an account: only its owner (a verified Google/Apple sign-in, or signed in to it)
    // can bring the club to it — a password claim can't take over someone else's account
    if (who.password && who.signedInAs !== existing.id) return null
    userId = existing.id
    db.run(sql`UPDATE teams SET user_id = ${userId} WHERE id = ${inv.team_id}`)
    db.run(sql`INSERT OR IGNORE INTO league_members (id, league_id, user_id, role) VALUES (${crypto.randomUUID()}, ${inv.league_id}, ${userId}, 'MEMBER')`)
  } else if (inv.user_id) {
    // the club's placeholder account becomes theirs
    userId = inv.user_id
    db.run(sql`UPDATE users SET email = ${email}, name = COALESCE(${who.name ?? null}, name), password = ${hash} WHERE id = ${userId}`)
  } else {
    userId = crypto.randomUUID()
    db.run(sql`INSERT INTO users (id, name, email, password) VALUES (${userId}, ${who.name ?? email}, ${email}, ${hash})`)
    db.run(sql`UPDATE teams SET user_id = ${userId} WHERE id = ${inv.team_id}`)
    db.run(sql`INSERT OR IGNORE INTO league_members (id, league_id, user_id, role) VALUES (${crypto.randomUUID()}, ${inv.league_id}, ${userId}, 'MEMBER')`)
  }
  db.run(sql`UPDATE club_invites SET used_at = ${new Date().toISOString()}, used_by = ${userId} WHERE token = ${token}`)
  return userId
}

export const emailTaken = (email: string) => !!db.all(sql`SELECT 1 FROM users WHERE lower(email) = ${email.trim().toLowerCase()}`).length
