'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Tabs, th, td } from '@/components/ysf/ui'
import { YSF_LEAGUES, YSF_ART } from '@/lib/ysf'

type Club = { name: string; abbreviation: string; logo: string | null; color: string | null }
type Row = { teamId: string; rk: number; pts: number; rec: string; ranks: Record<string, number | null>; cupPct: number; exp: number }
const MEDAL = ['', '#C9A227', '#8A8A8A', '#A0522D']
const pct = (x: number) => (x * 100 >= 99.95 ? '>99.9' : x > 0 && x < 0.001 ? '<0.1' : (x * 100).toFixed(1)) + '%'

export default function HomeStandings({ leagueId, cup, live, clubs }: { leagueId: string; cup: Row[]; live: string[]; clubs: Record<string, Club> }) {
  const [view, setView] = useState<'current' | 'odds'>('current')
  const rows = view === 'odds' ? [...cup].sort((a, b) => b.cupPct - a.cupPct) : cup
  return (
    <section className="card overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <img src="/ysf/fed/cup_horiz_white.svg" alt="yoy Sports Federation Cup" className="h-9 sm:h-12 w-auto flex-none" />
          <span className="w-px h-8 bg-black flex-none" />
          <Link href={`/leagues/${leagueId}/standings`} className="disp text-[24px] sm:text-[32px] font-extrabold leading-none">STANDINGS</Link>
        </div>
        <Tabs items={[{ id: 'current', label: 'CURRENT' }, { id: 'odds', label: 'CUP ODDS' }]} value={view} onChange={setView} />
      </div>
      <table className="w-full border-collapse mt-3 sm:min-w-[820px]">
        <thead><tr>
          <th className={th}>RK</th><th className={th}>CLUB</th>
          {YSF_LEAGUES.map(l => <th key={l.sport} className={`${th} text-center hidden sm:table-cell`}><img src={YSF_ART.leagueSymbol(l.key, 'white')} alt={l.code} className="w-6 h-6 inline-block" /></th>)}
          {view === 'current' ? <><th className={`${th} text-right`}>PTS</th><th className={`${th} text-right`}>RECORD</th></> : <><th className={`${th} text-right`}>CUP %</th><th className={`${th} text-right`}>EXP. PTS</th></>}
        </tr></thead>
        <tbody>{rows.map((r, i) => {
          const c = clubs[r.teamId]
          return (
            <tr key={r.teamId}>
              <td className={`${td} w-9`}>{view === 'odds' ? i + 1 : r.rk}</td>
              <td className={`${td} whitespace-normal`} style={{ borderLeft: `4px solid ${c?.color ?? '#000'}` }}>
                <Link href={`/leagues/${leagueId}/teams/${r.teamId}`} className="flex items-center gap-2.5">
                  <span className="w-7 h-7 inline-flex items-center justify-center flex-none">{c?.logo && <img src={c.logo} alt="" className="w-7 h-7 object-contain" />}</span>
                  <span className="font-bold leading-tight"><span className="hidden sm:inline">{c?.name}</span><span className="sm:hidden">{c?.abbreviation}</span></span>
                </Link>
              </td>
              {YSF_LEAGUES.map(l => { const v = r.ranks[l.sport]; return <td key={l.sport} className={`${td} text-center hidden sm:table-cell`} style={{ color: v != null && v <= 3 ? MEDAL[v] : v == null ? '#8A8A8A' : '#000' }}>{v ?? '–'}</td> })}
              {view === 'current'
                ? <><td className={`${td} text-right disp text-[26px] font-extrabold`}>{r.pts}</td><td className={`${td} text-right`}>{r.rec}</td></>
                : <><td className={`${td} text-right disp text-[22px] font-extrabold`}>{pct(r.cupPct)}</td><td className={`${td} text-right font-normal`}>{r.exp.toFixed(1)}</td></>}
            </tr>
          )
        })}</tbody>
      </table>
    </section>
  )
}
