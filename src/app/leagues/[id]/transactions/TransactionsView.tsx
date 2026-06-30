'use client'

import { useMemo, useState } from 'react'
import { sportMeta, sportAbbrLabel } from '@/lib/utils'

type Row = {
  id: string; type: string; message: string; createdAt: string | null
  teamName: string | null; teamAbbr: string | null; teamLogo: string | null; teamPrimary: string | null
  player: string | null; position: string | null; proTeam: string | null; sport: string | null
}

const FILTERS: { key: string; label: string; types: string[] }[] = [
  { key: 'ALL', label: 'All', types: [] },
  { key: 'TRADE', label: 'Trades', types: ['TRADE'] },
  { key: 'WAIVER', label: 'Waivers', types: ['WAIVER'] },
  { key: 'ROSTER', label: 'Add / Drop', types: ['ROSTER'] },
  { key: 'DRAFT', label: 'Draft', types: ['DRAFT'] },
]

const SPORTS = ['NFL', 'NHL', 'NBA', 'MLB']
const ICON: Record<string, string> = { TRADE: '', WAIVER: '', ROSTER: '', DRAFT: '' }

export default function TransactionsView({ leagueId, leagueName, rows, sportAbbr = {} }: { leagueId: string; leagueName: string; rows: Row[]; sportAbbr?: Record<string, string> }) {
  const [filter, setFilter] = useState('ALL')
  const [sport, setSport] = useState('ALL')

  const filtered = useMemo(() => {
    const set = FILTERS.find(f => f.key === filter)?.types ?? []
    return rows.filter(r => (set.length === 0 || set.includes(r.type)) && (sport === 'ALL' || r.sport === sport))
  }, [rows, filter, sport])

  const counts = useMemo(() => Object.fromEntries(FILTERS.map(f => [f.key, f.types.length === 0 ? rows.length : rows.filter(r => f.types.includes(r.type)).length])), [rows])

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Transaction Log</h1>
        <p className="text-sm text-slate-500">Every move across all four sports</p>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-3">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === f.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {f.label} <span className="opacity-60">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 flex-wrap mb-5">
        <button onClick={() => setSport('ALL')} className={`px-2.5 py-1 rounded-md text-xs font-medium ${sport === 'ALL' ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}>All sports</button>
        {SPORTS.map(s => (
          <button key={s} onClick={() => setSport(s)} className={`px-2.5 py-1 rounded-md text-xs font-medium ${sport === s ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}>
            {sportMeta(s).emoji} {s}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-slate-400 text-sm">No transactions match this filter.</p>
        ) : (
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50/60">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Team</th>
                <th className="px-3 py-2 font-medium">Sport</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Player</th>
                <th className="px-3 py-2 font-medium">Pos</th>
                <th className="px-3 py-2 font-medium">Pro Team</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2.5 text-xs text-slate-400">{r.createdAt ? new Date(r.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-700">
                    <span className="inline-flex items-center gap-1.5">
                      {r.teamLogo
                        ? <img src={r.teamLogo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
                        : r.teamAbbr ? <span className="w-5 h-5 flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0" style={{ background: r.teamPrimary ?? '#0f172a' }}>{r.teamAbbr.slice(0, 2)}</span> : null}
                      {r.teamAbbr ?? r.teamName ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{r.sport ? <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sportMeta(r.sport).light}`}>{sportAbbrLabel(r.sport, sportAbbr)}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">{ICON[r.type] ?? '•'} {r.type}</span></td>
                  <td className="px-3 py-2.5 text-slate-800">{r.player ?? <span className="text-slate-400 whitespace-normal">{r.message}</span>}</td>
                  <td className="px-3 py-2.5 text-slate-500">{r.position ?? '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{r.proTeam ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
