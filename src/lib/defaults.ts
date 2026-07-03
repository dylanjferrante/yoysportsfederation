export type RosterSettings = Record<string, number>
export type ScoringSettings = Record<string, number>

export const SPORTS = ['NFL', 'NHL', 'NBA', 'MLB'] as const
export type Sport = (typeof SPORTS)[number]

export const DEFAULT_ROSTER: Record<string, RosterSettings> = {
  NFL: { QB: 1, RB: 2, WR: 3, TE: 1, 'RB/WR/TE': 1, K: 1, DEF: 1, BN: 7, IR: 2, TAXI: 3 },
  NBA: { PG: 1, SG: 1, SF: 1, PF: 1, C: 1, G: 1, F: 1, UTIL: 1, BN: 4, IR: 2, TAXI: 3 },
  NHL: { C: 2, LW: 2, RW: 2, D: 4, G: 2, UTIL: 1, BN: 4, IR: 2, TAXI: 3 },
  MLB: { C: 1, '1B': 1, '2B': 1, '3B': 1, SS: 1, OF: 3, UTIL: 1, SP: 4, RP: 2, BN: 5, IR: 2, TAXI: 3 },
}

// Bench/reserve slot keys (not in the active scoring lineup).
export const RESERVE_SLOTS = ['BN', 'IR', 'IL', 'DL', 'TAXI']

export type LineupCadence = 'DAILY' | 'WEEKLY'

// How often lineups are set/locked per sport. Football is a weekly game (one
// lineup locks for the whole week); the other three play most nights, so their
// default is daily — a bench player can be started on a day a starter is off,
// and each day's lineup locks game-by-game.
export const DEFAULT_LINEUP_CADENCE: Record<string, LineupCadence> = {
  NFL: 'WEEKLY', NHL: 'DAILY', NBA: 'DAILY', MLB: 'DAILY',
}

// Resolve a sport's lineup cadence from the league's stored override map,
// falling back to the per-sport default.
export function lineupCadenceFor(raw: Record<string, string> | null | undefined, sport: string): LineupCadence {
  const v = raw?.[sport]
  if (v === 'DAILY' || v === 'WEEKLY') return v
  return DEFAULT_LINEUP_CADENCE[sport] ?? 'WEEKLY'
}

// IDP (individual defensive player) slot → eligible real positions. Used when a
// league runs individual defenders instead of a single team defense (DST).
// Note: 'DL' is both an IDP slot here and a reserve key above; reserve wins in
// slotEligible (handled by order), so name an IDP defensive-line slot 'DLINE'.
export const IDP_SLOT_POSITIONS: Record<string, string[]> = {
  DLINE: ['DL', 'DE', 'DT', 'NT', 'EDGE'],
  LB: ['LB', 'ILB', 'OLB', 'MLB'],
  DB: ['DB', 'CB', 'S', 'FS', 'SS', 'SAF'],
}
const ALL_IDP_POSITIONS = [...new Set(Object.values(IDP_SLOT_POSITIONS).flat())]
export const IDP_POSITIONS = ALL_IDP_POSITIONS

// Is a player (by position) eligible to occupy a given roster slot?
export function slotEligible(position: string, slot: string): boolean {
  if (RESERVE_SLOTS.includes(slot)) return true       // bench / taxi / IR open to anyone
  if (slot === position) return true                  // exact position
  if (slot.includes('/')) return slot.split('/').includes(position) // flex e.g. RB/WR/TE
  if (slot === 'UTIL') return true                    // utility takes any
  if (slot === 'G') return ['PG', 'SG'].includes(position)
  if (slot === 'F') return ['SF', 'PF'].includes(position)
  if (IDP_SLOT_POSITIONS[slot]) return IDP_SLOT_POSITIONS[slot].includes(position)
  if (slot === 'IDP') return ALL_IDP_POSITIONS.includes(position)
  return false
}

// ── NFL defense mode: team defense (DST) vs individual defenders (IDP) ────────
export type DefenseMode = 'TEAM' | 'IDP'
// Roster's defensive slots differ by mode; offense is identical.
const NFL_OFFENSE_SLOTS = { QB: 1, RB: 2, WR: 3, TE: 1, 'RB/WR/TE': 1, K: 1 }
const NFL_BENCH_SLOTS = { BN: 7, IR: 2, TAXI: 3 }
export function nflRosterFor(mode: DefenseMode): Record<string, number> {
  return mode === 'IDP'
    ? { ...NFL_OFFENSE_SLOTS, DLINE: 1, LB: 2, DB: 2, ...NFL_BENCH_SLOTS }
    : { ...NFL_OFFENSE_SLOTS, DEF: 1, ...NFL_BENCH_SLOTS }
}

