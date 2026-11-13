// One-line stat summaries for a player's period or day, from Fantrax's stat columns
// (fantrax_player_periods.stats). Zeroes are left out; nothing at all reads "—".
type S = Record<string, string>
const n = (s: S, k: string) => { const v = Number(s[k]); return Number.isFinite(v) ? v : 0 }
const join = (parts: (string | number | false | null | undefined)[]) => parts.filter(Boolean).join(', ')

function nfl(s: S, slot: string): string {
  if (slot === 'K' || 'FGM' in s || 'XP' in s) {
    return join([n(s, 'FGM') && `${n(s, 'FGM')} FG (${n(s, 'FGYd')} yds)`, n(s, 'XP') && `${n(s, 'XP')} XP`, n(s, 'XPM') && `${n(s, 'XPM')} XP missed`])
  }
  if (slot === 'DST' || 'YdA' in s) {
    return join([`${n(s, 'PA-Def')} PA`, `${n(s, 'YdA')} YdA`, n(s, 'Sk') && `${n(s, 'Sk')} Sk`, n(s, 'TA') && `${n(s, 'TA')} TO`, n(s, 'Sft') && `${n(s, 'Sft')} Sfty`, n(s, 'TDDST') && `${n(s, 'TDDST')} TD`])
  }
  // offense table: YDS/TD/Int/2Pa (passing) · YDS#8/TD#9 (rushing) · REC/YDS#11/TD#12/Tgt (receiving)
  const pass = join([n(s, 'YDS') && `${n(s, 'YDS')} PaYd`, n(s, 'TD') && `${n(s, 'TD')} PaTD`, n(s, 'Int') && `${n(s, 'Int')} Int`])
  const rush = join([n(s, 'YDS#8') && `${n(s, 'YDS#8')} RuYd`, n(s, 'TD#9') && `${n(s, 'TD#9')} RuTD`])
  const rec = join([n(s, 'REC') && `${n(s, 'REC')} Rec`, n(s, 'YDS#11') && `${n(s, 'YDS#11')} ReYd`, n(s, 'TD#12') && `${n(s, 'TD#12')} ReTD`])
  const misc = join([n(s, 'FL') && `${n(s, 'FL')} FL`, (n(s, '2Pa') + n(s, '2RR')) && `${n(s, '2Pa') + n(s, '2RR')} 2PT`])
  return [pass, rush, rec, misc].filter(Boolean).join(' · ')
}
function nhl(s: S): string {
  if ('SV' in s || 'GA' in s) {
    if (!n(s, 'GP') && !n(s, 'SV')) return ''
    return join([n(s, 'W') ? 'W' : n(s, 'OL+ShL') ? 'OTL' : 'L', `${n(s, 'SV')} SV`, `${n(s, 'GA')} GA`, n(s, 'SHO') && 'SO'])
  }
  return join([n(s, 'G') && `${n(s, 'G')} G`, n(s, 'A') && `${n(s, 'A')} A`, n(s, 'SOG') && `${n(s, 'SOG')} SOG`, n(s, 'PPP') && `${n(s, 'PPP')} PPP`, n(s, 'SHP') && `${n(s, 'SHP')} SHP`, n(s, 'Hit') && `${n(s, 'Hit')} Hit`, n(s, 'Blk') && `${n(s, 'Blk')} Blk`])
}
function nba(s: S): string {
  if (!n(s, 'GP') && !n(s, 'FGA') && !n(s, 'PTS')) return ''
  return join([`${n(s, 'PTS')} Pts`, n(s, 'REB') && `${n(s, 'REB')} Reb`, n(s, 'AST') && `${n(s, 'AST')} Ast`, n(s, 'ST') && `${n(s, 'ST')} Stl`, n(s, 'BLK') && `${n(s, 'BLK')} Blk`,
    `${n(s, 'FGM')}/${n(s, 'FGA')} FG`, n(s, '3PTM') && `${n(s, '3PTM')} 3PM`, n(s, 'FTA') && `${n(s, 'FTM')}/${n(s, 'FTA')} FT`, n(s, 'TO') && `${n(s, 'TO')} TO`])
}
function mlb(s: S): string {
  if ('IP' in s) {
    if (!Number(s.IP)) return ''
    return join([`${s.IP} IP`, `${n(s, 'H')} H`, `${n(s, 'ER')} ER`, n(s, 'BB') && `${n(s, 'BB')} BB`, `${n(s, 'K')} K`, n(s, 'W') && 'W', n(s, 'L') && 'L', n(s, 'SV') && 'SV', n(s, 'HLD') && 'HLD'])
  }
  if (!n(s, 'AB') && !n(s, 'BB')) return ''
  return join([`${n(s, 'H')}/${n(s, 'AB')}`, n(s, 'HR') && `${n(s, 'HR')} HR`, n(s, 'R') && `${n(s, 'R')} R`, n(s, 'RBI') && `${n(s, 'RBI')} RBI`, n(s, 'BB') && `${n(s, 'BB')} BB`, n(s, 'SB') && `${n(s, 'SB')} SB`, n(s, 'SO') && `${n(s, 'SO')} K`])
}

