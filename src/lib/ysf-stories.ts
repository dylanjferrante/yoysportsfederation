// The ySF "newsroom": lead story, headlines and report sections written from live standings,
// moves and results. Shared by Home, Matchday, the Federation Report and the bottom ticker.
import { YSF_LEAGUES } from '@/lib/ysf'
import type { CupRow, LeagueRow, ClubInfo, MoveRow, TradeRow } from '@/lib/ysf-data'

const NOUN: Record<string, string> = { NFL: 'football', NHL: 'hockey', NBA: 'basketball', MLB: 'baseball' }
const FLAVOR: Record<string, string> = { NFL: 'owns the gridiron', NHL: 'owns the ice', NBA: 'owns the court', MLB: 'owns the diamond' }
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth']
export const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
const WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
export const pct = (x: number) => (x * 100 >= 99.95 ? '>99.9' : x > 0 && x < 0.001 ? '<0.1' : (x * 100).toFixed(1)) + '%'
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const list = (a: string[]) => a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`
const num = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export type Headline = { topic: string; sport?: string; clubs: string[]; title: string; dek: string }
export type Section = { topic: string; sport?: string; clubs: string[]; body: string }

export function writeStories(s: { clubs: Record<string, ClubInfo>; cup: CupRow[]; tables: Record<string, LeagueRow[]>; live: string[] }, extra?: { moves?: MoveRow[]; trades?: TradeRow[] }) {
  const C = s.clubs, ab = (id: string) => C[id]?.abbreviation ?? ''
  const live = s.live, lead = s.cup[0], second = s.cup[1]
  const code = (sp: string) => YSF_LEAGUES.find(l => l.sport === sp)!.code

  // lead story
  const gap = lead.pts - second.pts
  const headline = gap > 0
    ? `${ab(lead.teamId)} holds a ${WORD[gap] ?? gap}-point Cup lead${live.includes('MLB') ? '' : ' with ySFLB still to come'}`
    : `${ab(lead.teamId)} and ${ab(second.teamId)} share the Cup lead`
  const byRank = new Map<number, string[]>()
  for (const sp of live) { const r = lead.ranks[sp]; if (r != null) byRank.set(r, [...(byRank.get(r) ?? []), NOUN[sp]]) }
  const rankBits = [...byRank.entries()].sort((a, b) => a[0] - b[0]).map(([r, ns]) => `${ORD[r] ?? ord(r)} in ${list(ns)}`)
  const byOdds = [...s.cup].sort((a, b) => b.cupPct - a.cupPct)
  const rival = byOdds.find(r => r.teamId !== lead.teamId)!
  const dek = `${C[lead.teamId]?.name} is ${list(rankBits)}, and ${lead.rec} across the ${WORD[live.length] ?? live.length}. The model gives ${ab(lead.teamId)} a ${pct(lead.cupPct)} chance to win the Cup; nobody else is above ${pct(rival.cupPct)}.`

  // headlines
  const heads: Headline[] = []
  const [o2, o3] = [byOdds[1], byOdds[2]]
  heads.push({ topic: 'CUP RACE', clubs: [o2.teamId, o3.teamId],
    title: Math.abs(o2.exp - o3.exp) < 0.6 ? `${ab(o2.teamId)} and ${ab(o3.teamId)} both project to ${o2.exp.toFixed(1)}` : `${ab(o2.teamId)} and ${ab(o3.teamId)} chase ${ab(byOdds[0].teamId)}`,
    dek: `Second place is close: ${C[o2.teamId]?.name} at ${pct(o2.cupPct)} to win the Cup, ${C[o3.teamId]?.name} at ${pct(o3.cupPct)}.` })
  for (const sp of live) {
    const top = s.tables[sp][0]
    if (!top || top.teamId === lead.teamId) continue
    const row = s.cup.find(r => r.teamId === top.teamId)!
    heads.push({ topic: code(sp), sport: sp, clubs: [top.teamId], title: `${C[top.teamId]?.name} ${FLAVOR[sp]}`,
      dek: `First in ${NOUN[sp]} at ${top.rec}, and ${row.rec} overall — ${ord(row.rk)} in the Cup table.` })
    break
  }
  const split = s.cup.map(r => { const rs = live.map(sp => ({ sp, r: r.ranks[sp] ?? 0 })).sort((a, b) => a.r - b.r); return { r, best: rs[0], worst: rs[rs.length - 1] } })
    .sort((a, b) => (b.worst.r - b.best.r) - (a.worst.r - a.best.r))[0]
  if (split && split.worst.r - split.best.r >= 5) heads.push({ topic: code(split.best.sp), sport: split.best.sp, clubs: [split.r.teamId],
    title: `${ab(split.r.teamId)}: ${ord(split.best.r)} in ${NOUN[split.best.sp]}, ${ord(split.worst.r)} in ${NOUN[split.worst.sp]}`,
    dek: `The widest split in the Federation leaves ${ab(split.r.teamId)} at ${pct(split.r.cupPct)} to win the Cup.` })
  const oddsRank = new Map(byOdds.map((r, i) => [r.teamId, i + 1]))
  const fav = s.cup.map(r => ({ r, d: r.rk - (oddsRank.get(r.teamId) ?? r.rk) })).sort((a, b) => b.d - a.d)[0]
  if (fav && fav.d > 0) heads.push({ topic: 'THE MODEL', clubs: [fav.r.teamId], title: `The model likes ${ab(fav.r.teamId)} more than the table does`,
    dek: `${cap(ord(fav.r.rk))} on points, but ${ord(oddsRank.get(fav.r.teamId)!)} on Cup odds at ${pct(fav.r.cupPct)}.` })
  const bottom = s.cup.slice(-2)
  heads.push({ topic: 'BASEMENT', clubs: bottom.map(r => r.teamId), title: `${ab(bottom[0].teamId)} and ${ab(bottom[1].teamId)} need a run`,
    dek: `${bottom.map(r => `${ab(r.teamId)} ${r.pts} pts (${r.rec})`).join(' · ')}${live.includes('MLB') ? '' : ', with ySFLB still to play'}.` })

  // report sections
  const sections: Section[] = []
  const exp2 = byOdds[1], exp3 = byOdds[2]
  sections.push({ topic: 'THE CUP RACE', clubs: [lead.teamId, exp2.teamId, exp3.teamId],
    body: `${C[lead.teamId]?.name} leads with ${lead.pts} Cup points and a ${pct(lead.cupPct)} chance to win it. ${C[exp2.teamId]?.name} (${pct(exp2.cupPct)}, ${exp2.exp.toFixed(1)} projected points) and ${C[exp3.teamId]?.name} (${pct(exp3.cupPct)}, ${exp3.exp.toFixed(1)}) chase.${fav && fav.d > 0 ? ` ${ab(fav.r.teamId)} sits ${ord(fav.r.rk)} on points but ${ord(oddsRank.get(fav.r.teamId)!)} on odds at ${pct(fav.r.cupPct)}.` : ''}` })
  for (const sp of live) {
    const t = s.tables[sp]; if (!t?.length) continue
    const [a, b] = t
    const unbeaten = t.filter(r => r.l === 0 && r.w > 0), winless = t.filter(r => r.w === 0 && r.l > 0)
    const top3 = [...t].sort((x, y) => y.pf - x.pf).slice(0, 3)
    let body = `${C[a.teamId]?.name} leads at ${a.rec}${b ? `, with ${ab(b.teamId)} ${b.gb ? `${b.gb.toFixed(1)} back` : 'level'} at ${b.rec}` : ''}.`
    if (unbeaten.length === 1 && unbeaten[0].teamId === a.teamId) body += ` ${ab(a.teamId)} is the last unbeaten club in ${NOUN[sp]}.`
    if (winless.length) body += ` Still winless: ${winless.map(r => ab(r.teamId)).join(', ')}.`
    body += ` Most points: ${top3.map(r => `${ab(r.teamId)} ${num(r.pf)}`).join(', ')}.`
    sections.push({ topic: code(sp), sport: sp, clubs: [a.teamId], body })
  }
  if (extra?.trades?.length || extra?.moves?.length) {
    const tr = extra.trades ?? []
    const bigBid = (extra.moves ?? []).filter(m => m.bid != null).sort((a, b) => (b.bid ?? 0) - (a.bid ?? 0))[0]
    const trText = tr.slice(0, 2).map(t => t.sides.map(sd => `${ab(sd.teamId)} got ${list(sd.gets.map(g => g.name))}`).join('; ')).join('. ')
    sections.push({ topic: 'MOVES', clubs: [...new Set(tr.slice(0, 2).flatMap(t => t.sides.map(sd => sd.teamId)))],
      body: `${tr.length ? `${tr.length} trade${tr.length === 1 ? '' : 's'} this season. ${trText}.` : ''}${bigBid ? ` The top FAAB bid: ${ab(bigBid.teamId)}'s $${bigBid.bid} for ${bigBid.player} (${code(bigBid.sport)}-${bigBid.team}, ${bigBid.pos}).` : ''}`.trim() })
  }
  return { headline, dek, heads, sections }
}
