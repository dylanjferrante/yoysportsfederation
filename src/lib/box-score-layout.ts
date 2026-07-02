// Position-grouped box-score layout. Instead of one uniform column set per sport
// (where a QB row has empty receiving cells and a WR has empty passing cells),
// each sport is split into position groups — Quarterbacks, Runners & Receivers,
// Kickers, Defense; NHL Skaters/Goalies; MLB Batters/Pitchers; NBA one group —
// and each group gets columns relevant to it. Client-safe (pure data + accessors).

import type { Stats } from './scoring'

// A column extracts a display value (number for stats, string for composites like
// "24/34") from a stat line.
export type BoxCol = { label: string; get: (s: Stats) => string | number }
// A group matches a set of roster positions; an empty `positions` array is the
// catch-all bucket for anything not matched above it.
export type BoxGroup = { title: string; positions: string[]; cols: BoxCol[] }

const n = (s: Stats, k: string) => +(s[k] ?? 0)
const col = (label: string, get: BoxCol['get']): BoxCol => ({ label, get })
const stat = (label: string, key: string): BoxCol => col(label, s => n(s, key))

// NFL field goals: made counts live either in distance tiers or per-kick fgDist<N>
// keys (per-yard scoring mode); attempts = made + missed.
const fgMade = (s: Stats) => n(s, 'fgMade0_39') + n(s, 'fgMade40_49') + n(s, 'fgMade50plus') + Object.entries(s).reduce((a, [k, v]) => a + (/^fgDist\d+$/.test(k) ? v : 0), 0)

const PA_TIERS: [string, string][] = [
  ['ptsAllowed0', '0'], ['ptsAllowed1_6', '1-6'], ['ptsAllowed7_13', '7-13'],
  ['ptsAllowed14_20', '14-20'], ['ptsAllowed21_27', '21-27'], ['ptsAllowed28_34', '28-34'], ['ptsAllowed35plus', '35+'],
]

const GROUPS: Record<string, BoxGroup[]> = {
  NFL: [
    { title: 'Quarterbacks', positions: ['QB'], cols: [
      col('Cmp/Att', s => `${n(s, 'passingCompletions')}/${n(s, 'passingAttempts')}`),
      stat('Pass Yd', 'passingYards'), stat('TD', 'passingTD'), stat('Int', 'passingInt'),
      stat('Ru Yd', 'rushingYards'), stat('Ru TD', 'rushingTD'),
    ] },
    { title: 'Runners & Receivers', positions: ['RB', 'FB', 'WR', 'TE'], cols: [
      stat('Car', 'rushingAttempts'), stat('Ru Yd', 'rushingYards'),
      stat('Rec', 'receptions'), stat('Rec Yd', 'receivingYards'),
      col('TD', s => n(s, 'rushingTD') + n(s, 'receivingTD')),
    ] },
    { title: 'Kickers', positions: ['K', 'PK'], cols: [
      col('FG', s => `${fgMade(s)}/${fgMade(s) + n(s, 'fgMissed')}`),
      col('XP', s => `${n(s, 'xpMade')}/${n(s, 'xpMade') + n(s, 'xpMissed')}`),
    ] },
    { title: 'Defense / ST', positions: ['DEF', 'DST', 'D/ST'], cols: [
      stat('Sack', 'sack'), stat('Int', 'interception'), stat('FR', 'fumbleRecovery'),
      col('TD', s => n(s, 'defensiveTD') + n(s, 'specialTeamsTD')),
      col('PA', s => { const t = PA_TIERS.find(([k]) => n(s, k) > 0); return t ? t[1] : '—' }),
    ] },
    { title: 'Defenders (IDP)', positions: ['DL', 'LB', 'DB', 'CB', 'S', 'EDGE', 'DE', 'DT'], cols: [
      col('Tkl', s => n(s, 'idpSoloTackle') + n(s, 'idpAssistTackle')),
      stat('Sack', 'idpSack'), stat('Int', 'idpInterception'),
      stat('FF', 'idpForcedFumble'), stat('TD', 'idpDefTD'),
    ] },
  ],
  NBA: [
    { title: 'Players', positions: [], cols: [
      stat('Pts', 'points'),
      col('Reb', s => n(s, 'rebounds') || n(s, 'offRebounds') + n(s, 'defRebounds')),
      stat('Ast', 'assists'), stat('Stl', 'steals'), stat('Blk', 'blocks'),
      stat('TO', 'turnovers'), stat('3PM', 'threesMade'), stat('Min', 'minutes'),
    ] },
  ],
  NHL: [
    { title: 'Goalies', positions: ['G'], cols: [
      stat('W', 'wins'), stat('SV', 'saves'), stat('GA', 'goalsAllowed'), stat('SO', 'shutout'), stat('OTL', 'overtimeLoss'),
    ] },
    { title: 'Skaters', positions: [], cols: [
      stat('G', 'goals'), stat('A', 'assists'), col('+/-', s => n(s, 'plusMinus')),
      stat('SOG', 'shotsOnGoal'), col('PPP', s => n(s, 'ppGoals') + n(s, 'ppAssists')),
      stat('Hit', 'hits'), stat('Blk', 'blockedShots'),
    ] },
  ],
  MLB: [
    { title: 'Pitchers', positions: ['SP', 'RP', 'P'], cols: [
      stat('IP', 'inningsPitched'), stat('K', 'strikeoutsAsPitcher'), stat('W', 'wins'),
      stat('ER', 'earnedRunsAllowed'), stat('H', 'hitsAllowed'), stat('BB', 'walksAllowed'), stat('SV', 'saves'),
    ] },
    { title: 'Batters', positions: [], cols: [
      stat('R', 'runs'),
      col('H', s => n(s, 'singles') + n(s, 'doubles') + n(s, 'triples') + n(s, 'homeRuns')),
      stat('HR', 'homeRuns'), stat('RBI', 'rbi'), stat('BB', 'walks'),
      stat('SB', 'stolenBases'), stat('K', 'strikeoutsAsBatter'),
    ] },
  ],
}

export function positionGroups(sport: string): BoxGroup[] {
  return GROUPS[sport] ?? [{ title: 'Players', positions: [], cols: [] }]
}

// Assign a roster position to the first group that lists it; an empty-positions
// group is the catch-all. Returns the group index, or the last group as fallback.
export function groupIndexFor(groups: BoxGroup[], position: string): number {
  const i = groups.findIndex(g => g.positions.length === 0 || g.positions.includes(position))
  return i === -1 ? groups.length - 1 : i
}