export function statLine(sport: string, slot: string, stats: S | null | undefined): string {
  if (!stats) return ''
  return sport === 'NFL' ? nfl(stats, slot) : sport === 'NHL' ? nhl(stats) : sport === 'NBA' ? nba(stats) : mlb(stats)
}

// Box-score columns by stat type: [label, key in the Fantrax stats]. Rows of different types
// (QB/RB/WR vs K vs D/ST, skaters vs goalies, hitters vs pitchers) carry their own header row.
export type StatType = { id: string; cols: [string, string][]; compact?: [string, string][] }
const T: Record<string, StatType> = {
  nfl: { id: 'nfl', cols: [['PaYd', 'YDS'], ['PaTD', 'TD'], ['Int', 'Int'], ['RuYd', 'YDS#8'], ['RuTD', 'TD#9'], ['Rec', 'REC'], ['ReYd', 'YDS#11'], ['ReTD', 'TD#12'], ['Tgt', 'Tgt'], ['FL', 'FL'], ['2PT', '2Pa+2RR']] },
  k: { id: 'k', cols: [['FGM', 'FGM'], ['FG Yds', 'FGYd'], ['XP', 'XP'], ['XP Miss', 'XPM']] },
  dst: { id: 'dst', cols: [['PA', 'PA-Def'], ['YdA', 'YdA'], ['Sk', 'Sk'], ['TO', 'TA'], ['Sfty', 'Sft'], ['TD', 'TDDST']] },
  skater: { id: 'skater', cols: [['G', 'G'], ['A', 'A'], ['SOG', 'SOG'], ['PPP', 'PPP'], ['SHP', 'SHP'], ['Hit', 'Hit'], ['Blk', 'Blk']] },
  goalie: { id: 'goalie', cols: [['W', 'W'], ['OTL', 'OL+ShL'], ['SV', 'SV'], ['GA', 'GA'], ['SO', 'SHO']] },
  nba: { id: 'nba', cols: [['PTS', 'PTS'], ['REB', 'REB'], ['AST', 'AST'], ['STL', 'ST'], ['BLK', 'BLK'], ['TO', 'TO'], ['FGM', 'FGM'], ['FGA', 'FGA'], ['3PM', '3PTM'], ['FTM', 'FTM'], ['FTA', 'FTA']] },
  hitter: { id: 'hitter', cols: [['AB', 'AB'], ['R', 'R'], ['H', 'H'], ['HR', 'HR'], ['RBI', 'RBI'], ['BB', 'BB'], ['K', 'SO'], ['SB', 'SB'], ['TB', 'TB']] },
  pitcher: { id: 'pitcher', cols: [['IP', 'IP'], ['K', 'K'], ['W', 'W'], ['L', 'L'], ['ER', 'ER'], ['H', 'H'], ['BB', 'BB'], ['SV', 'SV'], ['HLD', 'HLD']] },
}
export function statType(sport: string, slot: string, stats: S | null | undefined): StatType {
  const s = stats ?? {}
  if (sport === 'NFL') return slot === 'K' || 'FGM' in s || 'XP' in s ? T.k : slot === 'DST' || 'YdA' in s ? T.dst : T.nfl
  if (sport === 'NHL') return slot === 'G' || 'SV' in s || 'GA' in s ? T.goalie : T.skater
  if (sport === 'NBA') return T.nba
  return slot === 'SP' || slot === 'RP' || slot === 'P' || 'IP' in s ? T.pitcher : T.hitter
}
export function statCell(stats: S | null | undefined, key: string): string {
  if (!stats) return ''
  if (key.includes('+')) { const v = key.split('+').reduce((a, k) => a + n(stats, k), 0); return v ? String(v) : '0' }
  return stats[key] ?? ''
}
export const maxCols = (sport: string) => sport === 'NFL' ? T.nfl.cols.length : sport === 'NHL' ? T.skater.cols.length : sport === 'NBA' ? T.nba.cols.length : T.hitter.cols.length

// Head-to-head columns: the core of each stat type, so both clubs fit side by side.
const C2: Record<string, string[]> = { nfl: ['PaYd', 'PaTD', 'Int', 'RuYd', 'RuTD', 'Rec', 'ReYd', 'ReTD'], k: ['FGM', 'FG Yds', 'XP'], dst: ['PA', 'YdA', 'Sk', 'TO', 'TD'],
  skater: ['G', 'A', 'SOG', 'PPP', 'Hit', 'Blk'], goalie: ['W', 'SV', 'GA', 'SO'], nba: ['PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', '3PM'], hitter: ['AB', 'H', 'R', 'HR', 'RBI', 'SB'], pitcher: ['IP', 'K', 'ER', 'W', 'SV'] }
export const compactCols = (t: StatType): [string, string][] => (C2[t.id] ?? []).map(l => t.cols.find(c => c[0] === l)!).filter(Boolean)
export const maxCompact = (sport: string) => sport === 'NFL' ? 8 : sport === 'NHL' ? 6 : sport === 'NBA' ? 7 : 6
