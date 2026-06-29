import { type ClassValue, clsx } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

// Each sport has its own identity color: football green, basketball orange,
// hockey light blue, baseball red.
export const SPORT_META: Record<string, { emoji: string; color: string; bg: string; light: string; border: string; hex: string }> = {
  NFL: { emoji: '🏈', color: 'text-green-700', bg: 'bg-green-700', light: 'bg-green-50 text-green-700', border: 'border-green-700', hex: '#15803d' },
  NBA: { emoji: '🏀', color: 'text-orange-600', bg: 'bg-orange-500', light: 'bg-orange-50 text-orange-600', border: 'border-orange-500', hex: '#f97316' },
  NHL: { emoji: '🏒', color: 'text-sky-600', bg: 'bg-sky-500', light: 'bg-sky-50 text-sky-600', border: 'border-sky-500', hex: '#0ea5e9' },
  MLB: { emoji: '⚾', color: 'text-red-600', bg: 'bg-red-600', light: 'bg-red-50 text-red-600', border: 'border-red-600', hex: '#dc2626' },
}

export function sportMeta(sport: string) {
  return SPORT_META[sport] ?? { emoji: '🏆', color: 'text-slate-700', bg: 'bg-slate-700', light: 'bg-slate-50 text-slate-700', border: 'border-slate-700', hex: '#334155' }
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
  NBA: [10, 11, 12, 1, 2, 3, 4, 5, 6],
  NHL: [10, 11, 12, 1, 2, 3, 4, 5, 6],
  MLB: [3, 4, 5, 6, 7, 8, 9, 10],
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
