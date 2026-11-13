'use client'

import { PageTitle } from '@/components/ysf/ui'
import { YSF_LEAGUES, YSF_ART } from '@/lib/ysf'
const lgOf = (sp: string) => YSF_LEAGUES.find(l => l.sport === sp)!
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { sportMeta, crossSportValue } from '@/lib/utils'
import { useSportAbbr } from '@/components/SportNaming'

type Row = {
  rosterId: string; sport: string; slot: string; playerId: string; name: string; position: string
  realTeam: string; projectedPoints: number; status: string; teamId: string; teamName: string; teamAbbr: string
}

export default function Marketplace() {
  const { id } = useParams<{ id: string }>()
  const abbr = useSportAbbr()
  const [rows, setRows] = useState<Row[]>([])
  const [sport, setSport] = useState('ALL')
  const SPORTS = ['NFL', 'NHL', 'NBA', 'MLB']

  useEffect(() => { fetch(`/api/leagues/${id}/marketplace`).then(r => r.json()).then(d => setRows(Array.isArray(d) ? d : [])) }, [id])

  const filtered = (sport === 'ALL' ? rows : rows.filter(r => r.sport === sport))
    .sort((a, b) => crossSportValue(b.sport, b.projectedPoints) - crossSportValue(a.sport, a.projectedPoints))

  return (
    <div>
      <div className="mb-6"><PageTitle eyebrow={`${rows.length} players listed`} title="TRADE BLOCK" /></div>

      <div className="flex gap-1.5 flex-wrap mb-4">
        <button onClick={() => setSport('ALL')} className="inline-flex items-center justify-center h-9 px-3 rounded-lg font-display text-[12px] font-bold leading-none border" style={{ background: sport === 'ALL' ? '#000' : '#fff', color: sport === 'ALL' ? '#fff' : '#000', borderColor: sport === 'ALL' ? '#000' : '#C7C7C7' }}>ALL</button>
        {SPORTS.map(s => (
          <button key={s} onClick={() => setSport(s)} className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg font-display text-[12px] font-bold leading-none border" style={{ background: sport === s ? lgOf(s).color : '#fff', color: sport === s ? '#fff' : '#000', borderColor: sport === s ? lgOf(s).color : '#C7C7C7' }}><img src={YSF_ART.leagueSymbol(lgOf(s).key, sport === s ? 'color' : 'white')} alt="" className="w-5 h-5 object-contain" /><span className="ysf-case">{lgOf(s).code}</span></button>
        ))}
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-ink-500 font-semibold">No players on the trade block</p>
        ) : (
          <ul className="divide-y divide-ink-50">
            {filtered.map(r => (
              <li key={r.rosterId} className="flex items-center gap-3 px-4 py-2.5">
                <img src={YSF_ART.leagueSymbol(lgOf(r.sport).key, 'white')} alt={lgOf(r.sport).code} className="w-6 h-6 object-contain" />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] truncate"><b>{r.name}</b> <span className="text-ink-500 ml-2">{r.realTeam}</span> <span className="text-ink-500 ml-2">{r.position}</span></p>
                  <p className="text-[12px] text-ink-500"><Link href={`/leagues/${id}/teams/${r.teamId}`} className="font-semibold text-black">{r.teamName}</Link></p>
                </div>
                <Link href={`/leagues/${id}/myteam?tab=trade`} className="inline-flex items-center justify-center h-8 px-3 rounded-lg bg-black text-white font-display text-[12px] font-bold tracking-[.06em] leading-none">OFFER</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
