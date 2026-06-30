// Render-only metadata: maps each scoring stat key to a friendly label and a group.
// The stored scoringSettings stay a flat { stat: points } map; this drives grouped,
// labelled sections in the commissioner Scoring settings.

export type StatMeta = { label: string; group: string }

export const SCORING_CATEGORIES: Record<string, Record<string, StatMeta>> = {
  NFL: {
    passingYards:        { label: 'Passing Yards (per yd)', group: 'Passing' },
    passingTD:           { label: 'Passing TD', group: 'Passing' },
    passingInt:          { label: 'Interception Thrown', group: 'Passing' },
    passing2pt:          { label: 'Passing 2-PT', group: 'Passing' },
    passingCompletions:  { label: 'Completion', group: 'Passing' },
    passingAttempts:     { label: 'Pass Attempt', group: 'Passing' },
    passing300Bonus:     { label: '300+ Yd Passing Bonus', group: 'Passing' },
    passing400Bonus:     { label: '400+ Yd Passing Bonus', group: 'Passing' },
    sacked:              { label: 'Sacked', group: 'Passing' },
    rushingYards:        { label: 'Rushing Yards (per yd)', group: 'Rushing' },
    rushingTD:           { label: 'Rushing TD', group: 'Rushing' },
    rushingAttempts:     { label: 'Rush Attempt', group: 'Rushing' },
    rushing2pt:          { label: 'Rushing 2-PT', group: 'Rushing' },
    rushing100Bonus:     { label: '100+ Yd Rushing Bonus', group: 'Rushing' },
    rushing200Bonus:     { label: '200+ Yd Rushing Bonus', group: 'Rushing' },
    receptions:          { label: 'Reception (PPR)', group: 'Receiving' },
    receivingYards:      { label: 'Receiving Yards (per yd)', group: 'Receiving' },
    receivingTD:         { label: 'Receiving TD', group: 'Receiving' },
    targets:             { label: 'Target', group: 'Receiving' },
    receiving2pt:        { label: 'Receiving 2-PT', group: 'Receiving' },
    receiving100Bonus:   { label: '100+ Yd Receiving Bonus', group: 'Receiving' },
    receiving200Bonus:   { label: '200+ Yd Receiving Bonus', group: 'Receiving' },
    fumbles:             { label: 'Fumble', group: 'Misc' },
    fumbleLost:          { label: 'Fumble Lost', group: 'Misc' },
    fumbleRecoveryTD:    { label: 'Fumble Recovery TD', group: 'Misc' },
    fgMade0_39:          { label: 'FG Made 0-39', group: 'Kicking' },
    fgMade40_49:         { label: 'FG Made 40-49', group: 'Kicking' },
    fgMade50plus:        { label: 'FG Made 50+', group: 'Kicking' },
    fgPointsPerYard:     { label: 'FG Points per Yard (overrides tiers if > 0)', group: 'Kicking' },
    fgMinPoints:         { label: 'FG Minimum Points (per made FG)', group: 'Kicking' },
    fgMissed:            { label: 'FG Missed', group: 'Kicking' },
    xpMade:              { label: 'Extra Point Made', group: 'Kicking' },
    xpMissed:            { label: 'Extra Point Missed', group: 'Kicking' },
    sack:                { label: 'Sack', group: 'Defense / ST' },
    interception:        { label: 'Interception', group: 'Defense / ST' },
    fumbleRecovery:      { label: 'Fumble Recovery', group: 'Defense / ST' },
    defensiveTD:         { label: 'Defensive TD', group: 'Defense / ST' },
    specialTeamsTD:      { label: 'Special Teams TD', group: 'Defense / ST' },
    safeties:            { label: 'Safety', group: 'Defense / ST' },
    blockedKick:         { label: 'Blocked Kick', group: 'Defense / ST' },
    ptsAllowed0:         { label: 'Points Allowed 0', group: 'Defense / ST' },
    ptsAllowed1_6:       { label: 'Points Allowed 1-6', group: 'Defense / ST' },
    ptsAllowed7_13:      { label: 'Points Allowed 7-13', group: 'Defense / ST' },
    ptsAllowed14_20:     { label: 'Points Allowed 14-20', group: 'Defense / ST' },
    ptsAllowed21_27:     { label: 'Points Allowed 21-27', group: 'Defense / ST' },
    ptsAllowed28_34:     { label: 'Points Allowed 28-34', group: 'Defense / ST' },
    ptsAllowed35plus:    { label: 'Points Allowed 35+', group: 'Defense / ST' },
    yardsAllowedUnder100:{ label: 'Yards Allowed <100', group: 'Defense / ST' },
    yardsAllowed100_199: { label: 'Yards Allowed 100-199', group: 'Defense / ST' },
    yardsAllowed350_399: { label: 'Yards Allowed 350-399', group: 'Defense / ST' },
    yardsAllowed400plus: { label: 'Yards Allowed 400+', group: 'Defense / ST' },
    // IDP (individual defenders) — used when defense mode is IDP.
    idpSoloTackle:       { label: 'Solo Tackle', group: 'IDP' },
    idpAssistTackle:     { label: 'Assisted Tackle', group: 'IDP' },
    idpSack:             { label: 'Sack (IDP)', group: 'IDP' },
    idpTackleForLoss:    { label: 'Tackle for Loss', group: 'IDP' },
    idpQbHit:            { label: 'QB Hit', group: 'IDP' },
    idpPassDefended:     { label: 'Pass Defended', group: 'IDP' },
    idpInterception:     { label: 'Interception (IDP)', group: 'IDP' },
    idpForcedFumble:     { label: 'Forced Fumble', group: 'IDP' },
    idpFumbleRecovery:   { label: 'Fumble Recovery (IDP)', group: 'IDP' },
    idpDefTD:            { label: 'Defensive TD (IDP)', group: 'IDP' },
    idpSafety:           { label: 'Safety (IDP)', group: 'IDP' },
  },
  NBA: {
    points:           { label: 'Point', group: 'Scoring' },
    threesMade:       { label: '3-Pointer Made', group: 'Scoring' },
    fieldGoalsMade:   { label: 'Field Goal Made', group: 'Scoring' },
    fieldGoalsMissed: { label: 'Field Goal Missed', group: 'Scoring' },
    freeThrowsMade:   { label: 'Free Throw Made', group: 'Scoring' },
    freeThrowsMissed: { label: 'Free Throw Missed', group: 'Scoring' },
    offRebounds:      { label: 'Offensive Rebound', group: 'Rebounding' },
    defRebounds:      { label: 'Defensive Rebound', group: 'Rebounding' },
    rebounds:         { label: 'Total Rebound', group: 'Rebounding' },
    assists:          { label: 'Assist', group: 'Playmaking' },
    steals:           { label: 'Steal', group: 'Defense' },
    blocks:           { label: 'Block', group: 'Defense' },
    turnovers:        { label: 'Turnover', group: 'Playmaking' },
    personalFouls:    { label: 'Personal Foul', group: 'Misc' },
    doubleDouble:     { label: 'Double-Double', group: 'Bonuses' },
    tripleDouble:     { label: 'Triple-Double', group: 'Bonuses' },
    minutes:          { label: 'Minute Played', group: 'Misc' },
  },
  NHL: {
    goals:         { label: 'Goal', group: 'Skater' },
    assists:       { label: 'Assist', group: 'Skater' },
    plusMinus:     { label: 'Plus / Minus', group: 'Skater' },
    penaltyMinutes:{ label: 'Penalty Minute', group: 'Skater' },
    shotsOnGoal:   { label: 'Shot on Goal', group: 'Skater' },
    ppGoals:       { label: 'Power Play Goal', group: 'Skater' },
    ppAssists:     { label: 'Power Play Assist', group: 'Skater' },
    shGoals:       { label: 'Short-Handed Goal', group: 'Skater' },
    shAssists:     { label: 'Short-Handed Assist', group: 'Skater' },
    gwGoals:       { label: 'Game-Winning Goal', group: 'Skater' },
    hits:          { label: 'Hit', group: 'Skater' },
    blockedShots:  { label: 'Blocked Shot', group: 'Skater' },
    faceoffsWon:   { label: 'Faceoff Won', group: 'Skater' },
    faceoffsLost:  { label: 'Faceoff Lost', group: 'Skater' },
    wins:          { label: 'Win', group: 'Goalie' },
    overtimeLoss:  { label: 'Overtime Loss', group: 'Goalie' },
    saves:         { label: 'Save', group: 'Goalie' },
    goalsAllowed:  { label: 'Goal Allowed', group: 'Goalie' },
    shutout:       { label: 'Shutout', group: 'Goalie' },
  },
  MLB: {
    runs:               { label: 'Run', group: 'Batting' },
    singles:            { label: 'Single', group: 'Batting' },
    doubles:            { label: 'Double', group: 'Batting' },
    triples:            { label: 'Triple', group: 'Batting' },
    homeRuns:           { label: 'Home Run', group: 'Batting' },
    rbi:                { label: 'RBI', group: 'Batting' },
    walks:              { label: 'Walk', group: 'Batting' },
    hbp:                { label: 'Hit By Pitch', group: 'Batting' },
    stolenBases:        { label: 'Stolen Base', group: 'Batting' },
    caughtStealing:     { label: 'Caught Stealing', group: 'Batting' },
    strikeoutsAsBatter: { label: 'Strikeout (Batter)', group: 'Batting' },
    sacFly:             { label: 'Sacrifice Fly', group: 'Batting' },
    inningsPitched:     { label: 'Inning Pitched', group: 'Pitching' },
    strikeoutsAsPitcher:{ label: 'Strikeout (Pitcher)', group: 'Pitching' },
    wins:               { label: 'Win', group: 'Pitching' },
    losses:             { label: 'Loss', group: 'Pitching' },
    earnedRunsAllowed:  { label: 'Earned Run Allowed', group: 'Pitching' },
    hitsAllowed:        { label: 'Hit Allowed', group: 'Pitching' },
    walksAllowed:       { label: 'Walk Allowed', group: 'Pitching' },
    saves:              { label: 'Save', group: 'Pitching' },
    holds:              { label: 'Hold', group: 'Pitching' },
    blownSaves:         { label: 'Blown Save', group: 'Pitching' },
    qualityStart:       { label: 'Quality Start', group: 'Pitching' },
    completeGame:       { label: 'Complete Game', group: 'Pitching' },
    shutoutPitching:    { label: 'Shutout', group: 'Pitching' },
    noHitter:           { label: 'No-Hitter', group: 'Pitching' },
    perfectGame:        { label: 'Perfect Game', group: 'Pitching' },
  },
}

