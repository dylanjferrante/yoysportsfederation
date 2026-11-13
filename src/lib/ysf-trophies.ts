// ySF championship names and marks, by league (scope) and season.
//   ySFFL → Supper Bowl [Roman numeral] (2025-26 = I) · ySFHL → The [year] Gordo's Cup Finals
//   ySFBA → The [year] Syllys · ySFLB → The [year] Simulation Series · OVERALL → [season] Federation Cup
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
export function trophyName(scope: string, season: string): string {
  const y0 = parseInt(season.slice(0, 4)) || 2025, y1 = y0 + 1
  switch (scope) {
    case 'NFL': return `Supper Bowl ${ROMAN[y0 - 2024] ?? y0 - 2024}`
    case 'NHL': return `${y1} Gordo’s Cup Finals`
    case 'NBA': return `${y1} Syllys`
    case 'MLB': return `${y1} Simulation Series`
    default: return `${season.replace('-', '–')} Federation Cup`
  }
}
// Each season's own championship marks (2025-26: Supper Bowl I and the 2026 finals; 2026-27: the current marks).
export function trophyArt(scope: string, season?: string): string {
  const k = ({ NFL: 'fl', NHL: 'hl', NBA: 'ba', MLB: 'lb' } as Record<string, string>)[scope]
  if (!k) return '/ysf/fed/cup_symbol.svg'
  return season === '2025-26' ? `/ysf/champ/2025-26/${k}.svg` : `/ysf/champ/${k}.svg`
}
