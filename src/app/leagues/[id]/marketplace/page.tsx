'use client'

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
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Trade Block</h1>
        <p className="text-sm text-slate-500">Players around the league flagged as available · {rows.length} listed</p>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-4">
        <button onClick={() => setSport('ALL')} className={`px-2.5 py-1 rounded-md text-xs font-medium ${sport === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>All sports</button>
        {SPORTS.map(s => (
          <button key={s} onClick={() => setSport(s)} className={`px-2.5 py-1 rounded-md text-xs font-medium ${sport === s ? `${sportMeta(s).bg} text-white` : 'bg-slate-100 text-slate-600'}`}>{sportMeta(s).emoji} {s}</button>
        ))}
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-slate-400 text-sm">No players on the trade block yet. Owners can flag players from their team page.</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {filtered.map(r => (
              <li key={r.rosterId} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sportMeta(r.sport).light}`}>{abbr(r.sport)}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-slate-900 truncate">{r.name} <span className="text-xs text-slate-400">{r.position} · {r.realTeam}</span></p>
                  <p className="text-xs text-slate-400">on <Link href={`/leagues/${id}/teams/${r.teamId}`} className="text-blue-600 hover:underline">{r.teamName}</Link></p>
                </div>
                <span className="text-xs text-slate-500 tabular-nums">val {crossSportValue(r.sport, r.projectedPoints)}</span>
                <Link href={`/trade/new?partner=${r.teamId}`} className="btn-secondary text-xs">Offer</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