// Team-defense (DST) scoring keys within DEFAULT_SCORING.NFL — removed in IDP mode.
const NFL_DST_KEYS = [
  'sack', 'interception', 'fumbleRecovery', 'defensiveTD', 'specialTeamsTD', 'safeties', 'blockedKick',
  'ptsAllowed0', 'ptsAllowed1_6', 'ptsAllowed7_13', 'ptsAllowed14_20', 'ptsAllowed21_27', 'ptsAllowed28_34', 'ptsAllowed35plus',
  'yardsAllowedUnder100', 'yardsAllowed100_199', 'yardsAllowed200_249', 'yardsAllowed250_299', 'yardsAllowed300_349', 'yardsAllowed350_399', 'yardsAllowed400plus',
]
// Individual-defender scoring (used in IDP mode).
export const IDP_SCORING: Record<string, number> = {
  idpSoloTackle: 1,
  idpAssistTackle: 0.5,
  idpSack: 2,
  idpTackleForLoss: 1,
  idpQbHit: 1,
  idpPassDefended: 1,
  idpInterception: 3,
  idpForcedFumble: 3,
  idpFumbleRecovery: 2,
  idpDefTD: 6,
  idpSafety: 2,
}
export function nflScoringFor(mode: DefenseMode): Record<string, number> {
  const base: Record<string, number> = { ...DEFAULT_SCORING.NFL }
  if (mode === 'IDP') {
    for (const k of NFL_DST_KEYS) delete base[k]
    return { ...base, ...IDP_SCORING }
  }
  return base
}

// The ordered list of slots (that exist in this sport's roster) a player can fill.
export function eligibleSlots(position: string, rosterSettings: Record<string, number>): string[] {
  return Object.keys(rosterSettings).filter(slot => slotEligible(position, slot))
}

// Dynasty-draft size per sport (full initial draft). Rookie drafts use rookieDraftRounds.
export const DEFAULT_DRAFT_ROUNDS: Record<string, number> = {
  NFL: 15, NBA: 13, NHL: 20, MLB: 25,
}

// Injured-reserve slots aren't drafted into.
const NON_DRAFT_SLOTS = ['IR', 'IL', 'DL']

// The initial dynasty draft is ONE combined draft across all sports; its length
// equals the total roster spots a franchise fills (starters + bench + taxi,
// across every sport). So a pick is made for each roster spot.
export function dynastyDraftRounds(rosterSettings: Record<string, Record<string, number>>): number {
  let total = 0
  for (const sport in rosterSettings) {
    for (const [slot, n] of Object.entries(rosterSettings[sport] ?? {})) {
      if (!NON_DRAFT_SLOTS.includes(slot)) total += (n || 0)
    }
  }
  return total
}

// Rookie-draft rounds per sport.
export const DEFAULT_ROOKIE_ROUNDS: Record<string, number> = {
  NFL: 4, NBA: 2, NHL: 4, MLB: 5,
}

// Regular-season length (weeks) per sport.
export const DEFAULT_SEASON_WEEKS: Record<string, number> = {
  NFL: 14, NBA: 19, NHL: 22, MLB: 24,
}

// ── Comprehensive, Fantrax-level scoring per sport ──────────────────────────

