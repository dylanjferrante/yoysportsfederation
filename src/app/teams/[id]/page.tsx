'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'
import { eligibleSlots } from '@/lib/defaults'

type P = { rosterId: string; slot: string; sport: string; id: string; name: string; position: string; realTeam: string; status: string; seasonPoints: number }
type Pick = { id: string; sport: string | null; round: number; year: number }
type Team = { id: string; name: string; abbreviation: string; logo: string | null; altLogo: string | null; wordmark: string | null; primaryColor: string; secondaryColor: string; leagueId: string; userId: string; ownerName: string | null }
type FA = { id: string; name: string; position: string; realTeam: string; seasonPoints: number; status: string }

const SPORTS = ['NFL', 'NBA', 'NHL', 'MLB']
const STARTER = (slot: string) => !['BN', 'IR', 'IL', 'DL', 'TAXI'].includes(slot)

export default function TeamPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<any>(null)
  const [history, setHistory] = useState<any>(null)
  const [sport, setSport] = useState('NFL')
  const [view, setView] = useState<'roster' | 'history'>('roster')
  const [fa, setFa] = useState<FA[]>([])
  const [showFA, setShowFA] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [brand, setBrand] = useState<any>({})
  const [openSlot, setOpenSlot] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch(`/api/teams/${id}/roster`).then(r => r.json()).then(d => {
      setData(d)
      const first = SPORTS.find(s => (d.players ?? []).some((p: P) => p.sport === s))
      if (first) setSport(first)
      setLoading(false)
    })
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => { fetch(`/api/teams/${id}/history`).then(r => r.json()).then(setHistory) }, [id])
  useEffect(() => {
    if (showFA && data?.team) fetch(`/api/players?sport=${sport}&free=true&leagueId=${data.team.leagueId}`).then(r => r.json()).then(setFa)
  }, [showFA, sport, data?.team])

  async function act(payload: any) {
    await fetch(`/api/teams/${id}/roster`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    load()
  }

  async function saveBranding() {
    await fetch(`/api/teams/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(brand) })
    setEditing(false); load()
  }

  if (loading) return <div className="text-center py-20 text-slate-400">Loading franchise…</div>
  if (!data?.team) return <div className="text-center py-20 text-slate-400">Franchise not found.</div>

  const team: Team = data.team
  const players: P[] = data.players ?? []
  const picks: Pick[] = data.picks ?? []
  const canManage: boolean = data.canManage
  const sportsPresent = SPORTS.filter(s => players.some(p => p.sport === s))
  const rosterForSport = players.filter(p => p.sport === sport).sort((a, b) => (STARTER(b.slot) ? 1 : 0) - (STARTER(a.slot) ? 1 : 0) || b.seasonPoints - a.seasonPoints)
  const picksForSport = picks.filter(p => p.sport === sport || p.sport === null)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Branded header */}
      <div className="rounded-2xl p-5 mb-6 flex items-center gap-4 flex-wrap" style={{ background: `linear-gradient(135deg, ${team.primaryColor} 0%, ${team.secondaryColor} 140%)` }}>
        {team.logo
          ? <img src={team.logo} alt="" className="w-16 h-16 rounded-2xl object-cover bg-white/10" />
          : <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black text-white/90" style={{ backgroundColor: team.secondaryColor }}>{team.abbreviation}</div>}
        <div className="flex-1 min-w-0">
          {team.wordmark && team.wordmark.startsWith('http')
            ? <img src={team.wordmark} alt={team.name} className="h-8 mb-1" />
            : <h1 className="text-2xl font-black text-white">{team.wordmark || team.name}</h1>}
          <p className="text-white/70 text-sm">{team.ownerName} · {players.length} players{canManage && ' · your franchise'}</p>
        </div>
        {team.altLogo && <img src={team.altLogo} alt="" className="w-12 h-12 rounded-xl object-cover bg-white/10 hidden sm:block" />}
        <div className="flex gap-2">
          {canManage && <button onClick={() => { setBrand({ name: team.name, abbreviation: team.abbreviation, logo: team.logo ?? '', altLogo: team.altLogo ?? '', wordmark: team.wordmark ?? '', primaryColor: team.primaryColor, secondaryColor: team.secondaryColor }); setEditing(!editing) }} className="bg-white/15 hover:bg-white/25 text-white text-sm px-3 py-1.5 rounded-lg">Edit</button>}
          <Link href={`/leagues/${team.leagueId}`} className="bg-white/15 hover:bg-white/25 text-white text-sm px-3 py-1.5 rounded-lg">← League</Link>
        </div>
      </div>

      {/* Branding editor */}
      {editing && (
        <div className="card p-5 mb-6 space-y-3">
          <h3 className="font-semibold text-slate-900">Team Branding</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="label">Team Name</label><input className="input" value={brand.name} onChange={e => setBrand({ ...brand, name: e.target.value })} /></div>
            <div><label className="label">Abbreviation</label><input className="input" maxLength={5} value={brand.abbreviation} onChange={e => setBrand({ ...brand, abbreviation: e.target.value.toUpperCase() })} /></div>
            <div><label className="label">Logo URL</label><input className="input" placeholder="https://…" value={brand.logo} onChange={e => setBrand({ ...brand, logo: e.target.value })} /></div>
            <div><label className="label">Alternate Logo URL</label><input className="input" placeholder="https://…" value={brand.altLogo} onChange={e => setBrand({ ...brand, altLogo: e.target.value })} /></div>
            <div><label className="label">Wordmark (text or image URL)</label><input className="input" value={brand.wordmark} onChange={e => setBrand({ ...brand, wordmark: e.target.value })} /></div>
            <div className="flex gap-4">
              <div><label className="label">Primary</label><input type="color" className="h-10 w-16 rounded border border-slate-200" value={brand.primaryColor} onChange={e => setBrand({ ...brand, primaryColor: e.target.value })} /></div>
              <div><label className="label">Secondary</label><input type="color" className="h-10 w-16 rounded border border-slate-200" value={brand.secondaryColor} onChange={e => setBrand({ ...brand, secondaryColor: e.target.value })} /></div>
            </div>
          </div>
          <div className="flex gap-2"><button onClick={saveBranding} className="btn-primary">Save Branding</button><button onClick={() => setEditing(false)} className="btn-secondary">Cancel</button></div>
        </div>
      )}

      {/* View + sport tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-5 overflow-x-auto">
        <button onClick={() => setView('roster')} className={view === 'roster' ? 'tab-active' : 'tab-inactive'}>Roster</button>
        <button onClick={() => setView('history')} className={view === 'history' ? 'tab-active' : 'tab-inactive'}>History</button>
      </div>

      {view === 'roster' && (
        <>
          <div className="flex gap-2 mb-4 flex-wrap items-center">
            {sportsPresent.map(s => (
              <button key={s} onClick={() => setSport(s)} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${sport === s ? `${sportMeta(s).bg} text-white` : 'bg-slate-100 text-slate-600'}`}>
                {sportMeta(s).emoji} {s} ({players.filter(p => p.sport === s).length})
              </button>
            ))}
            {canManage && <button onClick={() => setShowFA(!showFA)} className="ml-auto btn-secondary text-sm">{showFA ? 'Hide' : '+ Add'} Free Agents</button>}
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 card overflow-hidden">
              <div className="card-header"><h2 className="font-semibold text-slate-900">{sportMeta(sport).emoji} {sport} Roster</h2></div>
              <div className="max-h-[34rem] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="text-xs text-slate-400 border-b border-slate-100">
                      <th className="text-left px-3 py-2 font-medium">Slot</th>
                      <th className="text-left px-2 py-2 font-medium">Player</th>
                      <th className="text-center px-2 py-2 font-medium">Pts</th>
                      {canManage && <th className="text-right px-3 py-2 font-medium">Manage</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rosterForSport.map(p => {
                      const slots = eligibleSlots(p.position, (data.rosterSettings ?? {})[sport] ?? {})
                      const open = openSlot === p.rosterId
                      return (
                        <tr key={p.rosterId} className={`hover:bg-slate-50 ${STARTER(p.slot) ? '' : 'bg-slate-50/40'}`}>
                          <td className="px-3 py-2 relative">
                            <button onClick={() => canManage && setOpenSlot(open ? null : p.rosterId)} disabled={!canManage}
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STARTER(p.slot) ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'} ${canManage ? 'hover:ring-2 hover:ring-blue-200 cursor-pointer' : ''}`}>
                              {p.slot}{canManage && ' ▾'}
                            </button>
                            {open && (
                              <div className="absolute z-20 left-2 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-1 w-28">
                                <p className="text-[10px] text-slate-400 px-1 pb-1">Move to…</p>
                                {slots.map(slot => (
                                  <button key={slot} onClick={() => { act({ action: 'SET_SLOT', rosterId: p.rosterId, slot }); setOpenSlot(null) }}
                                    className={`block w-full text-left text-xs px-2 py-1 rounded hover:bg-slate-100 ${slot === p.slot ? 'font-bold text-blue-600' : 'text-slate-700'}`}>
                                    {slot}{slot === p.slot ? ' ✓' : ''}
                                  </button>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <button onClick={() => canManage && setOpenSlot(open ? null : p.rosterId)} className={`text-left ${canManage ? 'hover:text-blue-600' : ''}`} disabled={!canManage}>
                              <span className="font-medium text-slate-900">{p.name}</span>
                              <span className="text-xs text-slate-400"> · {p.position} · {p.realTeam}{p.status !== 'ACTIVE' && <span className="text-red-500"> · {p.status}</span>}</span>
                            </button>
                          </td>
                          <td className="px-2 py-2 text-center font-semibold text-slate-800">{p.seasonPoints?.toFixed(1)}</td>
                          {canManage && <td className="px-3 py-2 text-right"><button onClick={() => act({ action: 'DROP', rosterId: p.rosterId })} className="text-xs text-red-500 hover:text-red-700">Drop</button></td>}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-4">
              <div className="card">
                <div className="card-header"><h2 className="font-semibold text-slate-900">Draft Picks</h2></div>
                <div className="card-body space-y-1.5 text-sm max-h-48 overflow-y-auto">
                  {picksForSport.length === 0 ? <p className="text-slate-400">No picks for {sport}.</p>
                    : picksForSport.map(pk => (
                      <div key={pk.id} className="flex items-center justify-between py-1 border-b border-slate-50">
                        <span className="font-medium text-slate-800">{pk.year} {pk.sport ?? 'OVERALL'}</span>
                        <span className="text-slate-500">Round {pk.round}</span>
                      </div>
                    ))}
                </div>
              </div>

              {canManage && showFA && (
                <div className="card">
                  <div className="card-header"><h2 className="font-semibold text-slate-900">{sport} Free Agents</h2></div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                    {fa.slice(0, 60).map(p => (
                      <div key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="flex-1 min-w-0">
                          <span className="font-medium text-slate-900 truncate block">{p.name}</span>
                          <span className="text-xs text-slate-400">{p.position} · {p.realTeam} · {p.seasonPoints?.toFixed(1)}</span>
                        </span>
                        <button onClick={() => act({ action: 'ADD', playerId: p.id })} className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-500">Add</button>
                      </div>
                    ))}
                    {fa.length === 0 && <p className="px-3 py-4 text-slate-400 text-sm">No free agents.</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {view === 'history' && <FranchiseHistory history={history} />}
    </div>
  )
}

function FranchiseHistory({ history }: { history: any }) {
  const [sport, setSport] = useState('NFL')
  if (!history) return <div className="text-slate-400 py-8 text-center">Loading history…</div>
  const records: any[] = history.records ?? []
  const opponents: any[] = history.opponents ?? []
  const seasons = [...new Set(records.map(r => r.season))].sort().reverse()
  const sportsPresent = SPORTS.filter(s => records.some(r => r.sport === s))

  return (
    <div className="space-y-6">
      <div className="card overflow-x-auto">
        <div className="card-header"><h2 className="font-semibold text-slate-900">Season-by-Season</h2></div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2 font-medium">Season</th>
              {sportsPresent.map(s => <th key={s} className="text-center px-3 py-2 font-medium">{sportMeta(s).emoji} {s}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {seasons.map(season => (
              <tr key={season} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-600">{season}</td>
                {sportsPresent.map(s => {
                  const r = records.find(x => x.season === season && x.sport === s)
                  return <td key={s} className="text-center px-3 py-2">{r ? <span>{r.wins}-{r.losses}{r.isChampion ? ' 🏆' : ''} <span className="text-xs text-slate-400">#{r.finishPosition}</span></span> : '—'}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Opponents & Results</h2>
          <div className="flex gap-1.5">
            {sportsPresent.map(s => (
              <button key={s} onClick={() => setSport(s)} className={`px-2 py-1 rounded-full text-xs font-semibold ${sport === s ? `${sportMeta(s).bg} text-white` : 'bg-slate-100 text-slate-600'}`}>{sportMeta(s).emoji}</button>
            ))}
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white"><tr className="text-xs text-slate-400 border-b border-slate-100">
              <th className="text-left px-4 py-2 font-medium">Season</th><th className="text-center px-2 py-2 font-medium">Wk</th>
              <th className="text-left px-2 py-2 font-medium">Opp</th><th className="text-center px-2 py-2 font-medium">Score</th><th className="text-center px-3 py-2 font-medium">Result</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {opponents.filter(o => o.sport === sport).sort((a, b) => (b.season ?? '').localeCompare(a.season ?? '') || b.week - a.week).slice(0, 200).map((o, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-1.5 text-slate-500">{o.season}</td>
                  <td className="px-2 py-1.5 text-center text-slate-400">{o.week}</td>
                  <td className="px-2 py-1.5 font-medium text-slate-800">{o.opponent}</td>
                  <td className="px-2 py-1.5 text-center text-slate-600">{o.my?.toFixed(1)}–{o.their?.toFixed(1)}</td>
                  <td className="px-3 py-1.5 text-center"><span className={`text-xs font-bold ${o.result === 'W' ? 'text-green-600' : o.result === 'L' ? 'text-red-500' : 'text-slate-400'}`}>{o.result}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
