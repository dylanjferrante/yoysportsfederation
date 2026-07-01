import Link from 'next/link'

export type TeamLike = {
  id?: string
  name: string
  abbreviation?: string | null
  logo?: string | null
  primaryColor?: string | null
  secondaryColor?: string | null
  logoBg?: boolean | null
}

// A franchise badge: a box filled in the team's primary color, with its logo and
// name rendered in the secondary color. Used across scores and playoff brackets
// so franchises read consistently. PNG/SVG logos can optionally sit on a
// primary-color background (the per-team `logoBg` option).
export default function TeamChip({
  team, size = 'md', useAbbr = false, link = true, className = '',
}: {
  team: TeamLike
  size?: 'sm' | 'md' | 'lg'
  useAbbr?: boolean
  link?: boolean
  className?: string
}) {
  const primary = team.primaryColor || '#0f172a'
  const secondary = team.secondaryColor || '#e2e8f0'
  const dim = size === 'lg' ? 'w-9 h-9' : size === 'sm' ? 'w-5 h-5' : 'w-7 h-7'
  const text = size === 'lg' ? 'text-base' : size === 'sm' ? 'text-xs' : 'text-sm'
  const label = useAbbr ? (team.abbreviation || team.name) : team.name

  const inner = (
    <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-md max-w-full ${className}`} style={{ background: primary }}>
      {team.logo
        ? <img src={team.logo} alt="" className={`${dim} object-contain flex-shrink-0`} style={team.logoBg ? { background: primary } : undefined} />
        : <span className={`${dim} flex items-center justify-center text-[9px] font-bold flex-shrink-0`} style={{ background: secondary, color: primary }}>{(team.abbreviation || team.name || '?').slice(0, 3).toUpperCase()}</span>}
      <span className={`font-semibold truncate ${text}`} style={{ color: secondary }}>{label}</span>
    </span>
  )

  if (link && team.id) return <Link href={`/teams/${team.id}`} className="inline-flex max-w-full hover:opacity-90">{inner}</Link>
  return inner
}
