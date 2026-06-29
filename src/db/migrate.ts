/**
 * Run this once to (re)create all tables: npx tsx src/db/migrate.ts
 * This is a dev-only clean rebuild — it drops existing tables first.
 */
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_DIR = path.join(process.cwd(), 'data')
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })

const db = new Database(path.join(DB_DIR, 'nexus.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = OFF')

const drop = `
DROP TABLE IF EXISTS watchlist;
DROP TABLE IF EXISTS playoff_games;
DROP TABLE IF EXISTS league_messages;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS activity;
DROP TABLE IF EXISTS password_resets;
DROP TABLE IF EXISTS commissioner_actions;
DROP TABLE IF EXISTS waiver_claims;
DROP TABLE IF EXISTS trade_votes;
DROP TABLE IF EXISTS trade_approvals;
DROP TABLE IF EXISTS trade_items;
DROP TABLE IF EXISTS trades;
DROP TABLE IF EXISTS player_news;
DROP TABLE IF EXISTS player_game_stats;
DROP TABLE IF EXISTS matchups;
DROP TABLE IF EXISTS draft_queues;
DROP TABLE IF EXISTS draft_autopick;
DROP TABLE IF EXISTS auction_budgets;
DROP TABLE IF EXISTS draft_picks;
DROP TABLE IF EXISTS drafts;
DROP TABLE IF EXISTS draft_order;
DROP TABLE IF EXISTS rosters;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS league_history;
DROP TABLE IF EXISTS team_records;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS league_members;
DROP TABLE IF EXISTS leagues;
DROP TABLE IF EXISTS users;
`

const schema = `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  season TEXT NOT NULL,
  commissioner_id TEXT NOT NULL REFERENCES users(id),
  is_public INTEGER DEFAULT 0,
  invite_code TEXT UNIQUE,
  status TEXT DEFAULT 'SETUP',
  max_teams INTEGER DEFAULT 12,
  description TEXT,
  logo_url TEXT,
  division_logos TEXT DEFAULT '{}',
  sports_enabled TEXT DEFAULT '["NFL","NBA","NHL","MLB"]',
  season_start TEXT DEFAULT 'FOOTBALL',
  sport_schedule TEXT DEFAULT '[]',
  roster_settings TEXT DEFAULT '{}',
  scoring_settings TEXT DEFAULT '{}',
  draft_rounds TEXT DEFAULT '{}',
  federation_scoring TEXT DEFAULT '{}',
  draft_type TEXT DEFAULT 'SNAKE',
  draft_date TEXT,
  draft_status TEXT DEFAULT 'PENDING',
  auction_budget INTEGER DEFAULT 200,
  seconds_per_pick INTEGER DEFAULT 90,
  auto_pick_enabled INTEGER DEFAULT 1,
  rookie_draft_mode TEXT DEFAULT 'PER_SPORT',
  rookie_draft_rounds TEXT DEFAULT '{}',
  tradeable_pick_years INTEGER DEFAULT 3,
  draft_order_method TEXT DEFAULT 'REVERSE_STANDINGS',
  trade_deadline TEXT,
  trade_deadlines TEXT DEFAULT '{}',
  trade_review TEXT DEFAULT 'COMMISSIONER',
  trade_review_hours INTEGER DEFAULT 48,
  veto_votes_required INTEGER DEFAULT 4,
  waiver_type TEXT DEFAULT 'PRIORITY',
  faab_budget INTEGER DEFAULT 100,
  faab_mode TEXT DEFAULT 'TOTAL',
  waiver_day INTEGER DEFAULT 3,
  waiver_hour INTEGER DEFAULT 3,
  waiver_schedule TEXT DEFAULT '{}',
  ir_eligible_designations TEXT DEFAULT '{}',
  defense_mode TEXT DEFAULT 'TEAM',
  playoff_format TEXT DEFAULT 'H2H',
  weeks_per_round INTEGER DEFAULT 1,
  position_limits TEXT DEFAULT '{}',
  mlb_sp_cap INTEGER DEFAULT 0,
  rookie_draft_dates TEXT DEFAULT '{}',
  divisions INTEGER DEFAULT 0,
  sport_names TEXT DEFAULT '{}',
  championship_names TEXT DEFAULT '{}',
  championship_logos TEXT DEFAULT '{}',
  lock_day INTEGER DEFAULT 0,
  playoff_teams INTEGER DEFAULT 6,
  playoff_start_week INTEGER DEFAULT 15,
  regular_season_weeks TEXT DEFAULT '{}',
  playoff_rounds INTEGER DEFAULT 2,
  dues_amount INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE league_members (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT DEFAULT 'MEMBER',
  dues_paid INTEGER DEFAULT 0,
  dues_paid_at TEXT,
  joined_at TEXT DEFAULT (datetime('now')),
  UNIQUE(league_id, user_id)
);

CREATE TABLE password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  logo TEXT,
  alt_logo TEXT,
  wordmark TEXT,
  division INTEGER,
  primary_color TEXT DEFAULT '#0f172a',
  secondary_color TEXT DEFAULT '#3b82f6',
  user_id TEXT NOT NULL REFERENCES users(id),
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(league_id, user_id)
);

CREATE TABLE team_records (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  sport TEXT NOT NULL,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  ties INTEGER DEFAULT 0,
  points_for REAL DEFAULT 0,
  points_against REAL DEFAULT 0,
  finish_position INTEGER,
  is_champion INTEGER DEFAULT 0,
  faab_remaining INTEGER DEFAULT 100,
  waiver_priority INTEGER DEFAULT 1,
  UNIQUE(team_id, season, sport)
);

CREATE TABLE league_history (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  scope TEXT NOT NULL,
  champion_team_id TEXT REFERENCES teams(id),
  runner_up_team_id TEXT REFERENCES teams(id),
  note TEXT
);

CREATE TABLE players (
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
  is_rookie INTEGER DEFAULT 0,
  season_points REAL DEFAULT 0,
  weekly_avg REAL DEFAULT 0,
  projected_points REAL DEFAULT 0,
  stats TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE rosters (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  sport TEXT NOT NULL,
  slot TEXT NOT NULL,
  acquisition_type TEXT DEFAULT 'DRAFT',
  acquired_at TEXT DEFAULT (datetime('now')),
  UNIQUE(team_id, player_id)
);

CREATE TABLE drafts (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  scope TEXT NOT NULL,
  season TEXT NOT NULL,
  type TEXT DEFAULT 'SNAKE',
  rounds INTEGER DEFAULT 4,
  status TEXT DEFAULT 'PENDING',
  starts_at TEXT,
  current_pick INTEGER DEFAULT 0,
  pick_seconds INTEGER DEFAULT 90,
  pick_deadline TEXT,
  nom_player_id TEXT REFERENCES players(id),
  nom_team_id TEXT REFERENCES teams(id),
  nom_bid INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE auction_budgets (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  budget INTEGER DEFAULT 200,
  spent INTEGER DEFAULT 0,
  UNIQUE(draft_id, team_id)
);

CREATE TABLE draft_queues (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  position INTEGER NOT NULL,
  UNIQUE(draft_id, team_id, player_id)
);

CREATE TABLE draft_autopick (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  enabled INTEGER DEFAULT 0,
  UNIQUE(draft_id, team_id)
);

CREATE TABLE draft_picks (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  draft_id TEXT REFERENCES drafts(id),
  sport TEXT,
  round INTEGER NOT NULL,
  year INTEGER NOT NULL,
  original_team_id TEXT NOT NULL REFERENCES teams(id),
  current_team_id TEXT NOT NULL REFERENCES teams(id),
  is_used INTEGER DEFAULT 0,
  picked_player_id TEXT REFERENCES players(id),
  pick_number INTEGER
);

CREATE TABLE player_game_stats (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  week INTEGER NOT NULL,
  sport TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id),
  team_id TEXT REFERENCES teams(id),
  stats TEXT DEFAULT '{}',
  points REAL DEFAULT 0,
  UNIQUE(league_id, season, week, player_id)
);

CREATE TABLE player_news (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  headline TEXT NOT NULL,
  body TEXT,
  category TEXT DEFAULT 'NOTE',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE matchups (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  sport TEXT NOT NULL,
  season TEXT,
  week INTEGER NOT NULL,
  home_team_id TEXT NOT NULL REFERENCES teams(id),
  away_team_id TEXT REFERENCES teams(id),
  home_score REAL DEFAULT 0,
  away_score REAL DEFAULT 0,
  is_complete INTEGER DEFAULT 0,
  is_playoff INTEGER DEFAULT 0
);

CREATE TABLE trades (
  id TEXT PRIMARY KEY,
  league_id TEXT REFERENCES leagues(id),
  initiator_id TEXT NOT NULL REFERENCES teams(id),
  recipient_id TEXT REFERENCES teams(id),
  status TEXT DEFAULT 'PENDING',
  note TEXT,
  review_deadline TEXT,
  processed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE trade_items (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  from_team_id TEXT REFERENCES teams(id),
  to_team_id TEXT REFERENCES teams(id),
  direction TEXT,
  player_id TEXT REFERENCES players(id),
  pick_id TEXT REFERENCES draft_picks(id)
);

CREATE TABLE trade_approvals (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id),
  user_id TEXT REFERENCES users(id),
  status TEXT DEFAULT 'PENDING',
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(trade_id, team_id)
);

CREATE TABLE trade_votes (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  vote TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(trade_id, user_id)
);

CREATE TABLE waiver_claims (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  sport TEXT,
  add_player_id TEXT NOT NULL REFERENCES players(id),
  drop_player_id TEXT REFERENCES players(id),
  bid_amount INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 1,
  status TEXT DEFAULT 'PENDING',
  claimed_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT
);

CREATE TABLE activity (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  team_id TEXT REFERENCES teams(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  link TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE watchlist (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, player_id)
);

CREATE TABLE playoff_games (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  sport TEXT NOT NULL,
  round INTEGER NOT NULL,
  match_index INTEGER NOT NULL,
  home_seed INTEGER,
  away_seed INTEGER,
  home_team_id TEXT REFERENCES teams(id),
  away_team_id TEXT REFERENCES teams(id),
  home_score REAL DEFAULT 0,
  away_score REAL DEFAULT 0,
  winner_team_id TEXT REFERENCES teams(id),
  is_complete INTEGER DEFAULT 0
);

CREATE TABLE league_messages (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE commissioner_actions (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  details TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);
`

db.exec(drop)
db.exec(schema)
console.log('Database schema created successfully.')
db.close()
