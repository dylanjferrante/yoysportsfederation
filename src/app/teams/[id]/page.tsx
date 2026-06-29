'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

type P = { rosterId: string; slot: string; sport: string; id: string; name: string; position: string; realTeam: string; status: string; seasonPoints: number }
type Pick = { id: string; sport: string | null; round: number; year: number }
type Team = { id: string; name: string; abbreviation: string; logo: string | null; leagueId: string; ownerName: string | null }

const SPORTS = ['NFL', 'NBA', 'NHL', 'MLB']

export default function TeamPage() {
  const { id } = useParams<{ id: string }>()
  const [team, setTeam] = useState<Team | null>(null)
  const [players, setPlayers] = useState<P[]>([])
  const [picks, setPicks] = useState<Pick[]>([])
  const [sport, setSport] = useState('NFL')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/teams/${id}/roster`).then(r => r.json()).then(d => {
      setTeam(d.team); setPlayers(d.players ?? []); setPicks(d.picks ?? [])
      const first = SPORTS.find(s => (d.players ?? []).some((p: P) => p.sport === s))
      if (first) setSport(first)
      setLoading(false)
    })
  }, [id])

  const sportsPresent = SPORTS.filter(s => players.some(p => p.sport === s))
  const rosterForSport = players.filter(p => p.sport === sport)
  const picksForSport = picks.filter(p => p.sport === sport || p.sport === null)

  if (loading) return <div className="text-center py-20 text-slate-400">Loading franchise…</div>
  if (!team) return <div className="text-center py-20 text-slate-400">Franchise not found.</div>

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        {team.logo
          ? <img src={team.logo} alt="" className="w-16 h-16 rounded-2xl object-cover bg-slate-100" />
          : <div className="w-16 h-16 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-xl font-bold">{team.abbreviation}</div>}
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{team.name}</h1>
          <p className="text-slate-500 text-sm">{team.ownerName} · {players.length} players across {sportsPresent.length} sports</p>
        </div>
        <Link href={`/leagues/${team.leagueId}`} className="btn-secondary text-sm">← League</Link>
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-5 overflow-x-auto">
        {sportsPresent.map(s => (
          <button key={s} onClick={() => setSport(s)} className={sport === s ? 'tab-active' : 'tab-inactive'}>
            {sportMeta(s).emoji} {s} <span className="text-xs opacity-60">({players.filter(p => p.sport === s).length})</span>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="card-header"><h2 className="font-semibold text-slate-900">{sportMeta(sport).emoji} {sport} Roster</h2></div>
          <div className="max-h-[32rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-xs text-slate-400 border-b border-slate-100">
                  <th className="text-left px-4 py-2 font-medium">Slot</th>
                  <th className="text-left px-2 py-2 font-medium">Player</th>
                  <th className="text-left px-2 py-2 font-medium hidden sm:table-cell">Pos</th>
                  <th className="text-center px-4 py-2 font-medium">Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rosterForSport.map(p => (
                  <tr key={p.rosterId} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.slot === 'BN' || p.slot === 'IR' || p.slot === 'IL' || p.slot === 'DL' ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-blue-700'}`}>{p.slot}</span>
                    </td>
                    <td className="px-2 py-2 font-medium text-slate-900">
                      {p.name}{p.status !== 'ACTIVE' && <span className="ml-1 text-[10px] text-red-500">{p.status}</span>}
                    </td>
                    <td className="px-2 py-2 text-slate-500 hidden sm:table-cell">{p.position} · {p.realTeam}</td>
                    <td className="px-4 py-2 text-center font-semibold text-slate-800">{p.seasonPoints?.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2 className="font-semibold text-slate-900">Draft Picks</h2></div>
          <div className="card-body space-y-1.5 text-sm max-h-[32rem] overflow-y-auto">
            {picksForSport.length === 0
              ? <p className="text-slate-400">No tradeable picks for {sport}.</p>
              : picksForSport.map(pk => (
                <div key={pk.id} className="flex items-center justify-between py-1 border-b border-slate-50">
                  <span className="font-medium text-slate-800">{pk.year} {pk.sport ?? 'OVERALL'}</span>
                  <span className="text-slate-500">Round {pk.round}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}
