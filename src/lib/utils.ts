import { type ClassValue, clsx } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function sportColor(sport: string) {
  switch (sport) {
    case 'NFL': return { bg: 'bg-blue-900', text: 'text-blue-900', badge: 'bg-blue-900 text-white', border: 'border-blue-900', light: 'bg-blue-50 text-blue-900' }
    case 'NBA': return { bg: 'bg-red-700', text: 'text-red-700', badge: 'bg-red-700 text-white', border: 'border-red-700', light: 'bg-red-50 text-red-700' }
    case 'NHL': return { bg: 'bg-gray-900', text: 'text-gray-900', badge: 'bg-gray-900 text-white', border: 'border-gray-900', light: 'bg-gray-100 text-gray-900' }
    case 'MLB': return { bg: 'bg-blue-700', text: 'text-blue-700', badge: 'bg-blue-700 text-white', border: 'border-blue-700', light: 'bg-blue-50 text-blue-700' }
    default: return { bg: 'bg-slate-700', text: 'text-slate-700', badge: 'bg-slate-700 text-white', border: 'border-slate-700', light: 'bg-slate-50 text-slate-700' }
  }
}

export function sportEmoji(sport: string) {
  switch (sport) {
    case 'NFL': return '🏈'
    case 'NBA': return '🏀'
    case 'NHL': return '🏒'
    case 'MLB': return '⚾'
    default: return '🏆'
  }
}

export function formatPoints(pts: number) {
  return pts.toFixed(1)
}

export function tradeStatusColor(status: string) {
  switch (status) {
    case 'PENDING': return 'bg-yellow-100 text-yellow-800'
    case 'ACCEPTED': return 'bg-green-100 text-green-800'
    case 'REJECTED': return 'bg-red-100 text-red-800'
    case 'CANCELLED': return 'bg-gray-100 text-gray-600'
    default: return 'bg-gray-100 text-gray-600'
  }
}
