'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

type Row = { id: string; type: string; message: string; teamId: string | null; createdAt: string | null }

const FILTERS: { key: string; label: string; types: string[] }[] = [
  { key: 'ALL', label: 'All', types: [] },
  { key: 'TRADE', label: 'Trades', types: ['TRADE'] },
  { key: 'WAIVER', label: 'Waivers', types: ['WAIVER'] },
  { key: 'ROSTER', label: 'Add / Drop', types: ['ROSTER'] },
  { key: 'DRAFT', label: 'Draft', types: ['DRAFT'] },
]

const SPORTS = ['NFL', 'NBA', 'NHL', 'MLB']
const ICON: Record<string, string> = { TRADE: '🔁', WAIVER: '📝', ROSTER: '🔀', DRAFT: '🏈' }

export default function TransactionsView({ leagueId, leagueName, rows }: { leagueId: string; leagueName: string; rows: Row[] }) {
  const [filter, setFilter] = useState('ALL')
  const [sport, setSport] = useState('ALL')

  // Detect the sport a row pertains to from its message (sports are embedded as "(NBA)", "NFL Wk", etc.).
  const sportOf = (msg: string) => SPORTS.find(s => new RegExp(`\\b${s}\\b`).test(msg)) ?? null

  const filtered = useMemo(() => {
    const set = FILTERS.find(f => f.key === filter)?.types ?? []
    return rows.filter(r => (set.length === 0 || set.includes(r.type)) && (sport === 'ALL' || sportOf(r.message) === sport))
  }, [rows, filter, sport])

  const counts = useMemo(() => Object.fromEntries(FILTERS.map(f => [f.key, f.types.length === 0 ? rows.length : rows.filter(r => f.types.includes(r.type)).length])), [rows])

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-5">
        <Link href={`/leagues/${leagueId}`} className="btn-ghost text-slate-500">← League</Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Transaction Log</h1>
          <p className="text-sm text-slate-500">{leagueName} · every move across all four sports</p>
        </div>
      </div>

      {/* Type filters */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === f.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {f.label} <span className="opacity-60">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {/* Sport filter */}
      <div className="flex gap-1.5 flex-wrap mb-5">
        <button onClick={() => setSport('ALL')} className={`px-2.5 py-1 rounded-md text-xs font-medium ${sport === 'ALL' ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}>All sports</button>
        {SPORTS.map(s => (
          <button key={s} onClick={() => setSport(s)} className={`px-2.5 py-1 rounded-md text-xs font-medium ${sport === s ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}>
            {sportMeta(s).emoji} {s}
          </button>
        ))}
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-slate-400 text-sm">No transactions match this filter.</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {filtered.map(r => {
              const sp = sportOf(r.message)
              return (
                <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="text-base leading-5">{ICON[r.type] ?? '•'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700">{r.message}</p>
                    <p className="text-[11px] text-slate-400">
                      {r.createdAt ? new Date(r.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                      <span className="ml-2 uppercase tracking-wide">{r.type}</span>
                    </p>
                  </div>
                  {sp && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sportMeta(sp).light}`}>{sp}</span>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