// Humanize an unknown key as a fallback label (e.g. "passingYards" → "Passing Yards").
function humanize(key: string) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

export function statMeta(sport: string, key: string): StatMeta {
  return SCORING_CATEGORIES[sport]?.[key] ?? { label: humanize(key), group: 'Other' }
}

// Box-score / game-log stat columns per sport & position. Each column extracts
// (or derives) a value from a stat line, so the game log can show real columns.
type Col = { label: string; get: (s: Record<string, number>) => number }
const g = (k: string): Col['get'] => (s) => s[k] ?? 0

export function gameLogColumns(sport: string, position: string): Col[] {
  const C = (label: string, get: Col['get']): Col => ({ label, get })
  if (sport === 'NFL') {
    if (position === 'QB') return [C('Pass Yd', g('passingYards')), C('Pass TD', g('passingTD')), C('Int', g('passingInt')), C('Rush Yd', g('rushingYards')), C('Rush TD', g('rushingTD'))]
    if (position === 'RB') return [C('Rush Yd', g('rushingYards')), C('Rush TD', g('rushingTD')), C('Rec', g('receptions')), C('Rec Yd', g('receivingYards')), C('Rec TD', g('receivingTD'))]
    if (position === 'WR' || position === 'TE') return [C('Rec', g('receptions')), C('Tgt', g('targets')), C('Rec Yd', g('receivingYards')), C('Rec TD', g('receivingTD'))]
    if (position === 'K') return [C('FG <40', g('fgMade0_39')), C('FG 40s', g('fgMade40_49')), C('FG 50+', g('fgMade50plus')), C('XP', g('xpMade'))]
    return [C('Sack', g('sack')), C('Int', g('interception')), C('FR', g('fumbleRecovery')), C('Def TD', g('defensiveTD'))]
  }
  if (sport === 'NBA') return [C('PTS', g('points')), C('REB', s => (s.offRebounds ?? 0) + (s.defRebounds ?? 0)), C('AST', g('assists')), C('STL', g('steals')), C('BLK', g('blocks')), C('3PM', g('threesMade')), C('TO', g('turnovers'))]
  if (sport === 'NHL') {
    if (position === 'G') return [C('W', g('wins')), C('SV', g('saves')), C('GA', g('goalsAllowed')), C('SO', g('shutout')), C('OTL', g('overtimeLoss'))]
    return [C('G', g('goals')), C('A', g('assists')), C('SOG', g('shotsOnGoal')), C('+/-', g('plusMinus')), C('PIM', g('penaltyMinutes')), C('Hit', g('hits')), C('Blk', g('blockedShots'))]
  }
  if (sport === 'MLB') {
    if (position === 'SP' || position === 'RP') return [C('IP', g('inningsPitched')), C('K', g('strikeoutsAsPitcher')), C('ER', g('earnedRunsAllowed')), C('H', g('hitsAllowed')), C('BB', g('walksAllowed')), C('W', g('wins')), C('SV', g('saves'))]
    return [C('R', g('runs')), C('H', s => (s.singles ?? 0) + (s.doubles ?? 0) + (s.triples ?? 0) + (s.homeRuns ?? 0)), C('HR', g('homeRuns')), C('RBI', g('rbi')), C('BB', g('walks')), C('SB', g('stolenBases')), C('K', g('strikeoutsAsBatter'))]
  }
  return []
}

