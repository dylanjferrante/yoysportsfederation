export type RosterSettings = Record<string, number>
export type ScoringSettings = Record<string, number>

export const SPORTS = ['NFL', 'NBA', 'NHL', 'MLB'] as const
export type Sport = (typeof SPORTS)[number]

export const DEFAULT_ROSTER: Record<string, RosterSettings> = {
  NFL: { QB: 1, RB: 2, WR: 3, TE: 1, 'RB/WR/TE': 1, K: 1, DEF: 1, BN: 7, IR: 2, TAXI: 3 },
  NBA: { PG: 1, SG: 1, SF: 1, PF: 1, C: 1, G: 1, F: 1, UTIL: 1, BN: 4, IR: 2, TAXI: 3 },
  NHL: { C: 2, LW: 2, RW: 2, D: 4, G: 2, UTIL: 1, BN: 4, IR: 2, TAXI: 3 },
  MLB: { C: 1, '1B': 1, '2B': 1, '3B': 1, SS: 1, OF: 3, UTIL: 1, SP: 4, RP: 2, BN: 5, IR: 2, TAXI: 3 },
}

// Bench/reserve slot keys (not in the active scoring lineup).
export const RESERVE_SLOTS = ['BN', 'IR', 'IL', 'DL', 'TAXI']

// Dynasty-draft size per sport (full initial draft). Rookie drafts use rookieDraftRounds.
export const DEFAULT_DRAFT_ROUNDS: Record<string, number> = {
  NFL: 15, NBA: 13, NHL: 20, MLB: 25,
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
export function buildSchedule(seasonStart: string, sportsEnabled: string[], seasonWeeks?: Record<string, number>): ScheduleEntry[] {
  const order = PHASE_ORDER_FROM[seasonStart] ?? PHASE_ORDER_FROM.FOOTBALL
  const step = 8
  const schedule: ScheduleEntry[] = []
  order.forEach((phase, i) => {
    const startWeek = 1 + i * step
    for (const sport of sportsEnabled) {
      if (SPORT_PHASE[sport] === phase) {
        const len = seasonWeeks?.[sport] ?? DEFAULT_SEASON_WEEKS[sport] ?? 18
        schedule.push({ sport, phase, startWeek, endWeek: startWeek + len - 1 })
      }
    }
  })
  return schedule.sort((a, b) => a.startWeek - b.startWeek || a.sport.localeCompare(b.sport))
}

export function scheduleWeeks(schedule: ScheduleEntry[]): number {
  return schedule.reduce((max, s) => Math.max(max, s.endWeek), 0)
}

export function sportsActiveInWeek(schedule: ScheduleEntry[], week: number): string[] {
  return schedule.filter(s => week >= s.startWeek && week <= s.endWeek).map(s => s.sport)
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