export const DEFAULT_SCORING: Record<string, ScoringSettings> = {
  NFL: {
    // Passing
    passingYards: 0.04,
    passingTD: 4,
    passingInt: -2,
    passing2pt: 2,
    passingCompletions: 0,
    passingAttempts: 0,
    passing300Bonus: 3,
    passing400Bonus: 6,
    sacked: -0.5,
    // Rushing
    rushingYards: 0.1,
    rushingTD: 6,
    rushingAttempts: 0,
    rushing2pt: 2,
    rushing100Bonus: 3,
    rushing200Bonus: 6,
    // Receiving
    receptions: 1, // PPR
    receivingYards: 0.1,
    receivingTD: 6,
    targets: 0,
    receiving2pt: 2,
    receiving100Bonus: 3,
    receiving200Bonus: 6,
    // Misc
    fumbles: -1,
    fumbleLost: -2,
    fumbleRecoveryTD: 6,
    // Kicking
    fgMade0_39: 3,
    fgMade40_49: 4,
    fgMade50plus: 5,
    // Optional per-yardage FG scoring (set fgPointsPerYard > 0 to use instead of the
    // tiers above — e.g. 0.1 → 3.2 pts for a 32-yd kick). fgMinPoints is a per-made-FG
    // floor under per-yardage scoring. Both default 0 (off → the tiers above are used).
    fgPointsPerYard: 0,
    fgMinPoints: 0,
    fgMissed: -1,
    xpMade: 1,
    xpMissed: -1,
    // Defense / Special Teams
    sack: 1,
    interception: 2,
    fumbleRecovery: 2,
    defensiveTD: 6,
    specialTeamsTD: 6,
    safeties: 2,
    blockedKick: 2,
    ptsAllowed0: 10,
    ptsAllowed1_6: 7,
    ptsAllowed7_13: 4,
    ptsAllowed14_20: 1,
    ptsAllowed21_27: 0,
    ptsAllowed28_34: -1,
    ptsAllowed35plus: -4,
    yardsAllowedUnder100: 5,
    yardsAllowed100_199: 3,
    yardsAllowed200_249: 2,
    yardsAllowed250_299: 1,
    yardsAllowed300_349: 0,
    yardsAllowed350_399: -1,
    yardsAllowed400plus: -3,
  },
  NBA: {
    points: 1,
    offRebounds: 1.2,
    defRebounds: 1.2,
    rebounds: 0,
    assists: 1.5,
    steals: 3,
    blocks: 3,
    turnovers: -1,
    threesMade: 0.5,
    fieldGoalsMade: 1,
    fieldGoalsMissed: -0.5,
    freeThrowsMade: 1,
    freeThrowsMissed: -0.5,
    personalFouls: -0.5,
    doubleDouble: 1.5,
    tripleDouble: 3,
    minutes: 0,
  },
  NHL: {
    // Skaters
    goals: 8,
    assists: 5,
    plusMinus: 2,
    penaltyMinutes: -0.5,
    shotsOnGoal: 0.9,
    ppGoals: 2,
    ppAssists: 1,
    shGoals: 4,
    shAssists: 2,
    gwGoals: 2,
    hits: 0.4,
    blockedShots: 0.4,
    faceoffsWon: 0.1,
    faceoffsLost: -0.1,
    // Goalies
    wins: 10,
    overtimeLoss: 2,
    saves: 0.4,
    goalsAllowed: -1.5,
    shutout: 5,
  },
  MLB: {
    // Batting
    runs: 1,
    singles: 1,
    doubles: 2,
    triples: 3,
    homeRuns: 4,
    rbi: 2,
    walks: 1,
    hbp: 1,
    stolenBases: 2,
    caughtStealing: -1,
    strikeoutsAsBatter: -0.5,
    sacFly: 0.5,
    // Pitching
    inningsPitched: 2.25,
    strikeoutsAsPitcher: 1,
    wins: 4,
    losses: -4,
    earnedRunsAllowed: -1,
    hitsAllowed: -0.5,
    walksAllowed: -0.5,
    saves: 5,
    holds: 2,
    blownSaves: -2,
    qualityStart: 3,
    completeGame: 5,
    shutoutPitching: 5,
    noHitter: 10,
    perfectGame: 20,
  },
}

export const SPORT_POSITIONS: Record<string, string[]> = {
  NFL: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
  NBA: ['PG', 'SG', 'SF', 'PF', 'C'],
  NHL: ['C', 'LW', 'RW', 'D', 'G'],
  MLB: ['C', '1B', '2B', '3B', 'SS', 'OF', 'SP', 'RP'],
}

// Build per-sport settings maps for the enabled sports.
export function buildPerSportSettings(sportsEnabled: string[]) {
  const roster: Record<string, RosterSettings> = {}
  const scoring: Record<string, ScoringSettings> = {}
  const draftRounds: Record<string, number> = {}
  const rookieRounds: Record<string, number> = {}
  const seasonWeeks: Record<string, number> = {}
  for (const s of sportsEnabled) {
    roster[s] = { ...(DEFAULT_ROSTER[s] ?? {}) }
    scoring[s] = { ...(DEFAULT_SCORING[s] ?? {}) }
    draftRounds[s] = DEFAULT_DRAFT_ROUNDS[s] ?? 12
    rookieRounds[s] = DEFAULT_ROOKIE_ROUNDS[s] ?? 4
    seasonWeeks[s] = DEFAULT_SEASON_WEEKS[s] ?? 18
  }
  return { roster, scoring, draftRounds, rookieRounds, seasonWeeks }
}

