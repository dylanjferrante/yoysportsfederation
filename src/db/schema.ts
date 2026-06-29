import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ── Users ──────────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// ── Leagues ────────────────────────────────────────────────────────────────

export const leagues = sqliteTable('leagues', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sport: text('sport').notNull(), // NFL | NHL | NBA | MLB
  season: text('season').notNull(),
  commissionerId: text('commissioner_id').notNull().references(() => users.id),
  isPublic: integer('is_public', { mode: 'boolean' }).default(false),
  inviteCode: text('invite_code').unique(),
  status: text('status').default('SETUP'), // SETUP | DRAFTING | ACTIVE | PLAYOFFS | COMPLETED
  maxTeams: integer('max_teams').default(12),
  description: text('description'),

  // Roster settings (JSON string: { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, K: 1, DEF: 1, BN: 7, IR: 2 })
  rosterSettings: text('roster_settings').default('{}'),

  // Scoring settings (JSON string: { passingYards: 0.04, passingTD: 4, ... })
  scoringSettings: text('scoring_settings').default('{}'),

  // Draft
  draftType: text('draft_type').default('SNAKE'),       // SNAKE | AUCTION | LINEAR
  draftDate: text('draft_date'),
  draftStatus: text('draft_status').default('PENDING'), // PENDING | IN_PROGRESS | COMPLETED
  auctionBudget: integer('auction_budget').default(200),
  secondsPerPick: integer('seconds_per_pick').default(90),
  autoPickEnabled: integer('auto_pick_enabled', { mode: 'boolean' }).default(true),

  // Trades
  tradeDeadline: text('trade_deadline'),
  tradeReview: text('trade_review').default('COMMISSIONER'), // NONE | COMMISSIONER | LEAGUE_VOTE
  tradeReviewHours: integer('trade_review_hours').default(48),
  vetoVotesRequired: integer('veto_votes_required').default(4),

  // Waivers
  waiverType: text('waiver_type').default('PRIORITY'), // PRIORITY | FAAB | FREE_AGENT
  faabBudget: integer('faab_budget').default(100),
  waiverDay: integer('waiver_day').default(3),   // 0=Sun, 3=Wed
  waiverHour: integer('waiver_hour').default(3), // 3 AM
  lockDay: integer('lock_day').default(0),       // 0=Sun (game day)

  // Playoffs
  playoffTeams: integer('playoff_teams').default(4),
  playoffStartWeek: integer('playoff_start_week').default(15),
  regularSeasonWeeks: integer('regular_season_weeks').default(14),
  playoffRounds: integer('playoff_rounds').default(2),

  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// ── League Members ─────────────────────────────────────────────────────────

export const leagueMembers = sqliteTable('league_members', {
  id: text('id').primaryKey(),
  leagueId: text('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
  role: text('role').default('MEMBER'), // COMMISSIONER | CO_COMMISSIONER | MEMBER
  joinedAt: text('joined_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniq: uniqueIndex('league_member_uniq').on(t.leagueId, t.userId),
}))

// ── Teams ──────────────────────────────────────────────────────────────────

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  abbreviation: text('abbreviation').notNull(),
  logo: text('logo'),
  userId: text('user_id').notNull().references(() => users.id),
  leagueId: text('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),

  // Season stats
  wins: integer('wins').default(0),
  losses: integer('losses').default(0),
  ties: integer('ties').default(0),
  pointsFor: real('points_for').default(0),
  pointsAgainst: real('points_against').default(0),

  // Waiver/FAAB
  faabRemaining: integer('faab_remaining').default(100),
  waiverPriority: integer('waiver_priority').default(1),

  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// ── Players ────────────────────────────────────────────────────────────────

export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  externalId: text('external_id'),   // from source API
  name: text('name').notNull(),
  sport: text('sport').notNull(),    // NFL | NHL | NBA | MLB
  position: text('position').notNull(),
  eligiblePositions: text('eligible_positions').default('[]'), // JSON array
  realTeam: text('real_team').notNull(),
  realTeamAbbr: text('real_team_abbr'),
  status: text('status').default('ACTIVE'), // ACTIVE | INJURED | IR | OUT | SUSPENDED
  injuryNote: text('injury_note'),
  byeWeek: integer('bye_week'),
  photoUrl: text('photo_url'),

  // Season averages (stored for quick display)
  seasonPoints: real('season_points').default(0),
  weeklyAvg: real('weekly_avg').default(0),
  projectedPoints: real('projected_points').default(0),

  // Raw stats JSON for display
  stats: text('stats').default('{}'),

  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// ── Rosters ────────────────────────────────────────────────────────────────

export const rosters = sqliteTable('rosters', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  playerId: text('player_id').notNull().references(() => players.id),
  slot: text('slot').notNull(),        // QB | RB | WR | TE | FLEX | K | DEF | BN | IR
  acquisitionType: text('acquisition_type').default('DRAFT'), // DRAFT | WAIVER | FA | TRADE
  acquiredAt: text('acquired_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniq: uniqueIndex('roster_uniq').on(t.teamId, t.playerId),
}))

// ── Draft Picks ────────────────────────────────────────────────────────────

export const draftPicks = sqliteTable('draft_picks', {
  id: text('id').primaryKey(),
  sport: text('sport').notNull(),
  round: integer('round').notNull(),
  year: integer('year').notNull(),
  leagueId: text('league_id').notNull().references(() => leagues.id),
  originalTeamId: text('original_team_id').notNull().references(() => teams.id),
  currentTeamId: text('current_team_id').notNull().references(() => teams.id),
  isUsed: integer('is_used', { mode: 'boolean' }).default(false),
  pickedPlayerId: text('picked_player_id').references(() => players.id),
  pickNumber: integer('pick_number'), // overall pick number once used
})

// ── Draft Order ────────────────────────────────────────────────────────────

export const draftOrder = sqliteTable('draft_order', {
  id: text('id').primaryKey(),
  leagueId: text('league_id').notNull().references(() => leagues.id),
  teamId: text('team_id').notNull().references(() => teams.id),
  position: integer('position').notNull(), // 1 = first pick
})

// ── Matchups ───────────────────────────────────────────────────────────────

export const matchups = sqliteTable('matchups', {
  id: text('id').primaryKey(),
  leagueId: text('league_id').notNull().references(() => leagues.id),
  week: integer('week').notNull(),
  homeTeamId: text('home_team_id').notNull().references(() => teams.id),
  awayTeamId: text('away_team_id').references(() => teams.id), // null = bye
  homeScore: real('home_score').default(0),
  awayScore: real('away_score').default(0),
  isComplete: integer('is_complete', { mode: 'boolean' }).default(false),
  isPlayoff: integer('is_playoff', { mode: 'boolean' }).default(false),
})

// ── Trades ─────────────────────────────────────────────────────────────────

export const trades = sqliteTable('trades', {
  id: text('id').primaryKey(),
  initiatorId: text('initiator_id').notNull().references(() => teams.id),
  recipientId: text('recipient_id').notNull().references(() => teams.id),
  status: text('status').default('PENDING'), // PENDING | ACCEPTED | REJECTED | CANCELLED | VETOED
  note: text('note'),
  reviewDeadline: text('review_deadline'),
  processedAt: text('processed_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

export const tradeItems = sqliteTable('trade_items', {
  id: text('id').primaryKey(),
  tradeId: text('trade_id').notNull().references(() => trades.id, { onDelete: 'cascade' }),
  direction: text('direction').notNull(), // GIVING | RECEIVING (from initiator's perspective)
  playerId: text('player_id').references(() => players.id),
  pickId: text('pick_id').references(() => draftPicks.id),
})

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
  addPlayerId: text('add_player_id').notNull().references(() => players.id),
  dropPlayerId: text('drop_player_id').references(() => players.id),
  bidAmount: integer('bid_amount').default(0), // for FAAB
  priority: integer('priority').default(1),    // for priority waivers
  status: text('status').default('PENDING'),   // PENDING | PROCESSED | FAILED
  claimedAt: text('claimed_at').default(sql`(datetime('now'))`),
  processedAt: text('processed_at'),
})

// ── Commissioner Actions (audit log) ──────────────────────────────────────

export const commissionerActions = sqliteTable('commissioner_actions', {
  id: text('id').primaryKey(),
  leagueId: text('league_id').notNull().references(() => leagues.id),
  userId: text('user_id').notNull().references(() => users.id),
  action: text('action').notNull(), // FORCE_TRADE | MOVE_PLAYER | EDIT_SCORE | RESET_DRAFT | etc.
  details: text('details').default('{}'), // JSON
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})
