import { sportMeta } from '@/lib/utils'
import SportIcon from '@/components/SportIcon'

type ColorMap = Record<string, { p?: string; s?: string }>

export const sportHex = (sport: string, colors: ColorMap = {}) => colors[sport]?.p || sportMeta(sport).hex

// The sport's division logo (or emoji fallback) on a chip filled with the sport's color.
export default function SportChip({ sport, logos = {}, colors = {}, size = 16, chip = 22 }: {
  sport: string; logos?: Record<string, string>; colors?: ColorMap; size?: number; chip?: number
}) {
  return (
    <span className="inline-flex items-center justify-center rounded flex-shrink-0 align-middle" style={{ width: chip, height: chip, background: sportHex(sport, colors) }}>
      <SportIcon sport={sport} logo={logos[sport]} size={size} />
    </span>
  )
}
