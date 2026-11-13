'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Tabs } from '@/components/ysf/ui'
import { YSF_LEAGUES, YSF_ART } from '@/lib/ysf'

type Cell = { matchupId: string; label: string; opp: string; result: string; tone: 'win' | 'loss' | 'tie' | 'live' | 'future'; playoff: boolean } | null
export type ClubTabsData = {
  leagueId: string
  calendar: { cols: { w: number; label: string; current: boolean }[]; rows: { sport: string; cells: Cell[] }[] }
  rosters: Record<string, { label: string; rows: { slot: string; name: string; meta: string }[] }[]>
  moves: { when: string; type: string; text: string }[]
  picks: { year: number; sport: string; code: string; round: number; via: string | null }[]
  codes: Record<string, string>
}
const TONE: Record<string, { bg: string; bd: string }> = {
  win: { bg: '#E8F3EC', bd: '#CFE6D6' }, loss: { bg: '#FBE9EC', bd: '#F2D0D6' }, tie: { bg: '#F2F2F2', bd: '#E5E5E5' },
  live: { bg: '#fff', bd: '#000' }, future: { bg: '#fff', bd: '#E5E5E5' },
}

export default function ClubTabs({ data: d }: { data: ClubTabsData }) {
  const [tab, setTab] = useState('cal')
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (tab !== 'cal' || !scroller.current) return
    const el = scroller.current.querySelector('[data-current="1"]') as HTMLElement | null
    if (el) scroller.current.scrollLeft = Math.max(0, el.offsetLeft - 260)
  }, [tab])
  const L = YSF_LEAGUES.find(l => l.sport === tab)
  return (
    <>
      <Tabs value={tab} onChange={setTab} items={[{ id: 'cal', label: 'CALENDAR' }, ...YSF_LEAGUES.map(l => ({ id: l.sport, label: d.codes[l.sport] })), { id: 'tx', label: 'TRANSACTIONS' }, { id: 'pk', label: 'DRAFT PICKS' }]} />

      {tab === 'cal' && (
        <section className="card p-3">
          <div ref={scroller} className="overflow-x-auto">
            <div className="grid gap-1" style={{ gridTemplateColumns: `92px repeat(${d.calendar.cols.length}, 112px)` }}>
              <span className="sticky left-0 z-10 bg-white" />
              {d.calendar.cols.map(c => <span key={c.w} data-current={c.current ? '1' : undefined} className="text-[11px] font-bold text-center leading-tight py-1" style={{ color: c.current ? '#000' : '#4A4A4A' }}>{c.label}</span>)}
              {d.calendar.rows.map(r => {
                const lg = YSF_LEAGUES.find(l => l.sport === r.sport)!
                return [
                  <span key={r.sport} className="sticky left-0 z-10 bg-white flex items-center gap-1.5 ui text-[12px] font-bold border-r-4 border-black pr-2"><img src={YSF_ART.leagueSymbol(lg.key, 'white')} alt="" className="w-6 h-6 object-contain" /><span className="ysf-case">{d.codes[r.sport]}</span></span>,
                  ...r.cells.map((c, i) => c ? (
                    <Link key={r.sport + i} href={`/leagues/${d.leagueId}/matchup/${c.matchupId}`} className="h-[52px] rounded flex flex-col items-center justify-center text-center leading-tight border hover:brightness-95"
                      style={{ background: TONE[c.tone].bg, borderColor: TONE[c.tone].bd, borderWidth: c.tone === 'live' ? 2 : 1 }}>
                      <span className="text-[10px] text-ink-500">{c.label}{c.playoff ? ' · PO' : ''}</span>
                      <span className="text-[12px] font-bold">{c.opp}</span>
                      {c.result && <span className="text-[10px]">{c.result}</span>}
                    </Link>
                  ) : <span key={r.sport + i} className="h-[52px] rounded border border-ink-50" />),
                ]
              })}
            </div>
          </div>
        </section>
      )}

      {L && (
        <section className="card overflow-hidden" style={{ borderTop: `4px solid ${L.color}` }}>
          {(d.rosters[L.sport] ?? []).map(g => (
            <div key={g.label}>
              <div className="ui flex justify-between px-4 py-2 bg-ink-50 text-[12px] font-bold tracking-[.12em]"><span>{g.label}</span><span className="text-ink-500">{g.rows.length}</span></div>
              {g.rows.map((p, i) => (
                <div key={i} className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 items-center px-4 py-2 border-t border-ink-50">
                  <span className="ui inline-flex items-center justify-center leading-none h-7 rounded-[3px] text-[12px] font-bold" style={{ background: g.label === 'STARTERS' ? L.color : '#E5E5E5', color: g.label === 'STARTERS' ? '#fff' : '#1F1F1F' }}>{p.slot}</span>
                  <span className="min-w-0 font-bold">{p.name} <span className="font-normal text-[13px] text-ink-500 whitespace-nowrap">{p.meta}</span></span>
                </div>
              ))}
            </div>
          ))}
          {!(d.rosters[L.sport] ?? []).length && <div className="p-4 text-ink-400 font-semibold">No players</div>}
        </section>
      )}

      {tab === 'tx' && (
        <section className="card overflow-hidden">
          {d.moves.map((m, i) => (
            <div key={i} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 px-4 py-2.5 border-t border-ink-50 first:border-t-0">
              <span className="text-[13px] text-ink-500">{m.when ? new Date(m.when.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</span>
              <span className="font-semibold">{m.text}</span>
            </div>
          ))}
          {!d.moves.length && <div className="p-4 text-ink-400 font-semibold">No transactions</div>}
        </section>
      )}

      {tab === 'pk' && (
        <section className="card overflow-hidden">
          {d.picks.map((p, i) => {
            const lg = YSF_LEAGUES.find(l => l.sport === p.sport)
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-t border-ink-50 first:border-t-0">
                <span className="ui inline-flex items-center justify-center leading-none h-6 px-2 rounded-[2px] text-white text-[11px] font-bold" style={{ background: lg?.color ?? '#000' }}><span className="ysf-case">{p.code}</span></span>
                <span className="font-bold">{p.year} Round {p.round}</span>
                {p.via && <span className="text-[13px] text-ink-500">via {p.via}</span>}
              </div>
            )
          })}
          {!d.picks.length && <div className="p-4 text-ink-400 font-semibold">No picks</div>}
        </section>
      )}
    </>
  )
}
