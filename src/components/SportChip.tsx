import { sportMeta } from '@/lib/utils'
import SportIcon from '@/components/SportIcon'

type ColorMap = Record<string, { p?: string; s?: string }>

export const sportHex = (sport: string, colors: ColorMap = {}) => colors[sport]?.p || sportMeta(sport).hex

// A league's symbol. When the league has its own artwork (logos = the variant made for white),
// the symbol sits directly on the page — no colored tile or ring around it — centered in its box.
// Without artwork, falls back to the sport icon on a sport-colored tile.
export default function SportChip({ sport, logos = {}, altLogos = {}, colors = {}, size = 16, chip = 22, onColor = false }: {
  sport: string; logos?: Record<string, string>; altLogos?: Record<string, string>; colors?: ColorMap; size?: number; chip?: number; onColor?: boolean
}) {
  const bare = onColor ? altLogos[sport] : logos[sport]
  if (bare) {
    return (
      <span className="inline-flex items-center justify-center flex-shrink-0 align-middle" style={{ width: chip, height: chip }}>
        <img src={bare} alt="" style={{ width: chip, height: chip, objectFit: 'contain' }} />
      </span>
    )
  }
  return (
    <span className="inline-flex items-center justify-center rounded flex-shrink-0 align-middle" style={{ width: chip, height: chip, background: sportHex(sport, colors) }}>
      <SportIcon sport={sport} logo={altLogos[sport] || logos[sport]} size={size} />
    </span>
  )
}
