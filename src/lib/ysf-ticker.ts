// The ySF bottom crawl, built from live data: a FEDERATION block (Cup odds, the lead story,
// trades, what's next) and one block per live league (this week's scores, the table, moves).
import { db } from '@/db'
import { drafts } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { loadStandings, loadWeek, loadMoves, periodLabel } from '@/lib/ysf-data'
import { writeStories, pct } from '@/lib/ysf-stories'
import { YSF_LEAGUES, YSF_ART } from '@/lib/ysf'

export type TickerMark = { src: string; bg: string }
export type TickerSide = { mark: TickerMark; ab: string; v: string | null; win: boolean }
export type TickerItem = { marks: TickerMark[]; text: string; ago: string; live?: boolean; score?: TickerSide[] }
export type TickerGroup = { label: string; bd: string; items: TickerItem[] }
export type TickerBlock = { name: string; bg: string; fg: string; logo: string | null; groups: TickerGroup[] }

const ago = (iso: string) => {
  const t = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : iso.replace(' ', 'T') + '-05:00').getTime()
  const d = Math.floor((Date.now() - t) / 86400000)
  return d <= 0 ? 'Today' : `${d}d`
}
const num = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 })

export async function buildTicker(league: any): Promise<TickerBlock[]> {
  const s = await loadStandings(league)
  const wk = await loadWeek(league)
  const { moves, trades } = await loadMoves(league.id, league.season)
  const C = s.clubs, ab = (id: string) => C[id]?.abbreviation ?? ''
  const mark = (id: string): TickerMark => ({ src: C[id]?.altLogo || C[id]?.logo || '', bg: C[id]?.color ?? '#000' })
  const cupMark: TickerMark = { src: YSF_ART.cupSymbol, bg: '#fff' }
  const story = writeStories(s)
  const blocks: TickerBlock[] = []

  // ── Federation ──
  const odds = [...s.cup].sort((a, b) => b.cupPct - a.cupPct).slice(0, 3)
  const fed: TickerGroup[] = [
    { label: 'FED CUP', bd: '#B8860B', items: [
      { marks: [cupMark], text: odds.map((r, i) => `${ab(r.teamId)} ${pct(r.cupPct)}${i === 0 ? ' to win the Cup' : ''}`).join(' | '), ago: 'Today' },
      { marks: [mark(s.cup[0].teamId)], text: story.headline.replace(/^./, c => c.toUpperCase()), ago: 'Today' },
    ] },
  ]
  const curTrades = trades.filter(t => t.season === league.season).slice(0, 3)
  if (curTrades.length) fed.push({ label: 'TRADES', bd: '#E500C5', items: curTrades.map(t => ({
    marks: t.sides.map(sd => mark(sd.teamId)),
    text: t.sides.map(sd => `${C[sd.teamId]?.name} gets ${sd.gets.map(g => g.team ? `${g.name} (${YSF_LEAGUES.find(l => l.sport === g.sport)?.code ?? ''}-${g.team}, ${g.pos})` : g.name).join(' + ')}`).join(' | '),
    ago: ago(t.when) })) })
  const up: TickerItem[] = []
  for (const d of (await db.select().from(drafts).where(eq(drafts.leagueId, league.id))).filter(d => d.status === 'PENDING' && d.startsAt)) {
    const L = YSF_LEAGUES.find(l => l.sport === d.scope)
    const when = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(d.startsAt!))
    up.push({ marks: L ? [{ src: YSF_ART.leagueSymbol(L.key, 'color'), bg: L.color }] : [], text: `${L?.code ?? ''} Rookie Draft | ${when} ET`, ago: 'Up next' })
  }
  if (!s.live.includes('MLB')) up.push({ marks: [{ src: YSF_ART.leagueSymbol('lb', 'color'), bg: '#ba0c2f' }], text: 'ySFLB opens Mar 24, 2027: up to 12 more Cup points per club', ago: 'Up next' })
  if (up.length) fed.push({ label: 'UP NEXT', bd: '#6da7ee', items: up })
  blocks.push({ name: 'FEDERATION', bg: '#000', fg: '#fff', logo: YSF_ART.cupSymbol, groups: fed })

  // ── each live league ──
  for (const L of YSF_LEAGUES.filter(l => s.live.includes(l.sport))) {
    const groups: TickerGroup[] = []
    const lines = wk.pairings.flatMap(p => p.lines.filter(l => l.sport === L.sport).map(l => ({ p, l })))
    if (lines.length) groups.push({ label: periodLabel(league, L.sport, wk.week).toUpperCase(), bd: L.color, items: lines.map(({ p, l }) => ({
      marks: [], live: l.status === 'LIVE',
      text: l.a == null ? `${ab(p.a)} vs ${ab(p.b)}` : `${ab(p.a)} ${num(l.a)} | ${ab(p.b)} ${num(l.b ?? 0)}`,
      score: [[p.a, l.a, l.b], [p.b, l.b, l.a]].map(([id, v, o]) => ({ mark: mark(id as string), ab: ab(id as string), v: v == null ? null : num(v as number), win: v != null && o != null && (v as number) > (o as number) })),
      ago: l.status === 'FINAL' ? 'Final' : l.status === 'LIVE' ? 'Live' : 'Up next' })) })
    const t = s.tables[L.sport]
    const table: TickerItem[] = [{ marks: [mark(t[0].teamId)], text: `${C[t[0].teamId]?.name} ${t[0].rec} atop ${L.code}`, ago: 'Today' }]
    const winless = t.filter(r => r.w === 0 && r.l > 0)
    if (winless.length) table.push({ marks: winless.map(r => mark(r.teamId)), text: `Still winless in ${L.code}: ${winless.map(r => ab(r.teamId)).join(', ')}`, ago: 'Today' })
    groups.push({ label: 'STANDINGS', bd: L.color, items: table })
    const recent = moves.filter(m => m.sport === L.sport && m.season === league.season && ['CLAIMED', 'SIGNED'].includes(m.kind))
      .filter(m => Date.now() - new Date(m.when + '-05:00').getTime() < 4 * 86400000).slice(0, 4)
    if (recent.length) groups.push({ label: 'MOVES', bd: '#3A6B9E', items: recent.map(m => ({
      marks: [mark(m.teamId)], text: `${ab(m.teamId)} ${m.kind === 'CLAIMED' ? 'claims' : 'signs'} ${m.player} (${L.code}-${m.team}, ${m.pos})${m.bid ? ` | $${m.bid}` : ''}`, ago: ago(m.when) })) })
    blocks.push({ name: L.code, bg: L.color, fg: '#fff', logo: YSF_ART.leagueSymbol(L.key, 'color'), groups })
  }
  return blocks
}
