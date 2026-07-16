import { sportMeta } from '@/lib/utils'
import SportIcon from '@/components/SportIcon'

type ColorMap = Record<string, { p?: string; s?: string }>

export const sportHex = (sport: string, colors: ColorMap = {}) => colors[sport]?.p || sportMeta(sport).hex

export default function SportChip({ sport, logos = {}, altLogos = {}, colors = {}, size = 16, chip = 22 }: {
  sport: string; logos?: Record<string, string>; altLogos?: Record<string, string>; colors?: ColorMap; size?: number; chip?: number
}) {
  return (
    <span className="inline-flex items-center justify-center rounded flex-shrink-0 align-middle" style={{ width: chip, height: chip, background: sportHex(sport, colors) }}>
      <SportIcon sport={sport} logo={altLogos[sport] || logos[sport]} size={size} />
    </span>
  )
}
