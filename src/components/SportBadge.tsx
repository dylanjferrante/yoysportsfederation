import { sportColor, sportEmoji } from '@/lib/utils'

export default function SportBadge({ sport, size = 'sm' }: { sport: string; size?: 'sm' | 'md' }) {
  const colors = sportColor(sport)
  return (
    <span className={`sport-badge ${colors.badge} ${size === 'md' ? 'text-sm px-3 py-1' : ''}`}>
      {sportEmoji(sport)} {sport}
    </span>
  )
}
