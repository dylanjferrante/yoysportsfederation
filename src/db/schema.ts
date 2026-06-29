import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ── Users ──────────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  notifyPrefs: text('notify_prefs'), // JSON: per-channel + per-event notification preferences
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// Web-push endpoints registered by a user's browser (push notification framework).
export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// ── Leagues (one unified cross-sport federation) ────────────────────────────

export const leagues = sqliteTable('leagues', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  season: text('season').notNull(),
  commissionerId: text('commissioner_id').notNull().references(() => users.id),
  isPublic: integer('is_public', { mode: 'boolean' }).default(false),
  inviteCode: text('invite_code').unique(),
  status: text('status').default('SETUP'), // SETUP | DRAFTING | ACTIVE | PLAYOFFS | COMPLETED
  maxTeams: integer('max_teams').default(12),
  description: text('description'),

  // Branding
  logoUrl: text('logo_url'),
  divisionLogos: text('division_logos').default('{}'), // JSON: { NFL: url, ... }

  // Which sports the federation plays + the season calendar
  sportsEnabled: text('sports_enabled').default('["NFL","NBA","NHL","MLB"]'), // JSON array
  seasonStart: text('season_start').default('FOOTBALL'), // FOOTBALL | WINTER | BASEBALL
  sportSchedule: text('sport_schedule').default('[]'),   // JSON: [{sport,label,startWeek,endWeek}]

  // Per-sport settings (JSON maps keyed by sport)
  rosterSettings: text('roster_settings').default('{}'),   // { NFL: { QB:1, ... }, ... }
  scoringSettings: text('scoring_settings').default('{}'), // { NFL: { passingYards:0.04, ... }, ... }
  draftRounds: text('draft_rounds').default('{}'),         // { NFL:15, NBA:13, ... } (dynasty size)

  // Federation scoring (placement points per sport finish + bonuses)
  federationScoring: text('federation_scoring').default('{}'), // { placement:[...], championBonus, regularSeasonBonus, includedSports }

  // Draft
  draftType: text('draft_type').default('SNAKE'),       // SNAKE | AUCTION | LINEAR
  draftDate: text('draft_date'),
  draftStatus: text('draft_status').default('PENDING'), // PENDING | IN_PROGRESS | COMPLETED
  auctionBudget: integer('auction_budget').default(200),
  secondsPerPick: integer('seconds_per_pick').default(90),
  autoPickEnabled: integer('auto_pick_enabled', { mode: 'boolean' }).default(true),
  rookieDraftMode: text('rookie_draft_mode').default('PER_SPORT'), // COMBINED | PER_SPORT
  rookieDraftRounds: text('rookie_draft_rounds').default('{}'),    // per-sport JSON map { NFL: 4, ... }
  tradeablePickYears: integer('tradeable_pick_years').default(3),
  draftOrderMethod: text('draft_order_method').default('REVERSE_STANDINGS'), // REVERSE_STANDINGS | RANDOM | MANUAL

  // Trades
  tradeDeadline: text('trade_deadline'),
  // Per-sport deadline: { [sport]: { mode, week? } } where mode is
  // WEEK | SPORT_PLAYOFFS | SPORT_CHAMPIONSHIP | FEDERATION_CHAMPIONSHIP | NONE
  tradeDeadlines: text('trade_deadlines').default('{}'),
  tradeReview: text('trade_review').default('COMMISSIONER'), // NONE | COMMISSIONER | LEAGUE_VOTE
  tradeReviewHours: integer('trade_review_hours').default(48),
  vetoVotesRequired: integer('veto_votes_required').default(4),

  // Waivers
  waiverType: text('waiver_type').default('PRIORITY'), // PRIORITY | FAAB | FREE_AGENT
  faabBudget: integer('faab_budget').default(100),
  faabMode: text('faab_mode').default('TOTAL'), // TOTAL | PER_SPORT
  waiverDay: integer('waiver_day').default(3),
  waiverHour: integer('waiver_hour').default(3),
  // Per-sport waiver run time: { [sport]: { day: 0-6 (Sun-Sat), hour: 0-23 } }
  waiverSchedule: text('waiver_schedule').default('{}'),
  irEligibleDesignations: text('ir_eligible_designations').default('{}'),
  defenseMode: text('defense_mode').default('TEAM'), // NFL: TEAM (DST) | IDP
  playoffFormat: text('playoff_format').default('H2H'), // H2H | MULTI_WEEK | CHAMP_MULTI
  weeksPerRound: integer('weeks_per_round').default(1),
  positionLimits: text('position_limits').default('{}'), // per-sport {pos:{maxStarters?,maxRostered?}}
  mlbSpCap: integer('mlb_sp_cap').default(0), // max starting pitchers counted per week (0 = unlimited)
  rookieDraftDates: text('rookie_draft_dates').default('{}'), // per-scope rookie draft datetimes
  divisions: integer('divisions').default(0), // number of divisions (0 = none)
  sportNames: text('sport_names').default('{}'), // per-league custom sport labels
  championshipNames: text('championship_names').default('{}'), // per-sport championship names
  championshipLogos: text('championship_logos').default('{}'), // per-sport trophy/logo URLs
  breakWeeks: text('break_weeks').default('{}'), // per-sport bye/break weeks (all-star, Olympics): { sport: number[] }
  lineupLocks: text('lineup_locks').default('{}'), // per-sport lineup lock { sport: { day, hour } }
  salaryCapEnabled: integer('salary_cap_enabled', { mode: 'boolean' }).default(false),
  salaryCap: integer('salary_cap').default(200),
  capMode: text('cap_mode').default('TOTAL'), // TOTAL (one cross-sport cap) | PER_SPORT
  keeperEnabled: integer('keeper_enabled', { mode: 'boolean' }).default(false),
  keeperCount: integer('keeper_count').default(0),
  lockDay: integer('lock_day').default(0),

  // Playoffs
  playoffTeams: integer('playoff_teams').default(6),
  playoffStartWeek: integer('playoff_start_week').default(15),
  regularSeasonWeeks: text('regular_season_weeks').default('{}'), // per-sport JSON map { NFL: 14, ... }
  playoffRounds: integer('playoff_rounds').default(2),

  // Dues
  duesAmount: integer('dues_amount').default(0), // per-franchise buy-in

  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// ── League Members ─────────────────────────────────────────────────────────

export const leagueMembers = sqliteTable('league_members', {
  id: text('id').primaryKey(),
  leagueId: text('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
  role: text('role').default('MEMBER'), // COMMISSIONER | CO_COMMISSIONER | MEMBER
  duesPaid: integer('dues_paid', { mode: 'boolean' }).default(false),
  duesPaidAt: text('dues_paid_at'),
  joinedAt: text('joined_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniq: uniqueIndex('league_member_uniq').on(t.leagueId, t.userId),
}))

// ── Password Resets ──────────────────────────────────────────────────────────

export const passwordResets = sqliteTable('password_resets', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// ── Teams (a franchise — one per user per league, spans all sports) ──────────

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  abbreviation: text('abbreviation').notNull(),
  logo: text('logo'),
  altLogo: text('alt_logo'),
  wordmark: text('wordmark'),
  division: integer('division'), // 1-based division index (null = unassigned)
  primaryColor: text('primary_color').default('#0f172a'),
  secondaryColor: text('secondary_color').default('#3b82f6'),
  userId: text('user_id').notNull().references(() => users.id),
  leagueId: text('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniq: uniqueIndex('team_user_league_uniq').on(t.leagueId, t.userId),
}))

// ── Team Records (per-franchise, per-sport, per-season standings) ────────────

export const teamRecords = sqliteTable('team_records', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  leagueId: text('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  season: text('season').notNull(),
  sport: text('sport').notNull(),
  wins: integer('wins').default(0),
  losses: integer('losses').default(0),
  ties: integer('ties').default(0),
  pointsFor: real('points_for').default(0),
  pointsAgainst: real('points_against').default(0),
  finishPosition: integer('finish_position'), // final/current rank within the sport
  isChampion: integer('is_champion', { mode: 'boolean' }).default(false),
  faabRemaining: integer('faab_remaining').default(100),
  waiverPriority: integer('waiver_priority').default(1),
}, (t) => ({
  uniq: uniqueIndex('team_record_uniq').on(t.teamId, t.season, t.sport),
}))

// ── League History (completed-season champions for the all-time section) ────

export const leagueHistory = sqliteTable('league_history', {
  id: text('id').primaryKey(),
  leagueId: text('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  season: text('season').notNull(),
  scope: text('scope').notNull(), // NFL | NBA | NHL | MLB | OVERALL
  championTeamId: text('champion_team_id').references(() => teams.id),
  runnerUpTeamId: text('runner_up_team_id').references(() => teams.id),
  note: text('note'),
})

// ── Players ────────────────────────────────────────────────────────────────

export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  externalId: text('external_id'),
  name: text('name').notNull(),
  sport: text('sport').notNull(),
  position: text('position').notNull(),
  eligiblePositions: text('eligible_positions').default('[]'),
  realTeam: text('real_team').notNull(),
  realTeamAbbr: text('real_team_abbr'),
  status: text('status').default('ACTIVE'),
  injuryNote: text('injury_note'),
  byeWeek: integer('bye_week'),
  photoUrl: text('photo_url'),
  isRookie: integer('is_rookie', { mode: 'boolean' }).default(false),
  seasonPoints: real('season_points').default(0),
  weeklyAvg: real('weekly_avg').default(0),
  projectedPoints: real('projected_points').default(0),
  adp: real('adp'), // average draft position / consensus rank within sport
  stats: text('stats').default('{}'),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// ── Rosters ────────────────────────────────────────────────────────────────

export const rosters = sqliteTable('rosters', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  playerId: text('player_id').notNull().references(() => players.id),
  sport: text('sport').notNull(), // denormalized from player for fast per-sport grouping
  slot: text('slot').notNull(),
  acquisitionType: text('acquisition_type').default('DRAFT'),
  salary: integer('salary').default(0),          // contract salary (cap leagues)
  contractYears: integer('contract_years'),       // remaining contract years
  onBlock: integer('on_block', { mode: 'boolean' }).default(false), // trade block
  isKeeper: integer('is_keeper', { mode: 'boolean' }).default(false), // designated keeper for next season
  acquiredAt: text('acquired_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniq: uniqueIndex('roster_uniq').on(t.teamId, t.playerId),
}))

// ── Co-managers (additional owners who can manage a franchise) ───────────────

export const teamManagers = sqliteTable('team_managers', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniq: uniqueIndex('team_manager_uniq').on(t.teamId, t.userId),
}))

