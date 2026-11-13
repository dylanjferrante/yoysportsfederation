'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PageTitle, Tabs, ClubTile } from '@/components/ysf/ui'
import MovesTable, { type MoveRowT } from '@/components/ysf/MovesTable'
import { YSF_LEAGUES } from '@/lib/ysf'
import { assetName } from '@/lib/ysf-trades'

type Club = { name: string; abbreviation: string; logo: string | null; altLogo?: string | null; color: string | null; ink?: string | null }
type Trade = { id: string; when: string; sides: { teamId: string; gets: { name: string; sport: string; team: string; pos: string }[] }[]; text: string; season?: string }
const day = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + '-05:00'))

export function TradeCards({ leagueId, trades, clubs, codes }: { leagueId: string; trades: Trade[]; clubs: Record<string, Club>; codes: Record<string, string> }) {
  if (!trades.length) return <div className="card p-6 text-center text-ink-400 font-semibold">No trades yet</div>
  return (
    <section className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))' }}>
      {trades.map(t => (
        <div key={t.id} className="card overflow-hidden">
          <div className="ui px-4 py-2.5 bg-black text-white text-[12px] font-bold tracking-[.12em]">TRADE · {day(t.when).toUpperCase()}</div>
          <div className="grid grid-cols-2">
            {t.sides.map((sd, i) => {
              const c = clubs[sd.teamId]
              return (
                <div key={sd.teamId} className={i ? 'border-l border-ink-100' : ''}>
                  <ClubTile club={c} href={`/leagues/${leagueId}/teams/${sd.teamId}`} label="GETS" />
                  <ul className="p-4 pt-3 flex flex-col gap-1.5">
                    {sd.gets.map((g, j) => {
                      const L = YSF_LEAGUES.find(l => l.sport === g.sport)
                      return <li key={j} className="font-semibold leading-tight">{assetName(g)}{L && g.team ? <span className="block text-[12px] font-normal text-ink-500 ysf-case">({codes[g.sport] ?? L.code}-{g.team}, {g.pos})</span> : null}</li>
                    })}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}

export default function MovesView({ leagueId, moves, trades, clubs, codes, seasons }: { leagueId: string; moves: MoveRowT[]; trades: Trade[]; clubs: Record<string, Club>; codes: Record<string, string>; seasons: string[] }) {
  const [tab, setTab] = useState<'all' | 'tr'>('all')
  const [season, setSeason] = useState(seasons[0])
  const all = moves
  return (
    <>
      <PageTitle eyebrow="Trades · waivers & FA · drafts" title="MOVES" right={
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2"><span className="ui text-[12px] text-ink-500">SEASON</span>
            <span className="relative inline-flex"><select value={season} onChange={e => setSeason(e.target.value)} className="appearance-none h-10 pl-3.5 pr-9 border border-black rounded-lg bg-white font-display text-[13px] font-bold tracking-[.08em]">
              {seasons.map(x => <option key={x} value={x}>{x.replace('-', '–')}</option>)}</select>
              <span className="absolute right-3 top-0 bottom-0 inline-flex items-center pointer-events-none text-[12px]">▾</span></span></label>
          <Tabs items={[{ id: 'all', label: 'ALL MOVES' }, { id: 'tr', label: 'TRADES' }]} value={tab} onChange={setTab} />
        </div>} />
      {tab === 'all'
        ? <MovesTable key={season} leagueId={leagueId} rows={all.filter(m => (m.season ?? seasons[0]) === season)} clubs={clubs} codes={codes} />
        : <TradeCards leagueId={leagueId} trades={trades.filter(t => (t.season ?? seasons[0]) === season)} clubs={clubs} codes={codes} />}
    </>
  )
}
