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

// How a player's points were calculated, from the stat columns and the ySF rules (Fantrax's
// category weights). D/ST tiers come from the league's own tier settings.
type W = Record<string, [string, number]>   // column key → [label, points per unit]
const WEIGHTS: Record<string, W> = {
  nfl: { YDS: ['Pass yds', 0.04], TD: ['Pass TD', 4], Int: ['INT', -2], '2Pa': ['2-pt pass', 2], 'YDS#8': ['Rush yds', 0.1], 'TD#9': ['Rush TD', 6], REC: ['Rec', 0.5], 'YDS#11': ['Rec yds', 0.1], 'TD#12': ['Rec TD', 6], FL: ['Fumble lost', -2], FRTD: ['Fumble rec TD', 6], RtT: ['Return TD', 6], '2RR': ['2-pt run/catch', 2] },
  k: { FGYd: ['FG yds', 0.1], XP: ['XP', 1], XPM: ['XP missed', -1], FGM: ['FG missed', -1] },
  dst: { Sk: ['Sack', 1], TA: ['Takeaway', 2], TDDST: ['D/ST TD', 6], Sft: ['Safety', 2], XPB2P: ['Def 2-pt', 2] },
  skater: { G: ['Goal', 2], A: ['Assist', 1], SOG: ['SOG', 0.1], PPP: ['PPP', 0.5], SHP: ['SHP', 0.5], Hit: ['Hit', 0.1], Blk: ['Block', 0.5] },
  goalie: { W: ['Win', 4], 'OL+ShL': ['OT/SO loss', 1], SV: ['Save', 0.2], GA: ['Goal against', -2], SHO: ['Shutout', 3], G: ['Goal', 2], A: ['Assist', 1] },
  nba: { PTS: ['Pts', 1], REB: ['Reb', 1], AST: ['Ast', 2], ST: ['Stl', 4], BLK: ['Blk', 4], TO: ['TO', -2], '3PTM': ['3PM', 1], FGM: ['FGM', 2], FGA: ['FGA', -1], FTM: ['FTM', 1], FTA: ['FTA', -1] },
  hitter: { R: ['R', 1], HR: ['HR', 1], RBI: ['RBI', 1], BB: ['BB', 1], SO: ['K', -1], SB: ['SB', 1], CS: ['CS', -0.5], TB: ['TB', 1], XBH: ['XBH', 1], GIDP: ['GIDP', -1], CYC: ['Cycle', 15], AOF: ['OF assist', 2], E: ['Error', -1] },
  pitcher: { IP: ['IP', 3], K: ['K', 1], W: ['W', 3], L: ['L', -2], ER: ['ER', -1], H: ['H', -1], BB: ['BB', -1], HR: ['HR', -2], SV: ['SV', 5], HLD: ['HLD', 2], NH: ['No-hitter', 30], PG: ['Perfect game', 50], PKO: ['Pickoff', 1], E: ['Error', -1] },
}
const tier = (v: number, tiers: { min: number; max: number | null; points: number }[] | undefined) => (tiers ?? []).find(t => v >= t.min && (t.max == null || v <= t.max))?.points ?? 0
const ip = (s: string) => { const [w, f] = String(s).split('.'); return Number(w) + (Number(f || 0) / 3) }
export function breakdown(sport: string, slot: string, stats: S | null | undefined, rules?: Record<string, any>): { lines: string[]; total: number } {
  if (!stats) return { lines: [], total: 0 }
  const t = statType(sport, slot, stats), w = WEIGHTS[t.id] ?? {}
  const lines: string[] = []; let total = 0
  const fmt = (x: number) => +x.toFixed(2)
  for (const [k, [label, per]] of Object.entries(w)) {
    const v = k === 'IP' ? ip(stats[k] ?? '0') : n(stats, k)
    if (!v) continue
    const p = fmt(v * per); total += p
    lines.push(`${k === 'IP' ? stats[k] : v} ${label} × ${per} = ${p}`)
  }
  if (t.id === 'dst') {
    const pa = n(stats, 'PA-Def'), ya = n(stats, 'YdA')
    const pp = tier(pa, rules?.ptsAllowedTiers), yp = tier(ya, rules?.yardsAllowedTiers)
    lines.push(`${pa} points allowed → ${pp}`, `${ya} yards allowed → ${yp}`); total += pp + yp
  }
  return { lines, total: fmt(total) }
}
