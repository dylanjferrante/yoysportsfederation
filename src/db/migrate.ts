/**
 * Run this once to create all tables: npx tsx src/db/migrate.ts
 */
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_DIR = path.join(process.cwd(), 'data')
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })

const db = new Database(path.join(DB_DIR, 'nexus.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  season TEXT NOT NULL,
  commissioner_id TEXT NOT NULL REFERENCES users(id),
  is_public INTEGER DEFAULT 0,
  invite_code TEXT UNIQUE,
  status TEXT DEFAULT 'SETUP',
  max_teams INTEGER DEFAULT 12,
  description TEXT,
  roster_settings TEXT DEFAULT '{}',
  scoring_settings TEXT DEFAULT '{}',
  draft_type TEXT DEFAULT 'SNAKE',
  draft_date TEXT,
  draft_status TEXT DEFAULT 'PENDING',
  auction_budget INTEGER DEFAULT 200,
  seconds_per_pick INTEGER DEFAULT 90,
  auto_pick_enabled INTEGER DEFAULT 1,
  trade_deadline TEXT,
  trade_review TEXT DEFAULT 'COMMISSIONER',
  trade_review_hours INTEGER DEFAULT 48,
  veto_votes_required INTEGER DEFAULT 4,
  waiver_type TEXT DEFAULT 'PRIORITY',
  faab_budget INTEGER DEFAULT 100,
  waiver_day INTEGER DEFAULT 3,
  waiver_hour INTEGER DEFAULT 3,
  lock_day INTEGER DEFAULT 0,
  playoff_teams INTEGER DEFAULT 4,
  playoff_start_week INTEGER DEFAULT 15,
  regular_season_weeks INTEGER DEFAULT 14,
  playoff_rounds INTEGER DEFAULT 2,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS league_members (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT DEFAULT 'MEMBER',
  joined_at TEXT DEFAULT (datetime('now')),
  UNIQUE(league_id, user_id)
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  logo TEXT,
  user_id TEXT NOT NULL REFERENCES users(id),
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  ties INTEGER DEFAULT 0,
  points_for REAL DEFAULT 0,
  points_against REAL DEFAULT 0,
  faab_remaining INTEGER DEFAULT 100,
  waiver_priority INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  external_id TEXT,
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  position TEXT NOT NULL,
  eligible_positions TEXT DEFAULT '[]',
  real_team TEXT NOT NULL,
  real_team_abbr TEXT,
  status TEXT DEFAULT 'ACTIVE',
  injury_note TEXT,
  bye_week INTEGER,
  photo_url TEXT,
  season_points REAL DEFAULT 0,
  weekly_avg REAL DEFAULT 0,
  projected_points REAL DEFAULT 0,
  stats TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rosters (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  slot TEXT NOT NULL,
  acquisition_type TEXT DEFAULT 'DRAFT',
  acquired_at TEXT DEFAULT (datetime('now')),
  UNIQUE(team_id, player_id)
);

CREATE TABLE IF NOT EXISTS draft_picks (
  id TEXT PRIMARY KEY,
  sport TEXT NOT NULL,
  round INTEGER NOT NULL,
  year INTEGER NOT NULL,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  original_team_id TEXT NOT NULL REFERENCES teams(id),
  current_team_id TEXT NOT NULL REFERENCES teams(id),
  is_used INTEGER DEFAULT 0,
  picked_player_id TEXT REFERENCES players(id),
  pick_number INTEGER
);

CREATE TABLE IF NOT EXISTS draft_order (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS matchups (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  week INTEGER NOT NULL,
  home_team_id TEXT NOT NULL REFERENCES teams(id),
  away_team_id TEXT REFERENCES teams(id),
  home_score REAL DEFAULT 0,
  away_score REAL DEFAULT 0,
  is_complete INTEGER DEFAULT 0,
  is_playoff INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  initiator_id TEXT NOT NULL REFERENCES teams(id),
  recipient_id TEXT NOT NULL REFERENCES teams(id),
  status TEXT DEFAULT 'PENDING',
  note TEXT,
  review_deadline TEXT,
  processed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trade_items (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  player_id TEXT REFERENCES players(id),
  pick_id TEXT REFERENCES draft_picks(id)
);

CREATE TABLE IF NOT EXISTS trade_votes (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  vote TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(trade_id, user_id)
);

CREATE TABLE IF NOT EXISTS waiver_claims (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  add_player_id TEXT NOT NULL REFERENCES players(id),
  drop_player_id TEXT REFERENCES players(id),
  bid_amount INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 1,
  status TEXT DEFAULT 'PENDING',
  claimed_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS commissioner_actions (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  details TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);
`

db.exec(schema)
console.log('Database schema created successfully.')
db.close()
