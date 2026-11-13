// Trades as Moves-table rows: one TRADED row per player or pick a club received.
// Plain module (no server imports) so both server pages and client views can use it.
export type TradeLike = { id: string; when: string; sides: { teamId: string; gets: { name: string; sport: string; team: string; pos: string }[] }[]; season?: string }
// "Pick 215 (18.11)" in 2025-26 trades = a pick in the 2025 Federation Draft
export const assetName = (g: { name: string; sport: string }) => { const m = /^Pick (\d+) \((\d+\.\d+)\)$/.exec(g.name); return m ? `2025 Federation Draft pick ${m[2]} (#${m[1]})` : g.name }
export function tradeRows(trades: TradeLike[]) {
  return trades.flatMap(t => t.sides.flatMap(sd => {
    const from = t.sides.find(o => o.teamId !== sd.teamId)?.teamId
    return sd.gets.map((g, i) => {
      const pick = /^Pick \d+/.test(g.name) || !g.team
      return { id: `${t.id}-${sd.teamId}-${i}`, when: t.when, sport: g.sport, teamId: sd.teamId, kind: 'TRADED', player: pick ? '' : g.name, team: g.team, pos: g.pos, bid: null as number | null, text: assetName(g), season: t.season, from }
    })
  }))
}