// ── Season schedule (calendar anchor → overlapping per-sport windows) ────────

export const SEASON_STARTS = [
  { key: 'FOOTBALL', label: 'Football first (Fall)' },
  { key: 'WINTER',   label: 'Basketball & Hockey first (Winter)' },
  { key: 'BASEBALL', label: 'Baseball first (Spring)' },
]

const SPORT_PHASE: Record<string, string> = { NFL: 'FOOTBALL', NBA: 'WINTER', NHL: 'WINTER', MLB: 'BASEBALL' }

const PHASE_ORDER_FROM: Record<string, string[]> = {
  FOOTBALL: ['FOOTBALL', 'WINTER', 'BASEBALL'],
  WINTER:   ['WINTER', 'BASEBALL', 'FOOTBALL'],
  BASEBALL: ['BASEBALL', 'FOOTBALL', 'WINTER'],
}

export type ScheduleEntry = { sport: string; phase: string; startWeek: number; endWeek: number }

// Windows deliberately overlap so multiple sports share weeks. Optional per-sport
// week counts set each sport's window length (defaults to DEFAULT_SEASON_WEEKS).
// Approximate calendar week-of-year each phase really begins (football early Sep,
// winter mid-Oct, baseball late March). Used to space the phases realistically so
// e.g. baseball runs spring→late August instead of being crammed into winter.
const PHASE_CAL_WEEK: Record<string, number> = { FOOTBALL: 36, WINTER: 42, BASEBALL: 12 }
// Within a shared phase, sports don't all tip off the same week. Hockey starts a
// couple weeks before basketball, so NBA is offset later inside the Winter phase.
const SPORT_PHASE_OFFSET: Record<string, number> = { NBA: 2 }

export function buildSchedule(
  seasonStart: string,
  sportsEnabled: string[],
  seasonWeeks?: Record<string, number>,
  starts?: Record<string, number>,
): ScheduleEntry[] {
  const order = PHASE_ORDER_FROM[seasonStart] ?? PHASE_ORDER_FROM.FOOTBALL
  const anchorCal = PHASE_CAL_WEEK[order[0]] ?? 36
  const schedule: ScheduleEntry[] = []
  for (const phase of order) {
    // Weeks from the season anchor to this phase's real-world start.
    const phaseStart = (((PHASE_CAL_WEEK[phase] ?? 36) - anchorCal + 52) % 52) + 1
    for (const sport of sportsEnabled) {
      if (SPORT_PHASE[sport] === phase) {
        const len = seasonWeeks?.[sport] ?? DEFAULT_SEASON_WEEKS[sport] ?? 18
        // Commissioner may override a sport's start week; otherwise it anchors to its
        // phase, plus a within-phase offset (hockey before basketball).
        const startWeek = starts?.[sport] && starts[sport] > 0 ? starts[sport] : phaseStart + (SPORT_PHASE_OFFSET[sport] ?? 0)
        schedule.push({ sport, phase, startWeek, endWeek: startWeek + len - 1 })
      }
    }
  }
  return schedule.sort((a, b) => a.startWeek - b.startWeek || a.sport.localeCompare(b.sport))
}

export function scheduleWeeks(schedule: ScheduleEntry[]): number {
  return schedule.reduce((max, s) => Math.max(max, s.endWeek), 0)
}

// A sport's own week number (1-based within its season) for a given federation
// week — so baseball's "federation week 56" reads as "MLB week 12".
export function sportWeekOf(schedule: ScheduleEntry[], sport: string, federationWeek: number): number | null {
  const e = schedule.find(s => s.sport === sport)
  if (!e) return null
  const w = federationWeek - e.startWeek + 1
  return w >= 1 ? w : null
}

export function sportsActiveInWeek(schedule: ScheduleEntry[], week: number): string[] {
  return schedule.filter(s => week >= s.startWeek && week <= s.endWeek).map(s => s.sport)
}

const PHASE_ANCHOR_DATE: Record<string, [number, number]> = { FOOTBALL: [8, 1], WINTER: [9, 15], BASEBALL: [2, 26] }

