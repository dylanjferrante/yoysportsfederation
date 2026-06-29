'use client'

import { useEffect, useState } from 'react'
import { sportMeta } from '@/lib/utils'

const SPORTS = ['NFL', 'NBA', 'NHL', 'MLB']

type Player = {
  id: string; name: string; sport: string; position: string
  realTeam: string; status: string; seasonPoints: number; projectedPoints: number
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [sport, setSport] = useState('')
  const [position, setPosition] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (sport) params.set('sport', sport)
    if (position) params.set('position', position)
    if (search) params.set('q', search)
    fetch(`/api/players?${params}`)
      .then(r => r.json())
      .then(data => { setPlayers(data); setLoading(false) })
  }, [sport, position, search])

  const NFL_POS = ['QB','RB','WR','TE','K','DEF']
  const NBA_POS = ['PG','SG','SF','PF','C']
  const NHL_POS = ['C','LW','RW','D','G']
  const MLB_POS = ['C','1B','2B','3B','SS','OF','SP','RP']
  const positions = sport === 'NFL' ? NFL_POS : sport === 'NBA' ? NBA_POS : sport === 'NHL' ? NHL_POS : sport === 'MLB' ? MLB_POS : []

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Players</h1>
        <p className="text-slate-500 text-sm mt-0.5">Browse all {players.length} players across NFL, NBA, NHL, and MLB</p>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6 flex flex-wrap gap-3">
        <input
          type="search" placeholder="Search players…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="input flex-1 min-w-48" />
        <select className="select w-36" value={sport} onChange={e => { setSport(e.target.value); setPosition('') }}>
          <option value="">All Sports</option>
          {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {positions.length > 0 && (
          <select className="select w-32" value={position} onChange={e => setPosition(e.target.value)}>
            <option value="">All Positions</option>
            {positions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>

      {/* Sport pills */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => { setSport(''); setPosition('') }}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${!sport ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          All Sports
        </button>
        {SPORTS.map(s => {
          const m = sportMeta(s)
          return (
            <button key={s} onClick={() => { setSport(s); setPosition('') }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${sport === s ? `${m.bg} text-white` : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {m.emoji} {s}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading players…</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium">Player</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Team</th>
                <th className="text-center px-4 py-3 font-medium hidden md:table-cell">Sport</th>
                <th className="text-center px-4 py-3 font-medium">Pos</th>
                <th className="text-center px-4 py-3 font-medium">Season Pts</th>
                <th className="text-center px-4 py-3 font-medium hidden sm:table-cell">Proj</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {players.slice(0, 100).map(p => {
                const meta = sportMeta(p.sport)
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors text-sm">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg ${meta.bg} text-white flex items-center justify-center text-xs font-bold flex-shrink-0`}>
                          {p.position.slice(0, 2)}
                        </div>
                        <span className="font-medium text-slate-900">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-slate-500">{p.realTeam}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.light}`}>{p.sport}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600 font-medium">{p.position}</td>
                    <td className="px-4 py-3 text-center font-bold text-slate-900">{p.seasonPoints?.toFixed(1)}</td>
                    <td className="px-4 py-3 text-center text-slate-400 hidden sm:table-cell">{p.projectedPoints?.toFixed(1)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        p.status === 'ACTIVE'   ? 'bg-green-100 text-green-700' :
                        p.status === 'INJURED'  ? 'bg-red-100 text-red-700' :
                        p.status === 'IR'       ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {p.status === 'ACTIVE' ? 'Active' : p.status}
                      </span>
                    </td>
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
