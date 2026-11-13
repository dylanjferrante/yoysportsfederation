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