export function seasonAnchor(season: string, seasonStart: string = 'FOOTBALL'): number {
  const yr = parseInt(season?.slice(0, 4)) || new Date().getFullYear()
  const first = (PHASE_ORDER_FROM[seasonStart] ?? PHASE_ORDER_FROM.FOOTBALL)[0]
  const [mo, day] = PHASE_ANCHOR_DATE[first] ?? PHASE_ANCHOR_DATE.FOOTBALL
  return new Date(yr, mo, day).getTime()
}

export function weekDateRange(season: string, week: number, seasonStart: string = 'FOOTBALL'): { start: Date; end: Date } {
  const anchor = seasonAnchor(season, seasonStart)
  const start = new Date(anchor + (week - 1) * 7 * 86_400_000)
  const end = new Date(start.getTime() + 6 * 86_400_000)
  return { start, end }
}

export function formatWeekRange(season: string, week: number, opts?: { year?: boolean; seasonStart?: string }): string {
  const { start, end } = weekDateRange(season, week, opts?.seasonStart)
  const m = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const yr = opts?.year ? `, ${end.getFullYear()}` : ''
  return `${m(start)} – ${m(end)}${yr}`
}

export function weekDateRangeWithBreaks(season: string, week: number, breaks: number[] = [], seasonStart: string = 'FOOTBALL'): { start: Date; end: Date; spanWeeks: number } {
  const anchor = seasonAnchor(season, seasonStart)
  const before = breaks.filter(b => b < week).length
  const spanWeeks = 1 + (breaks.includes(week) ? 1 : 0)
  const start = new Date(anchor + (week - 1 + before) * 7 * 86_400_000)
  const end = new Date(start.getTime() + (spanWeeks * 7 - 1) * 86_400_000)
  return { start, end, spanWeeks }
}

