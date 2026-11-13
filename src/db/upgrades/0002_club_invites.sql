-- One-time invite links: the commissioner creates one per club; the owner opens it and signs in with
-- Google, Apple or an email and password, which becomes that club's account.
CREATE TABLE IF NOT EXISTS club_invites (
  token TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by TEXT
);
CREATE INDEX IF NOT EXISTS club_invites_team ON club_invites (team_id);
