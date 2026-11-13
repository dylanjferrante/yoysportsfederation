'use client'

import { useState } from 'react'
import { PageTitle, Tabs, th, td, RecTh, RecTd } from '@/components/ysf/ui'
import { YSF_LEAGUES, YSF_ART } from '@/lib/ysf'
import Link from 'next/link'

type Club = { name: string; abbreviation: string; logo: string | null; color: string | null }
type LRow = { teamId: string; rk: number; rec: string; w: number; l: number; gb: number; pf: number; faab: number; fed: number; po: number; title: number }
export type StandingsData = {
  leagueId: string; season: string; updated: string; live: string[]
  clubs: Record<string, Club>
  cup: { teamId: string; rk: number; pts: number; rec: string; ranks: Record<string, number | null>; cupPct: number; exp: number }[]
  tables: Record<string, LRow[]>
  lbOpens: string | null
}

const pct = (x: number) => (x * 100 >= 99.95 ? '>99.9' : x > 0 && x * 100 < 0.1 ? '<0.1' : (x * 100).toFixed(1)) + '%'

function Club({ d, id }: { d: StandingsData; id: string }) {
  const c = d.clubs[id]
  return (
    <td className={`${td} whitespace-normal`} style={{ borderLeft: `4px solid ${c?.color ?? '#000'}` }}>
      <Link href={`/leagues/${d.leagueId}/teams/${id}`} className="flex items-center gap-2.5 hover:text-ink-500">
        <span className="w-[30px] h-[30px] inline-flex items-center justify-center flex-none">{c?.logo && <img src={c.logo} alt="" className="w-[30px] h-[30px] object-contain" />}</span>
        <span className="font-bold leading-tight"><span className="hidden sm:inline">{c?.name}</span><span className="sm:hidden">{c?.abbreviation}</span></span>
      </Link>
    </td>
  )
}

export default function StandingsView({ data: d }: { data: StandingsData }) {
  const [tab, setTab] = useState<string>('cup')
  const L = YSF_LEAGUES.find(l => l.sport === tab)
  return (
    <>
      <PageTitle eyebrow={`${d.season.replace('-', '–')} · updated ${d.updated}`} title="STANDINGS" />
      <Tabs items={[{ id: 'cup', label: 'FED CUP' }, ...YSF_LEAGUES.map(l => ({ id: l.sport, label: l.code }))]} value={tab} onChange={setTab} />

      {tab === 'cup' && (
        <section className="card overflow-x-auto">
          <div className="flex items-center gap-4 px-4 pt-4"><img src="/ysf/fed/cup_horiz_white.svg" alt="yoy Sports Federation Cup" className="h-14 w-auto" /></div>
          <table className="w-full border-collapse mt-2 sm:min-w-[860px]">
            <thead><tr>
              <th className={th}>RK</th><th className={th}>CLUB</th>
              {YSF_LEAGUES.map(l => <th key={l.sport} className={`${th} text-center hidden sm:table-cell`}><img src={YSF_ART.leagueSymbol(l.key, 'white')} alt={l.code} className="w-[26px] h-[26px] inline-block align-middle" /></th>)}
              <th className={`${th} text-right`}>PTS</th><RecTh cls="hidden sm:table-cell" />
              <th className={`${th} text-right`}>CUP %</th><th className={`${th} text-right hidden sm:table-cell`}>EXP. PTS</th>
            </tr></thead>
            <tbody>{d.cup.map(r => (
              <tr key={r.teamId}>
                <td className={`${td} w-9`}>{r.rk}</td>
                <Club d={d} id={r.teamId} />
                {YSF_LEAGUES.map(l => (
                  <td key={l.sport} className={`${td} text-center hidden sm:table-cell`}>
                    {r.ranks[l.sport] != null
                      ? <span className="inline-flex items-center justify-center w-7 h-6 leading-none rounded-[2px] text-white" style={{ background: l.color }}>{r.ranks[l.sport]}</span>
                      : <span className="text-ink-400">–</span>}
                  </td>
                ))}
                <td className={`${td} text-right disp text-[26px] font-extrabold`}>{r.pts}</td>
                <RecTd rec={r.rec} cls="hidden sm:table-cell" />
                <td className={`${td} text-right`}>{pct(r.cupPct)}</td>
                <td className={`${td} text-right font-normal hidden sm:table-cell`}>{r.exp.toFixed(1)}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      {L && (L.sport === 'MLB' && !d.live.includes('MLB') ? (
        <section className="card p-8 flex items-center gap-5" style={{ borderTop: `4px solid ${L.color}` }}>
          <img src={YSF_ART.leagueSymbol(L.key, 'white')} alt="" className="w-16 h-16 object-contain" />
          <div><div className="disp text-[28px] font-extrabold"><span className="ysf-case">{L.code}</span> OPENS {d.lbOpens?.toUpperCase() ?? 'IN THE SPRING'}</div>
            <div className="text-[15px] text-ink-500 mt-1">Standings appear after Period 1. Up to {Object.keys(d.clubs).length} more Cup points per club.</div></div>
        </section>
      ) : (
        <section className="card overflow-x-auto" style={{ borderTop: `4px solid ${L.color}` }}>
          <div className="flex items-center gap-3 px-4 pt-4"><img src={YSF_ART.leagueLockup(L.key, 'white')} alt={L.name} className="h-16 w-auto max-w-full" /></div>
          <table className="w-full border-collapse mt-2 sm:min-w-[760px]">
            <thead><tr>
              <th className={th}>RK</th><th className={th}>CLUB</th><RecTh />
              <th className={`${th} text-right hidden sm:table-cell`}>GB</th><th className={`${th} text-right`}>PF</th>
              <th className={`${th} text-right hidden sm:table-cell`}>FAAB</th><th className={`${th} text-right hidden sm:table-cell`}>FED PTS</th>
              <th className={`${th} text-right`}>P%</th><th className={`${th} text-right hidden sm:table-cell`}>TITLE %</th>
            </tr></thead>
            <tbody>{d.tables[L.sport].map(r => (
              <tr key={r.teamId} style={{ boxShadow: r.rk === 6 ? 'inset 0 -3px 0 #000' : 'none' }}>
                <td className={`${td} w-9`}>{r.rk}</td>
                <Club d={d} id={r.teamId} />
                <RecTd rec={r.rec} />
                <td className={`${td} text-right font-normal hidden sm:table-cell`}>{r.gb ? r.gb.toFixed(1) : '—'}</td>
                <td className={`${td} text-right`}>{r.pf.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                <td className={`${td} text-right font-normal hidden sm:table-cell`}>${r.faab}</td>
                <td className={`${td} text-right hidden sm:table-cell`}>{r.fed}</td>
                <td className={`${td} text-right`}>{pct(r.po)}</td>
                <td className={`${td} text-right font-normal hidden sm:table-cell`}>{pct(r.title)}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      ))}
    </>
  )
}