// Uniform box-score columns for a sport (aligned table across all players;
// off-position cells read 0, as in a real box score).
export function boxScoreColumns(sport: string): Col[] {
  const C = (label: string, get: Col['get']): Col => ({ label, get })
  if (sport === 'NFL') return [C('PaYd', g('passingYards')), C('PaTD', g('passingTD')), C('Int', g('passingInt')), C('RuYd', g('rushingYards')), C('RuTD', g('rushingTD')), C('Rec', g('receptions')), C('ReYd', g('receivingYards')), C('ReTD', g('receivingTD'))]
  if (sport === 'NBA') return [C('PTS', g('points')), C('REB', s => (s.offRebounds ?? 0) + (s.defRebounds ?? 0)), C('AST', g('assists')), C('STL', g('steals')), C('BLK', g('blocks')), C('3PM', g('threesMade')), C('TO', g('turnovers'))]
  if (sport === 'NHL') return [C('G', g('goals')), C('A', g('assists')), C('SOG', g('shotsOnGoal')), C('+/-', g('plusMinus')), C('Hit', g('hits')), C('Blk', g('blockedShots')), C('SV', g('saves')), C('GA', g('goalsAllowed'))]
  if (sport === 'MLB') return [C('R', g('runs')), C('H', s => (s.singles ?? 0) + (s.doubles ?? 0) + (s.triples ?? 0) + (s.homeRuns ?? 0)), C('HR', g('homeRuns')), C('RBI', g('rbi')), C('IP', g('inningsPitched')), C('K', s => (s.strikeoutsAsPitcher ?? 0) || (s.strikeoutsAsBatter ?? 0)), C('ER', g('earnedRunsAllowed'))]
  return []
}

// Group a sport's scoring entries into ordered { group, items[] } sections.
export function groupScoring(sport: string, scoring: Record<string, number>) {
  const groups: { group: string; items: { key: string; label: string; value: number }[] }[] = []
  const indexOf = (g: string) => groups.findIndex(x => x.group === g)
  for (const [key, value] of Object.entries(scoring)) {
    const meta = statMeta(sport, key)
    let gi = indexOf(meta.group)
    if (gi === -1) { groups.push({ group: meta.group, items: [] }); gi = groups.length - 1 }
    groups[gi].items.push({ key, label: meta.label, value })
  }
  return groups
}