// Side games — survivor & weekly pick'em pools. One row per pick.
export const sideGamePicks = sqliteTable('side_game_picks', {
  id: text('id').primaryKey(),
  leagueId: text('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  game: text('game').notNull(),   // SURVIVOR | PICKEM
  sport: text('sport').notNull(),
  season: text('season').notNull(),
  week: integer('week').notNull(),
  matchupId: text('matchup_id').references(() => matchups.id, { onDelete: 'cascade' }),
  pickedTeamId: text('picked_team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniq: uniqueIndex('side_pick_uniq').on(t.leagueId, t.userId, t.game, t.sport, t.season, t.week, t.matchupId),
}))

// ── Drafts ─────────────────────────────────────────────────────────────────

export const drafts = sqliteTable('drafts', {
  id: text('id').primaryKey(),
  leagueId: text('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),   // DYNASTY | ROOKIE
  scope: text('scope').notNull(), // OVERALL | NFL | NBA | NHL | MLB
  season: text('season').notNull(),
  type: text('type').default('SNAKE'), // SNAKE | AUCTION | LINEAR
  rounds: integer('rounds').default(4),
  status: text('status').default('PENDING'), // PENDING | IN_PROGRESS | COMPLETED
  startsAt: text('starts_at'),
  currentPick: integer('current_pick').default(0), // overall pick number on the clock (snake) / nomination turn (auction)
  pickSeconds: integer('pick_seconds').default(90), // per-pick / per-nomination time limit
  pickDeadline: text('pick_deadline'),              // ISO deadline for the current pick or bid
  // Auction-only live nomination state
  nomPlayerId: text('nom_player_id').references(() => players.id),
  nomTeamId: text('nom_team_id').references(() => teams.id),   // current high bidder
  nomBid: integer('nom_bid').default(0),                       // current high bid
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// ── Auction Budgets (per draft, per franchise) ──────────────────────────────

export const auctionBudgets = sqliteTable('auction_budgets', {
  id: text('id').primaryKey(),
  draftId: text('draft_id').notNull().references(() => drafts.id, { onDelete: 'cascade' }),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  budget: integer('budget').default(200),
  spent: integer('spent').default(0),
}, (t) => ({
  uniq: uniqueIndex('auction_budget_uniq').on(t.draftId, t.teamId),
}))

// ── Draft Queues + Auto-pick (per team per draft) ───────────────────────────

export const draftQueues = sqliteTable('draft_queues', {
  id: text('id').primaryKey(),
  draftId: text('draft_id').notNull().references(() => drafts.id, { onDelete: 'cascade' }),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  playerId: text('player_id').notNull().references(() => players.id),
  position: integer('position').notNull(),
}, (t) => ({
  uniq: uniqueIndex('draft_queue_uniq').on(t.draftId, t.teamId, t.playerId),
}))

export const draftAutopick = sqliteTable('draft_autopick', {
  id: text('id').primaryKey(),
  draftId: text('draft_id').notNull().references(() => drafts.id, { onDelete: 'cascade' }),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  enabled: integer('enabled', { mode: 'boolean' }).default(false),
}, (t) => ({
  uniq: uniqueIndex('draft_autopick_uniq').on(t.draftId, t.teamId),
}))

// ── Draft Picks (tradeable assets + draft-board slots) ──────────────────────

export const draftPicks = sqliteTable('draft_picks', {
  id: text('id').primaryKey(),
  leagueId: text('league_id').notNull().references(() => leagues.id),
  draftId: text('draft_id').references(() => drafts.id),
  sport: text('sport'), // null = combined/OVERALL pick until used
  round: integer('round').notNull(),
  year: integer('year').notNull(),
  originalTeamId: text('original_team_id').notNull().references(() => teams.id),
  currentTeamId: text('current_team_id').notNull().references(() => teams.id),
  isUsed: integer('is_used', { mode: 'boolean' }).default(false),
  pickedPlayerId: text('picked_player_id').references(() => players.id),
  pickNumber: integer('pick_number'),
})

// ── Player Game Stats (weekly stat lines + computed fantasy points) ─────────

export const playerGameStats = sqliteTable('player_game_stats', {
  id: text('id').primaryKey(),
  leagueId: text('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  season: text('season').notNull(),
  week: integer('week').notNull(),
  sport: text('sport').notNull(),
  playerId: text('player_id').notNull().references(() => players.id),
  teamId: text('team_id').references(() => teams.id),
  stats: text('stats').default('{}'),
  points: real('points').default(0),
}, (t) => ({
  uniq: uniqueIndex('pgs_uniq').on(t.leagueId, t.season, t.week, t.playerId),
}))

// ── Player news ──────────────────────────────────────────────────────────────

export const playerNews = sqliteTable('player_news', {
  id: text('id').primaryKey(),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  headline: text('headline').notNull(),
  body: text('body'),
  category: text('category').default('NOTE'), // INJURY | PERFORMANCE | TRANSACTION | NOTE
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// ── Matchups ───────────────────────────────────────────────────────────────

export const matchups = sqliteTable('matchups', {
  id: text('id').primaryKey(),
  leagueId: text('league_id').notNull().references(() => leagues.id),
  sport: text('sport').notNull(),
  season: text('season'),
  week: integer('week').notNull(),
  homeTeamId: text('home_team_id').notNull().references(() => teams.id),
  awayTeamId: text('away_team_id').references(() => teams.id),
  homeScore: real('home_score').default(0),
  awayScore: real('away_score').default(0),
  isComplete: integer('is_complete', { mode: 'boolean' }).default(false),
  isPlayoff: integer('is_playoff', { mode: 'boolean' }).default(false),
})

// ── Trades ─────────────────────────────────────────────────────────────────

export const trades = sqliteTable('trades', {
  id: text('id').primaryKey(),
  leagueId: text('league_id').references(() => leagues.id),
  initiatorId: text('initiator_id').notNull().references(() => teams.id),
  recipientId: text('recipient_id').references(() => teams.id), // primary partner (null for >2-team)
  status: text('status').default('PENDING'), // PENDING | ACCEPTED | REJECTED | CANCELLED | VETOED
  note: text('note'),
  reviewDeadline: text('review_deadline'),
  processedAt: text('processed_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// Each asset moves from one franchise to another — supports 2-team and N-team trades.
export const tradeItems = sqliteTable('trade_items', {
  id: text('id').primaryKey(),
  tradeId: text('trade_id').notNull().references(() => trades.id, { onDelete: 'cascade' }),
  fromTeamId: text('from_team_id').references(() => teams.id),
  toTeamId: text('to_team_id').references(() => teams.id),
  direction: text('direction'), // legacy GIVING | RECEIVING (kept for display fallback)
  playerId: text('player_id').references(() => players.id),
  pickId: text('pick_id').references(() => draftPicks.id),
})

// Per-participant approval for a (possibly multi-team) trade.
export const tradeApprovals = sqliteTable('trade_approvals', {
  id: text('id').primaryKey(),
  tradeId: text('trade_id').notNull().references(() => trades.id, { onDelete: 'cascade' }),
  teamId: text('team_id').notNull().references(() => teams.id),
  userId: text('user_id').references(() => users.id),
  status: text('status').default('PENDING'), // PENDING | ACCEPTED | REJECTED
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniq: uniqueIndex('trade_approval_uniq').on(t.tradeId, t.teamId),
}))

// ── Trade Votes (for league-vote review) ──────────────────────────────────

export const tradeVotes = sqliteTable('trade_votes', {
  id: text('id').primaryKey(),
  tradeId: text('trade_id').notNull().references(() => trades.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
  vote: text('vote').notNull(), // APPROVE | VETO
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniq: uniqueIndex('trade_vote_uniq').on(t.tradeId, t.userId),
}))

// ── Waiver Claims ──────────────────────────────────────────────────────────

export const waiverClaims = sqliteTable('waiver_claims', {
  id: text('id').primaryKey(),
  leagueId: text('league_id').notNull().references(() => leagues.id),
  teamId: text('team_id').notNull().references(() => teams.id),
  sport: text('sport'),
  addPlayerId: text('add_player_id').notNull().references(() => players.id),
  dropPlayerId: text('drop_player_id').references(() => players.id),
  bidAmount: integer('bid_amount').default(0),
  priority: integer('priority').default(1),
  status: text('status').default('PENDING'),
  claimedAt: text('claimed_at').default(sql`(datetime('now'))`),
  processedAt: text('processed_at'),
})

// ── Activity feed + notifications ──────────────────────────────────────────

export const activity = sqliteTable('activity', {
  id: text('id').primaryKey(),
  leagueId: text('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // TRADE | WAIVER | DRAFT | SCORE | ROSTER | LEAGUE
  message: text('message').notNull(),
  teamId: text('team_id').references(() => teams.id),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  link: text('link'),
  isRead: integer('is_read', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// ── Watchlist (per-user starred players) ────────────────────────────────────

export const watchlist = sqliteTable('watchlist', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniq: uniqueIndex('watchlist_uniq').on(t.userId, t.playerId),
}))

// ── Playoff games ────────────────────────────────────────────────────────────

export const playoffGames = sqliteTable('playoff_games', {
  id: text('id').primaryKey(),
  leagueId: text('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  season: text('season').notNull(),
  sport: text('sport').notNull(),
  round: integer('round').notNull(),       // 1 = first round
  matchIndex: integer('match_index').notNull(),
  homeSeed: integer('home_seed'),
  awaySeed: integer('away_seed'),
  homeTeamId: text('home_team_id').references(() => teams.id),
  awayTeamId: text('away_team_id').references(() => teams.id),
  homeScore: real('home_score').default(0),
  awayScore: real('away_score').default(0),
  winnerTeamId: text('winner_team_id').references(() => teams.id),
  isComplete: integer('is_complete', { mode: 'boolean' }).default(false),
})

// ── League chat / message board ─────────────────────────────────────────────

export const leagueMessages = sqliteTable('league_messages', {
  id: text('id').primaryKey(),
  leagueId: text('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  matchupId: text('matchup_id'), // when set, this is per-matchup trash talk
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// ── Commissioner Actions (audit log) ──────────────────────────────────────

export const commissionerActions = sqliteTable('commissioner_actions', {
  id: text('id').primaryKey(),
  leagueId: text('league_id').notNull().references(() => leagues.id),
  userId: text('user_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  details: text('details').default('{}'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})
