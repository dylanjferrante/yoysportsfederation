import { sportMeta } from '@/lib/utils'

export default function SportBadge({ sport, size = 'sm' }: { sport: string; size?: 'sm' | 'md' }) {
  const m = sportMeta(sport)
  return (
    <span className={`inline-flex items-center gap-1 font-semibold rounded-full px-2 py-0.5 ${m.light} ${size === 'md' ? 'text-sm px-3 py-1' : 'text-xs'}`}>
      {m.emoji} {sport}
    </span>
  )
}
