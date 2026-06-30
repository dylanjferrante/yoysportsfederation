import { sportMeta } from '@/lib/utils'

// Renders a sport's division logo when the commissioner has set one, otherwise the
// sport emoji. When `bg` + `primary` are given the logo sits on the sport's primary
// color (parity with team logo backgrounds). Images are never rounded.
export default function SportIcon({ sport, logo, bg, primary, size = 18, className = '' }: {
  sport: string
  logo?: string | null
  bg?: boolean
  primary?: string | null
  size?: number
  className?: string
}) {
  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        className={`object-contain inline-block align-middle flex-shrink-0 ${className}`}
        style={{ width: size, height: size, ...(bg && primary ? { background: primary } : {}) }}
      />
    )
  }
  return <span className={className} style={{ fontSize: Math.round(size * 0.9), lineHeight: 1 }}>{sportMeta(sport).emoji}</span>
}
