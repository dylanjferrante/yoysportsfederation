// yoy Sports Federation app config: which league the ySF shell points at, and its brand constants.
export const YSF_LEAGUE_ID = process.env.NEXT_PUBLIC_YSF_LEAGUE_ID || 'ysf'

export const YSF_LEAGUES = [
  { sport: 'NFL', code: 'ySFFL', key: 'fl', name: 'ySF Football League', color: '#177245' },
  { sport: 'NHL', code: 'ySFHL', key: 'hl', name: 'ySF Hockey League', color: '#6da7ee' },
  { sport: 'NBA', code: 'ySFBA', key: 'ba', name: 'ySF Basketball Association', color: '#e86100' },
  { sport: 'MLB', code: 'ySFLB', key: 'lb', name: 'ySF League Baseball', color: '#ba0c2f' },
] as const

export const YSF_ART = {
  wordmarkOnBlack: '/ysf/fed/wordmark_black.svg',
  primaryOnBlack: '/ysf/fed/primary_black.svg',
  primaryOnWhite: '/ysf/fed/primary_white.svg',
  cupSymbol: '/ysf/fed/cup_symbol.svg',
  leagueSymbol: (key: string, bg: 'white' | 'black' | 'color' = 'white') => `/ysf/leagues/${key}_symbol_${bg}.svg`,
  leagueLockup: (key: string, bg: 'white' | 'color' = 'white') => `/ysf/leagues/${key}_primary_${bg}.svg`,
  championship: (key: string) => `/ysf/champ/${key}.svg`,
}

/** Uppercase a display label but keep the lowercase y in ySF. */
export const U = (s: string) => s.toUpperCase().replace(/YSF/g, 'ySF')