export function formatWeekRangeWithBreaks(season: string, week: number, breaks: number[] = [], seasonStart: string = 'FOOTBALL'): string {
  const { start, end } = weekDateRangeWithBreaks(season, week, breaks, seasonStart)
  const m = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${m(start)} – ${m(end)}`
}

// ── Per-sport trade deadlines ────────────────────────────────────────────────

export type TradeDeadlineMode = 'WEEK' | 'SPORT_PLAYOFFS' | 'SPORT_CHAMPIONSHIP' | 'FEDERATION_CHAMPIONSHIP' | 'NONE'
export type TradeDeadline = { mode: TradeDeadlineMode; week?: number }

export const TRADE_DEADLINE_MODES: { value: TradeDeadlineMode; label: string; help: string }[] = [
  { value: 'WEEK', label: 'Specific week', help: 'Trades lock after the chosen regular-season week.' },
  { value: 'SPORT_PLAYOFFS', label: "Sport's playoffs begin", help: "Trades lock once that sport's regular season ends." },
  { value: 'SPORT_CHAMPIONSHIP', label: "After sport's championship", help: 'Trades stay open through the entire postseason for that sport.' },
  { value: 'FEDERATION_CHAMPIONSHIP', label: 'After federation championship', help: 'Trades stay open until the whole federation season concludes.' },
  { value: 'NONE', label: 'No deadline (year-round)', help: 'Dynasty-style — trades are always allowed.' },
]

// ── Playoffs format & sizing ─────────────────────────────────────────────────
export type PlayoffFormat = 'H2H' | 'MULTI_WEEK' | 'CHAMP_MULTI'
export const PLAYOFF_FORMATS: { value: PlayoffFormat; label: string; help: string }[] = [
  { value: 'H2H', label: 'Head-to-head (1 week/round)', help: 'Each playoff round is a single-week matchup.' },
  { value: 'MULTI_WEEK', label: 'Multi-week rounds', help: 'Every round spans multiple weeks; combined score advances.' },
  { value: 'CHAMP_MULTI', label: 'Multi-week championship only', help: 'Earlier rounds are one week; only the final spans multiple weeks.' },
]
// Even team-count options. Playoff brackets: 2–16; league size: 4–16.
export const EVEN_TEAM_OPTIONS = [2, 4, 6, 8, 10, 12, 14, 16]
export const LEAGUE_SIZE_OPTIONS = [4, 6, 8, 10, 12, 14, 16]
// A bracket of N teams needs ceil(log2(N)) rounds (byes fill non-powers of two).
export function maxPlayoffRounds(teams: number): number {
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, teams))))
}
// Total weeks the postseason occupies, given format + weeks-per-round.
export function playoffWeeks(rounds: number, format: PlayoffFormat, weeksPerRound: number): number {
  const w = Math.max(1, weeksPerRound)
  if (format === 'MULTI_WEEK') return rounds * w
  if (format === 'CHAMP_MULTI') return (rounds - 1) + w
  return rounds // H2H
}

// Per-sport waiver run time (default: Wednesday 3am for each sport).
export type WaiverRun = { day: number; hour: number }
export const WAIVER_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export function defaultWaiverSchedule(sportsEnabled: string[]): Record<string, WaiverRun> {
  return Object.fromEntries(sportsEnabled.map(s => [s, { day: 3, hour: 3 }]))
}

// ── IR-eligible injury designations (per sport) ──────────────────────────────
// The injury designations a player can carry (sourced from the stats provider).
// The commissioner chooses which of these qualify a player for an IR roster slot.
export const IR_DESIGNATIONS: Record<string, string[]> = {
  NFL: ['IR', 'Out', 'Doubtful', 'Questionable', 'PUP', 'NFI', 'Suspended'],
  NBA: ['Out', 'Doubtful', 'Game Time Decision', 'Day-To-Day'],
  NHL: ['IR', 'LTIR', 'Out', 'Day-To-Day'],
  MLB: ['10-Day IL', '15-Day IL', '60-Day IL', 'Day-To-Day'],
}
// Sensible defaults: only the clearly-unavailable designations qualify for IR.
const IR_DEFAULTS: Record<string, string[]> = {
  NFL: ['IR', 'Out', 'PUP', 'NFI'],
  NBA: ['Out'],
  NHL: ['IR', 'LTIR', 'Out'],
  MLB: ['10-Day IL', '15-Day IL', '60-Day IL'],
}
export function defaultIrDesignations(sportsEnabled: string[]): Record<string, string[]> {
  return Object.fromEntries(sportsEnabled.map(s => [s, IR_DEFAULTS[s] ?? []]))
}
/** True when a player's injury designation qualifies for an IR slot in this league. */
export function irEligible(sport: string, designation: string | null | undefined, config: Record<string, string[]>): boolean {
  if (!designation) return false
  const allowed = config[sport] ?? IR_DEFAULTS[sport] ?? []
  return allowed.some(d => d.toLowerCase() === designation.toLowerCase())
}

export function defaultTradeDeadlines(sportsEnabled: string[]): Record<string, TradeDeadline> {
  // Default: lock when each sport's playoffs begin (classic redraft behavior).
  return Object.fromEntries(sportsEnabled.map(s => [s, { mode: 'SPORT_PLAYOFFS' as TradeDeadlineMode }]))
}

// Resolve a sport's deadline into the last week trades are allowed (Infinity = none).
export function resolveTradeDeadlineWeek(
  d: TradeDeadline | undefined, sport: string, schedule: ScheduleEntry[], playoffRounds = 2,
): number {
  const win = schedule.find(s => s.sport === sport)
  const regEnd = win?.endWeek ?? 0
  const sportChamp = regEnd + Math.max(1, playoffRounds)
  const fedChamp = Math.max(...schedule.map(s => s.endWeek), regEnd) + Math.max(1, playoffRounds)
  switch (d?.mode) {
    case 'WEEK': return d.week ?? regEnd
    case 'SPORT_PLAYOFFS': return regEnd
    case 'SPORT_CHAMPIONSHIP': return sportChamp
    case 'FEDERATION_CHAMPIONSHIP': return fedChamp
    case 'NONE': return Infinity
    default: return regEnd
  }
}

// Round-robin pairings (circle method). pairing for week w = rounds[(w-1) % rounds.length].
export function buildWeeklyPairings(teamIds: string[]): [string, string][][] {
  const ids = [...teamIds]
  if (ids.length < 2) return []
  if (ids.length % 2 !== 0) ids.push('__BYE__')
  const n = ids.length
  const arr = [...ids]
  const rounds: [string, string][][] = []
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = []
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i]
      if (a !== '__BYE__' && b !== '__BYE__') pairs.push([a, b])
    }
    // rotate, keeping the first element fixed
    arr.splice(1, 0, arr.pop() as string)
    rounds.push(pairs)
  }
  return rounds
}
