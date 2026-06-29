'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

type RosterPlayer = { rosterId: string; sport: string; id: string; name: string; position: string; realTeam: string; seasonPoints: number }
type Pick = { id: string; sport: string | null; round: number; year: number }
type Roster = { team: any; players: RosterPlayer[]; picks: Pick[] }
type Franchise = { id: string; name: string; abbreviation: string; ownerName: string | null; userId: string }
type Selection = { fromTeamId: string; toTeamId: string; type: 'player' | 'pick'; id: string; label: string }

const SPORTS = ['NFL', 'NBA', 'NHL', 'MLB']

export default function ProposeTradePage() {
  const { data: session } = useSession()
  const router = useRouter()

  const [leagues, setLeagues] = useState<any[]>([])
  const [leagueId, setLeagueId] = useState('')
  const [franchises, setFranchises] = useState<Franchise[]>([])
  const [partnerIds, setPartnerIds] = useState<string[]>([])
  const [rosters, setRosters] = useState<Record<string, Roster>>({})
  const [activeTeam, setActiveTeam] = useState('')
  const [sel, setSel] = useState<Record<string, Selection>>({})
  const [sport, setSport] = useState('NFL')
  const [search, setSearch] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetch('/api/leagues?mine=true').then(r => r.json()).then(ls => { setLeagues(ls); if (ls[0]) setLeagueId(ls[0].id) }) }, [])

  useEffect(() => {
    if (!leagueId) return
    fetch(`/api/teams?leagueId=${leagueId}`).then(r => r.json()).then((fs: Franchise[]) => { setFranchises(fs); setPartnerIds([]); setSel({}) })
  }, [leagueId])

  const myTeam = useMemo(() => franchises.find(f => f.userId === session?.user?.id), [franchises, session?.user?.id])
  const participants = useMemo(() => (myTeam ? [myTeam.id, ...partnerIds] : partnerIds), [myTeam, partnerIds])

  useEffect(() => { if (myTeam) setActiveTeam(myTeam.id) }, [myTeam])

  // Load rosters for all participants.
  useEffect(() => {
    participants.forEach(tid => {
      if (!rosters[tid]) fetch(`/api/teams/${tid}/roster`).then(r => r.json()).then(d => setRosters(prev => ({ ...prev, [tid]: d })))
    })
  }, [participants]) // eslint-disable-line

  const nameOf = (tid: string) => franchises.find(f => f.id === tid)?.abbreviation ?? '—'

  function toggle(fromTeamId: string, type: 'player' | 'pick', id: string, label: string) {
    const key = `${fromTeamId}:${type}:${id}`
    setSel(prev => {
      const next = { ...prev }
      if (next[key]) { delete next[key] }
      else {
        const dest = participants.find(t => t !== fromTeamId) ?? fromTeamId
        next[key] = { fromTeamId, toTeamId: dest, type, id, label }
      }
      return next
    })
  }
  function setDest(key: string, toTeamId: string) { setSel(prev => ({ ...prev, [key]: { ...prev[key], toTeamId } })) }

  async function submit() {
    const items = Object.values(sel)
    if (!items.length) return alert('Select at least one asset')
    setLoading(true)
    const res = await fetch('/api/trades', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leagueId, note,
        items: items.map(s => ({ fromTeamId: s.fromTeamId, toTeamId: s.toTeamId, [s.type === 'pick' ? 'pickId' : 'playerId']: s.id })),
      }),
    })
    setLoading(false)
    if (res.ok) router.push('/trade')
    else alert((await res.json()).error ?? 'Failed to send trade')
  }

  if (!session) return <div className="max-w-xl mx-auto px-4 py-16 text-center text-slate-500">Please sign in to propose a trade.</div>

  const roster = rosters[activeTeam]
  const playerList = (roster?.players ?? []).filter(p => p.sport === sport && (!search || p.name.toLowerCase().includes(search.toLowerCase())))
  const pickList = (roster?.picks ?? []).filter(p => p.sport === sport || p.sport === null)
  const otherParticipants = participants.filter(t => t !== activeTeam)
  const addablePartners = franchises.filter(f => f.userId !== session.user?.id && !partnerIds.includes(f.id))

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/trade" className="btn-ghost text-slate-500">← Back</Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Propose Trade</h1>
          <p className="text-slate-500 text-sm">Route players and picks between two or more franchises across any sport</p>
        </div>
      </div>

      {/* League + partners */}
      <div className="card p-4 mb-5 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          {leagues.length > 1 && (
            <div><label className="label">League</label>
              <select className="select" value={leagueId} onChange={e => setLeagueId(e.target.value)}>{leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            </div>
          )}
          <div className="flex-1 min-w-48">
            <label className="label">Add trade partner</label>
            <select className="select" value="" onChange={e => { if (e.target.value) setPartnerIds(p => [...p, e.target.value]) }}>
              <option value="">+ Add a franchise…</option>
              {addablePartners.map(f => <option key={f.id} value={f.id}>{f.name} ({f.ownerName})</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-slate-400">Participants:</span>
          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-700">{myTeam?.abbreviation} (you)</span>
          {partnerIds.map(pid => (
            <span key={pid} className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-700 flex items-center gap-1">
              {nameOf(pid)}
              <button onClick={() => { setPartnerIds(p => p.filter(x => x !== pid)); setSel(prev => Object.fromEntries(Object.entries(prev).filter(([, v]) => v.fromTeamId !== pid && v.toTeamId !== pid))) }} className="text-slate-400 hover:text-red-500">×</button>
            </span>
          ))}
          {partnerIds.length === 0 && <span className="text-xs text-slate-400">add at least one</span>}
        </div>
      </div>

      {participants.length >= 2 && (
        <>
          {/* Franchise + sport selectors */}
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            {participants.map(tid => (
              <button key={tid} onClick={() => setActiveTeam(tid)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${activeTeam === tid ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {nameOf(tid)}{tid === myTeam?.id ? ' (you)' : ''}
              </button>
            ))}
            <div className="ml-auto flex gap-1.5">
              {SPORTS.map(s => <button key={s} onClick={() => setSport(s)} className={`px-2.5 py-1 rounded-full text-xs font-semibold ${sport === s ? `${sportMeta(s).bg} text-white` : 'bg-slate-100 text-slate-600'}`}>{sportMeta(s).emoji}</button>)}
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="input w-36 text-sm py-1" />
          </div>

          <div className="grid lg:grid-cols-3 gap-5">
            {/* Asset list for active franchise */}
            <div className="lg:col-span-2 card overflow-hidden">
              <div className="card-header"><h2 className="font-semibold text-slate-900">{rosters[activeTeam]?.team?.name ?? '—'} · {sport}</h2></div>
              <div className="max-h-[30rem] overflow-y-auto divide-y divide-slate-50">
                {pickList.length > 0 && (
                  <div className="px-4 py-2 bg-slate-50/60">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Picks</p>
                    <div className="flex flex-wrap gap-1.5">
                      {pickList.map(pk => {
                        const key = `${activeTeam}:pick:${pk.id}`
                        return <button key={pk.id} onClick={() => toggle(activeTeam, 'pick', pk.id, `${pk.year} R${pk.round} ${pk.sport ?? ''}`)} className={`text-xs px-2 py-1 rounded ${sel[key] ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{pk.year} R{pk.round}</button>
                      })}
                    </div>
                  </div>
                )}
                {playerList.map(p => {
                  const key = `${activeTeam}:player:${p.id}`
                  return (
                    <button key={p.rosterId} onClick={() => toggle(activeTeam, 'player', p.id, p.name)} className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-slate-50 ${sel[key] ? 'bg-blue-50' : ''}`}>
                      <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${sel[key] ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{sel[key] ? '✓' : ''}</span>
                      <span className="flex-1 min-w-0"><span className="font-medium text-sm text-slate-900 truncate block">{p.name}</span><span className="text-xs text-slate-400">{p.position} · {p.realTeam} · {p.seasonPoints?.toFixed(1)}</span></span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Summary with destination routing */}
            <div className="card p-4">
              <h3 className="font-semibold text-slate-900 mb-3">Trade Summary</h3>
              {Object.keys(sel).length === 0 ? <p className="text-sm text-slate-300">No assets selected.</p> : (
                <div className="space-y-2 mb-4">
                  {Object.entries(sel).map(([key, s]) => (
                    <div key={key} className="text-sm border border-slate-100 rounded-lg p-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-800 truncate">{s.label}</span>
                        <button onClick={() => setSel(prev => { const n = { ...prev }; delete n[key]; return n })} className="text-red-400 hover:text-red-600">×</button>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                        <span className="font-semibold">{nameOf(s.fromTeamId)}</span> →
                        <select value={s.toTeamId} onChange={e => setDest(key, e.target.value)} className="border border-slate-200 rounded px-1 py-0.5 text-xs">
                          {participants.filter(t => t !== s.fromTeamId).map(t => <option key={t} value={t}>{nameOf(t)}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note…" className="input text-sm h-16 resize-none mb-3" />
              <button onClick={submit} disabled={loading || Object.keys(sel).length === 0} className="btn-primary w-full">{loading ? 'Sending…' : 'Send Trade Proposal'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
