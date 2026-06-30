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
DROP TABLE IF EXISTS side_game_picks;
DROP TABLE IF EXISTS team_managers;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS league_members;
DROP TABLE IF EXISTS leagues;
DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS users;
`

const schema = `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  notify_prefs TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  abbreviation TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  season TEXT NOT NULL,
  commissioner_id TEXT NOT NULL REFERENCES users(id),
  is_public INTEGER DEFAULT 0,
  invite_code TEXT UNIQUE,
  status TEXT DEFAULT 'SETUP',
  max_teams INTEGER DEFAULT 12,
  description TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#0f172a',
  secondary_color TEXT DEFAULT '#3b82f6',
  championship_colors TEXT DEFAULT '{}',
  division_logos TEXT DEFAULT '{}',
  division_logo_bg TEXT DEFAULT '{}',
  sports_enabled TEXT DEFAULT '["NFL","NHL","NBA","MLB"]',
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
  trade_reopen TEXT DEFAULT '{}',
  trade_review TEXT DEFAULT 'COMMISSIONER',
  trade_review_hours INTEGER DEFAULT 48,
  veto_votes_required INTEGER DEFAULT 4,
  waiver_type TEXT DEFAULT 'PRIORITY',
  faab_budget INTEGER DEFAULT 100,
  faab_mode TEXT DEFAULT 'TOTAL',
  waiver_day INTEGER DEFAULT 3,
  waiver_hour INTEGER DEFAULT 3,
  waiver_schedule TEXT DEFAULT '{}',
  waiver_period_days INTEGER DEFAULT 2,
  transaction_limits TEXT DEFAULT '{}',
  ir_eligible_designations TEXT DEFAULT '{}',
  taxi_eligibility TEXT DEFAULT 'ALL',
  live_scoring INTEGER DEFAULT 0,
  defense_mode TEXT DEFAULT 'TEAM',
  playoff_format TEXT DEFAULT 'H2H',
  weeks_per_round INTEGER DEFAULT 1,
  position_limits TEXT DEFAULT '{}',
  mlb_sp_cap INTEGER DEFAULT 0,
  rookie_draft_dates TEXT DEFAULT '{}',
  divisions INTEGER DEFAULT 0,
  division_names TEXT DEFAULT '{}',
  sport_names TEXT DEFAULT '{}',
  sport_abbr TEXT DEFAULT '{}',
  championship_names TEXT DEFAULT '{}',
  championship_logos TEXT DEFAULT '{}',
  break_weeks TEXT DEFAULT '{}',
  lineup_locks TEXT DEFAULT '{}',
  lineup_cadence TEXT DEFAULT '{}',
  salary_cap_enabled INTEGER DEFAULT 0,
  salary_cap INTEGER DEFAULT 200,
  cap_mode TEXT DEFAULT 'TOTAL',
  side_games TEXT DEFAULT '{"highScore":true,"survivor":true,"pickem":true}',
  keeper_enabled INTEGER DEFAULT 0,
  keeper_count INTEGER DEFAULT 0,
  lock_day INTEGER DEFAULT 0,
  playoff_teams INTEGER DEFAULT 6,
  playoff_start_week INTEGER DEFAULT 15,
  regular_season_weeks TEXT DEFAULT '{}',
  playoff_rounds INTEGER DEFAULT 3,
  playoff_reseed INTEGER DEFAULT 0,
  playoff_tiebreaker TEXT DEFAULT 'POINTS_FOR',
  consolation_bracket INTEGER DEFAULT 0,
  consolation_teams INTEGER,
  losers_bracket INTEGER DEFAULT 0,
  losers_teams INTEGER,
  dues_amount INTEGER DEFAULT 0,
  rules TEXT,
  proposal_settings TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE proposals (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT,
  status TEXT DEFAULT 'OPEN',
  threshold INTEGER DEFAULT 50,
  quorum INTEGER DEFAULT 0,
  closes_at TEXT,
  resolved_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE proposal_votes (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  vote TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(proposal_id, user_id)
);

CREATE TABLE roster_snapshots (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  player_id TEXT,
  player_name TEXT,
  sport TEXT,
  position TEXT,
  slot TEXT
);

CREATE TABLE daily_lineups (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  sport TEXT NOT NULL,
  date TEXT NOT NULL,
  player_id TEXT NOT NULL,
  slot TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_lineup_uniq ON daily_lineups(team_id, season, sport, date, player_id);

CREATE TABLE team_season_branding (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  name TEXT,
  abbreviation TEXT,
  logo TEXT,
  alt_logo TEXT,
  wordmark TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  logo_bg INTEGER DEFAULT 0,
  UNIQUE(team_id, season)
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
  logo_bg INTEGER DEFAULT 0,
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
  adp REAL,
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
  salary INTEGER DEFAULT 0,
  contract_years INTEGER,
  on_block INTEGER DEFAULT 0,
  is_keeper INTEGER DEFAULT 0,
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
  manual_order TEXT,
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

CREATE TABLE api_usage (
  id TEXT PRIMARY KEY,
  year_month TEXT NOT NULL,
  count INTEGER DEFAULT 0
);

CREATE TABLE real_stat_lines (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  sport TEXT NOT NULL,
  season TEXT NOT NULL,
  week INTEGER NOT NULL,
  stats TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE game_schedule (
  id TEXT PRIMARY KEY,
  sport TEXT NOT NULL,
  game_date TEXT NOT NULL,
  home_abbr TEXT NOT NULL,
  away_abbr TEXT NOT NULL,
  game_time_epoch TEXT,
  status TEXT,
  season_type TEXT
);

CREATE TABLE waiver_wire (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  sport TEXT,
  dropped_by_team_id TEXT REFERENCES teams(id),
  clears_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
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
  bracket TEXT DEFAULT 'WINNERS',
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
  matchup_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE team_managers (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(team_id, user_id)
);

CREATE TABLE side_game_picks (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  sport TEXT NOT NULL,
  season TEXT NOT NULL,
  week INTEGER NOT NULL,
  matchup_id TEXT REFERENCES matchups(id) ON DELETE CASCADE,
  picked_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(league_id, user_id, game, sport, season, week, matchup_id)
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

// Drop every existing table first, so a forgotten DROP in the static list can
// never leave the database half-built ("table ... already exists").
const existing = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
for (const { name } of existing) db.exec(`DROP TABLE IF EXISTS "${name}";`)

db.exec(schema)

// Indexes on the hot query paths (scoring, standings, rosters, drafts, feeds).
// These matter at scale — without them these become full table scans. They carry
// over conceptually to Postgres (same columns).
const indexes = `
CREATE INDEX IF NOT EXISTS idx_rosters_team_sport ON rosters(team_id, sport);
CREATE INDEX IF NOT EXISTS idx_rosters_player ON rosters(player_id);
CREATE INDEX IF NOT EXISTS idx_matchups_league_season ON matchups(league_id, season);
CREATE INDEX IF NOT EXISTS idx_matchups_league_sport_week ON matchups(league_id, sport, week);
CREATE INDEX IF NOT EXISTS idx_team_records_league_season ON team_records(league_id, season);
CREATE INDEX IF NOT EXISTS idx_team_records_team ON team_records(team_id, season, sport);
CREATE INDEX IF NOT EXISTS idx_real_stats_lookup ON real_stat_lines(sport, season, week);
CREATE INDEX IF NOT EXISTS idx_real_stats_player ON real_stat_lines(player_id, sport, season, week);
CREATE INDEX IF NOT EXISTS idx_game_schedule_sport_date ON game_schedule(sport, game_date);
CREATE INDEX IF NOT EXISTS idx_roster_snapshots ON roster_snapshots(league_id, season, team_id);
CREATE INDEX IF NOT EXISTS idx_daily_lineups ON daily_lineups(league_id, team_id, sport, date);
CREATE INDEX IF NOT EXISTS idx_proposals_league ON proposals(league_id, status);
CREATE INDEX IF NOT EXISTS idx_proposal_votes_proposal ON proposal_votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_players_sport ON players(sport);
CREATE INDEX IF NOT EXISTS idx_players_external ON players(external_id);
CREATE INDEX IF NOT EXISTS idx_player_game_stats_week ON player_game_stats(league_id, season, week, sport);
CREATE INDEX IF NOT EXISTS idx_draft_picks_draft ON draft_picks(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_team ON draft_picks(current_team_id);
CREATE INDEX IF NOT EXISTS idx_draft_queues_draft_team ON draft_queues(draft_id, team_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_league ON activity(league_id, created_at);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);
`
db.exec(indexes)
console.log('Database schema created successfully.')
db.close()
