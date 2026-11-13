import { type ClassValue, clsx } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

// Each sport has its own identity color: football green, basketball orange,
// hockey light blue, baseball red.
export const SPORT_META: Record<string, { emoji: string; color: string; bg: string; light: string; border: string; hex: string }> = {
  // ySF league colors (ySFFL / ySFHL / ySFBA / ySFLB); no emoji — pages show the league symbol or code
  NFL: { emoji: '', color: 'text-[#177245]', bg: 'bg-[#177245]', light: 'bg-[#177245] text-white', border: 'border-[#177245]', hex: '#177245' },
  NBA: { emoji: '', color: 'text-[#e86100]', bg: 'bg-[#e86100]', light: 'bg-[#e86100] text-white', border: 'border-[#e86100]', hex: '#e86100' },
  NHL: { emoji: '', color: 'text-[#6da7ee]', bg: 'bg-[#6da7ee]', light: 'bg-[#6da7ee] text-white', border: 'border-[#6da7ee]', hex: '#6da7ee' },
  MLB: { emoji: '', color: 'text-[#ba0c2f]', bg: 'bg-[#ba0c2f]', light: 'bg-[#ba0c2f] text-white', border: 'border-[#ba0c2f]', hex: '#ba0c2f' },
}

export function sportMeta(sport: string) {
  return SPORT_META[sport] ?? { emoji: '', color: 'text-black', bg: 'bg-black', light: 'bg-black text-white', border: 'border-black', hex: '#000000' }
}

export function tradeStatusClass(status: string) {
  switch (status) {
    case 'PENDING':   return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    case 'ACCEPTED':  return 'bg-green-100 text-green-800 border-green-200'
    case 'REJECTED':  return 'bg-red-100 text-red-800 border-red-200'
    case 'CANCELLED': return 'bg-gray-100 text-gray-600 border-gray-200'
    case 'VETOED':    return 'bg-orange-100 text-orange-800 border-orange-200'
    default: return 'bg-gray-100 text-gray-600'
  }
}

export function formatPts(n: number) {
  return n.toFixed(1)
}

// ── Cross-sport value ────────────────────────────────────────────────────────
// Raw fantasy points aren't comparable across sports (an NBA player scores far
// more per game than an NHL one). Dividing projected points by a per-sport
// scale and rescaling to ~0–100 yields a single number that ranks players
// fairly across all four sports. Used by free-agent ranking, trades, compare.
// Per-sport scale so each sport's elite projection lands at a comparable value
// (~115). MLB projections run far hotter at the top than NHL, so it needs a
// larger divisor — otherwise a few star hitters/pitchers dominate the rankings.
export const SPORT_NORM: Record<string, number> = { NFL: 12, NBA: 24, NHL: 8, MLB: 18 }

export function crossSportValue(sport: string, projectedPoints: number | null | undefined): number {
  return Math.round(((projectedPoints ?? 0) / (SPORT_NORM[sport] ?? 15)) * 50)
}

// A league may rename its sports (call NFL anything). Falls back to the code.
export function sportLabel(sport: string, names?: Record<string, string> | null): string {
  const n = names?.[sport]
  return n && n.trim() ? n : sport
}

// Short code for menus / logs / draft tiles — custom abbreviation or the sport key.
export function sportAbbrLabel(sport: string, abbr?: Record<string, string> | null): string {
  const a = abbr?.[sport]
  return a && a.trim() ? a : sport
}

// Sports follow a fixed seasonal cycle (football → hockey → basketball → baseball).
// A league's display order rotates that cycle to start at its season-start anchor.
const SPORT_CYCLE = ['NFL', 'NHL', 'NBA', 'MLB']
const SEASON_START_LEAD: Record<string, string> = { FOOTBALL: 'NFL', WINTER: 'NHL', BASEBALL: 'MLB' }
export function orderedSports(enabled: string[], seasonStart?: string | null): string[] {
  const lead = SEASON_START_LEAD[seasonStart ?? 'FOOTBALL'] ?? 'NFL'
  const start = Math.max(0, SPORT_CYCLE.indexOf(lead))
  const rotated = [...SPORT_CYCLE.slice(start), ...SPORT_CYCLE.slice(0, start)]
  const inCycle = rotated.filter(s => enabled.includes(s))
  // Preserve any non-standard sports at the end, just in case.
  const extras = enabled.filter(s => !SPORT_CYCLE.includes(s))
  return [...inCycle, ...extras]
}

export function waiverTypeLabel(t: string) {
  if (t === 'FAAB') return 'FAAB Bidding'
  if (t === 'PRIORITY') return 'Waiver Priority'
  return 'Free Agent'
}

export function draftTypeLabel(t: string) {
  if (t === 'AUCTION') return 'Auction'
  if (t === 'LINEAR') return 'Linear'
  return 'Snake'
}

export function safeParse<T = any>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try { return JSON.parse(s) as T } catch { return fallback }
}

// Real-calendar months each sport is in season (1 = Jan … 12 = Dec).
const SPORT_MONTHS: Record<string, number[]> = {
  NFL: [9, 10, 11, 12, 1],
  NBA: [10, 11, 12, 1, 2, 3, 4],
  NHL: [10, 11, 12, 1, 2, 3, 4],
  MLB: [4, 5, 6, 7, 8, 9],
}

// Which enabled sports are "in season" right now (by real calendar month).
export function inSeasonNow(sportsEnabled: string[], now: Date = new Date()): string[] {
  const m = now.getMonth() + 1
  return sportsEnabled.filter(s => SPORT_MONTHS[s]?.includes(m))
}

// Best logo image URL for a sport division: division logo → league logo → ''.
export function divisionLogo(
  divisionLogos: Record<string, string> | string | null | undefined,
  sport: string,
  fallbackUrl?: string | null,
): string {
  const map = typeof divisionLogos === 'string' ? safeParse<Record<string, string>>(divisionLogos, {}) : (divisionLogos ?? {})
  return (map?.[sport]?.trim()) || (fallbackUrl?.trim?.() ?? '') || ''
}
