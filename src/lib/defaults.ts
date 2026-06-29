export type RosterSettings = Record<string, number>
export type ScoringSettings = Record<string, number>

export const DEFAULT_ROSTER: Record<string, RosterSettings> = {
  NFL: { QB: 1, RB: 2, WR: 3, TE: 1, 'RB/WR/TE': 1, K: 1, DEF: 1, BN: 7, IR: 2 },
  NBA: { PG: 1, SG: 1, SF: 1, PF: 1, C: 1, 'G': 1, 'F': 1, UTIL: 1, BN: 4, IL: 2 },
  NHL: { C: 2, LW: 2, RW: 2, D: 4, G: 2, UTIL: 1, BN: 4, IR: 2 },
  MLB: { C: 1, '1B': 1, '2B': 1, '3B': 1, SS: 1, OF: 3, UTIL: 1, SP: 4, RP: 2, BN: 5, DL: 2 },
}

export const DEFAULT_SCORING: Record<string, ScoringSettings> = {
  NFL: {
    // Passing
    passingYards: 0.04,
    passingTD: 4,
    passingInt: -2,
    passing300Bonus: 3,
    passing400Bonus: 6,
    // Rushing
    rushingYards: 0.1,
    rushingTD: 6,
    rushing100Bonus: 3,
    rushing200Bonus: 6,
    // Receiving
    receptions: 1, // PPR
    receivingYards: 0.1,
    receivingTD: 6,
    receiving100Bonus: 3,
    // Misc
    fumbleLost: -2,
    twoPointConversion: 2,
    // Kicker
    fgMade0_39: 3,
    fgMade40_49: 4,
    fgMade50plus: 5,
    fgMissed: -1,
    xpMade: 1,
    // Defense/ST
    sack: 1,
    interception: 2,
    fumbleRecovery: 2,
    defensiveTD: 6,
    safeties: 2,
    blocked: 2,
    ptsAllowed0: 10,
    ptsAllowed1_6: 7,
    ptsAllowed7_13: 4,
    ptsAllowed14_20: 1,
    ptsAllowed21_27: 0,
    ptsAllowed28_34: -1,
    ptsAllowed35plus: -4,
  },
  NBA: {
    points: 1,
    rebounds: 1.2,
    assists: 1.5,
    steals: 3,
    blocks: 3,
    turnovers: -1,
    threesMade: 0.5,
    doubleDouble: 1.5,
    tripleDouble: 3,
  },
  NHL: {
    goals: 8,
    assists: 5,
    plusMinus: 2,
    penaltyMinutes: -0.5,
    shots: 0.9,
    ppGoals: 2,
    ppAssists: 1,
    shGoals: 4,
    shAssists: 2,
    gwGoals: 2,
    faceoffsWon: 0.1,
    faceoffsLost: -0.1,
    // Goalies
    wins: 10,
    saves: 0.4,
    goalsAllowed: -1.5,
    shutout: 5,
    overtimeLoss: 2,
  },
  MLB: {
    // Batters
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
    // Pitchers
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
