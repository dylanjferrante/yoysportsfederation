/**
 * Make a one-time invite link for a club (by abbreviation) — for the first sign-in on a new server,
 * before anyone can use the commissioner page. Run on the server (Railway → Console):
 *   npx tsx scripts/make-invite.ts ACF
 */
import Database from 'better-sqlite3'
import crypto from 'crypto'
import path from 'path'

const abbr = (process.argv[2] ?? '').toUpperCase()
if (!abbr) { console.error('Usage: npx tsx scripts/make-invite.ts <CLUB ABBREVIATION>'); process.exit(1) }
const db = new Database(path.join(process.cwd(), 'data', 'nexus.db'))
db.exec(`CREATE TABLE IF NOT EXISTS club_invites (token TEXT PRIMARY KEY, league_id TEXT NOT NULL, team_id TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, used_by TEXT)`)
const team = db.prepare(`SELECT id, name, league_id FROM teams WHERE league_id = 'ysf' AND upper(abbreviation) = ?`).get(abbr) as { id: string; name: string; league_id: string } | undefined
if (!team) { console.error(`No ySF club ${abbr}`); process.exit(1) }
db.prepare(`DELETE FROM club_invites WHERE team_id = ? AND used_at IS NULL`).run(team.id)
const token = crypto.randomBytes(24).toString('base64url')
const now = new Date()
db.prepare(`INSERT INTO club_invites (token, league_id, team_id, created_by, created_at, expires_at) VALUES (?, ?, ?, 'console', ?, ?)`)
  .run(token, team.league_id, team.id, now.toISOString(), new Date(now.getTime() + 2 * 86_400_000).toISOString())
const base = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
console.log(`${team.name}: ${base}/invite/${token}  (one use, 48 hours)`)
