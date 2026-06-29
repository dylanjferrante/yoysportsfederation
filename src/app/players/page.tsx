'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'
import { boxScoreColumns } from '@/lib/scoring-categories'

const SPORTS = ['NFL', 'NBA', 'NHL', 'MLB']
const POS: Record<string, string[]> = {
  NFL: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
  NBA: ['PG', 'SG', 'SF', 'PF', 'C'],
  NHL: ['C', 'LW', 'RW', 'D', 'G'],
  MLB: ['C', '1B', '2B', '3B', 'SS', 'OF', 'SP', 'RP'],
}

type Player = {
  id: string; name: string; sport: string; position: string; realTeam: string; realTeamAbbr: string | null
  status: string; seasonPoints: number; projectedPoints: number
  seasonStats: Record<string, number>; gp: number; lastPts: number | null; avg: number; owned: boolean; posRank: number
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [sport, setSport] = useState('')
  const [position, setPosition] = useState('')
  const [search, setSearch] = useState('')
  const [faOnly, setFaOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState('seasonPoints')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ rich: 'true' })
    if (sport) params.set('sport', sport)
    if (position) params.set('position', position)
    if (search) params.set('q', search)
    fetch(`/api/players?${params}`).then(r => r.json()).then(data => { setPlayers(Array.isArray(data) ? data : []); setLoading(false) })
  }, [sport, position, search])

  // Category columns only when a single sport is selected.
  const cats = sport ? boxScoreColumns(sport) : []

  const cols = useMemo(() => {
    const base = [
      { key: 'proj', label: 'Proj', val: (p: Player) => p.projectedPoints ?? 0, fmt: (v: number) => v.toFixed(1), align: 'right' as const, dim: true },
      { key: 'avg', label: 'Avg', val: (p: Player) => p.avg ?? 0, fmt: (v: number) => v.toFixed(1), align: 'right' as const },
      { key: 'last', label: 'Last', val: (p: Player) => p.lastPts ?? 0, fmt: (v: number) => (v ? v.toFixed(1) : '—'), align: 'right' as const },
      { key: 'gp', label: 'GP', val: (p: Player) => p.gp ?? 0, fmt: (v: number) => String(v), align: 'right' as const, dim: true },
      { key: 'seasonPoints', label: 'Pts', val: (p: Player) => p.seasonPoints ?? 0, fmt: (v: number) => v.toFixed(1), align: 'right' as const, bold: true },
    ]
    const catCols = cats.map(c => ({ key: `cat:${c.label}`, label: c.label, val: (p: Player) => +c.get(p.seasonStats ?? {}).toFixed(0), fmt: (v: number) => (v ? String(v) : '—'), align: 'right' as const, dim: false, bold: false }))
    return [...base, ...catCols]
  }, [cats])

  const rows = useMemo(() => {
    let r = players
    if (faOnly) r = r.filter(p => !p.owned)
    const col = cols.find(c => c.key === sortKey)
    const get = col ? col.val : (p: Player) => p.seasonPoints ?? 0
    return [...r].sort((a, b) => { const d = (get(a) as number) - (get(b) as number); return sortDir === 'desc' ? -d : d })
  }, [players, faOnly, sortKey, sortDir, cols])

  function sortBy(key: string) {
    if (sortKey === key) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
  }
  const arrow = (key: string) => sortKey === key ? (sortDir === 'desc' ? ' ▾' : ' ▴') : ''

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Players</h1>
        <p className="text-slate-500 text-sm mt-0.5">{rows.length} players · cross-sport stat leaders</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input type="search" placeholder="Search players…" value={search} onChange={e => setSearch(e.target.value)} className="input w-56 text-sm py-2" />
        <button onClick={() => { setSport(''); setPosition('') }} className={`px-3 py-1.5 rounded-full text-sm font-medium ${!sport ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>All</button>
        {SPORTS.map(s => {
          const m = sportMeta(s)
          return <button key={s} onClick={() => { setSport(s); setPosition('') }} className={`px-3 py-1.5 rounded-full text-sm font-medium ${sport === s ? `${m.bg} text-white` : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{m.emoji} {s}</button>
        })}
        {sport && (
          <select className="select w-28 text-sm py-1.5" value={position} onChange={e => setPosition(e.target.value)}>
            <option value="">All Pos</option>
            {(POS[sport] ?? []).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-sm text-slate-600 ml-auto cursor-pointer">
          <input type="checkbox" checked={faOnly} onChange={e => setFaOnly(e.target.checked)} className="rounded" />
          Free agents only
        </label>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading players…</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50">
                <th className="text-left px-2 py-2 font-semibold w-8">{position ? '#' : ''}</th>
                <th className="text-left px-2 py-2 font-semibold sticky left-0 bg-slate-50">Player</th>
                <th className="text-center px-2 py-2 font-semibold">Own</th>
                {cols.map(c => (
                  <th key={c.key} onClick={() => sortBy(c.key)} className={`px-2 py-2 font-semibold cursor-pointer hover:text-slate-700 whitespace-nowrap text-${c.align}`}>{c.label}{arrow(c.key)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.slice(0, 150).map((p, i) => {
                const m = sportMeta(p.sport)
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-2 py-1.5 text-slate-300 tabular-nums text-xs">{position ? p.posRank : i + 1}</td>
                    <td className="px-2 py-1.5 sticky left-0 bg-white whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded ${m.bg} text-white flex items-center justify-center text-[9px] font-bold flex-shrink-0`}>{p.position.slice(0, 2)}</span>
                        <span>
                          <Link href={`/players/${p.id}`} className="font-medium text-slate-900 hover:text-blue-600">{p.name}</Link>
                          <span className="text-[11px] text-slate-400"> {p.sport} · {p.position} · {p.realTeamAbbr ?? p.realTeam}</span>
                          {p.status !== 'ACTIVE' && <span className="ml-1 text-[9px] font-bold text-red-500">{p.status === 'INJURED' ? 'INJ' : p.status}</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${p.owned ? 'bg-slate-100 text-slate-400' : 'bg-green-50 text-green-600'}`}>{p.owned ? 'ROST' : 'FA'}</span>
                    </td>
                    {cols.map(c => (
                      <td key={c.key} className={`px-2 py-1.5 tabular-nums text-${c.align} ${c.bold ? 'font-bold text-slate-900' : c.dim ? 'text-slate-400' : 'text-slate-600'}`}>{c.fmt(c.val(p) as number)}</td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
