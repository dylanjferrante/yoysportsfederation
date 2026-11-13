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

// Today's date in US Eastern time (the Federation's clock), YYYY-MM-DD
export const etToday = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

// Injury designations (ESPN / Tank01 / the league's platform) → short tags shown next to player names
export const isInjured = (status?: string | null) => !!status && !/^(active|healthy)$/i.test(status.trim())
export function injTag(status?: string | null): string | null {
  if (!isInjured(status)) return null
  const x = status!.toLowerCase().replace(/[-_]/g, ' ').trim()
  const il = /^(\d+) day il$/.exec(x); if (il) return `IL${il[1]}`
  return ({ out: 'O', questionable: 'Q', doubtful: 'D', probable: 'P', 'day to day': 'DTD', dtd: 'DTD', 'injured reserve': 'IR', ir: 'IR', ltir: 'LTIR',
    suspension: 'SUSP', suspended: 'SUSP', pup: 'PUP', nfi: 'NFI', 'not injury related': 'NIR' } as Record<string, string>)[x] ?? 'INJ'
}

// Text on a club's primary colour is the club's secondary (KMU navy on light blue, SSU red on
// orange), unless the two are too close to read (AAC, OYSC, RC) — then white.
const lum = (hex: string) => {
  const h = hex.replace('#', ''); if (h.length !== 6) return 0
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = [0, 2, 4].map(i => f(parseInt(h.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
export function clubInk(primary: string | null | undefined, secondary: string | null | undefined): string {
  if (!primary || !secondary || secondary.toLowerCase() === primary.toLowerCase()) return '#FFFFFF'
  // the club's secondary colour unless it all but disappears on the primary (RC's red on navy)
  return contrast(primary, secondary) >= 1.8 ? secondary : '#FFFFFF'
}
