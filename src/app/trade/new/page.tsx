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

const SPORTS = ['NFL', 'NBA', 'NHL', 'MLB']

export default function ProposeTradePage() {
  const { data: session } = useSession()
  const router = useRouter()

  const [leagues, setLeagues] = useState<any[]>([])
  const [leagueId, setLeagueId] = useState('')
  const [franchises, setFranchises] = useState<Franchise[]>([])
  const [partnerId, setPartnerId] = useState('')
  const [mine, setMine] = useState<Roster | null>(null)
  const [theirs, setTheirs] = useState<Roster | null>(null)
  const [give, setGive] = useState<Set<string>>(new Set())
  const [get, setGet] = useState<Set<string>>(new Set())
  const [sport, setSport] = useState('NFL')
  const [search, setSearch] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  // Load my leagues.
  useEffect(() => {
    fetch('/api/leagues?mine=true').then(r => r.json()).then(ls => {
      setLeagues(ls); if (ls[0]) setLeagueId(ls[0].id)
    })
  }, [])

  // Load franchises when league changes.
  useEffect(() => {
    if (!leagueId) return
    fetch(`/api/teams?leagueId=${leagueId}`).then(r => r.json()).then((fs: Franchise[]) => {
      setFranchises(fs)
      const others = fs.filter(f => f.userId !== session?.user?.id)
      setPartnerId(others[0]?.id ?? '')
    })
  }, [leagueId, session?.user?.id])

  const myTeam = useMemo(() => franchises.find(f => f.userId === session?.user?.id), [franchises, session?.user?.id])

  // Load both rosters.
  useEffect(() => {
    if (myTeam) fetch(`/api/teams/${myTeam.id}/roster`).then(r => r.json()).then(setMine)
  }, [myTeam])
  useEffect(() => {
    if (partnerId) fetch(`/api/teams/${partnerId}/roster`).then(r => r.json()).then(setTheirs)
    else setTheirs(null)
  }, [partnerId])

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, key: string) {
    const next = new Set(set)
    next.has(key) ? next.delete(key) : next.add(key)
    setter(next)
  }

  async function submit() {
    if (!partnerId) return alert('Pick a trade partner')
    if (give.size === 0 && get.size === 0) return alert('Add at least one asset')
    setLoading(true)
    const items = [
      ...[...give].map(k => toItem(k, 'GIVING')),
      ...[...get].map(k => toItem(k, 'RECEIVING')),
    ]
    const res = await fetch('/api/trades', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientTeamId: partnerId, note, items }),
    })
    setLoading(false)
    if (res.ok) router.push('/trade')
    else alert((await res.json()).error ?? 'Failed to send trade')
  }

  function toItem(key: string, direction: 'GIVING' | 'RECEIVING') {
    const [type, idv] = key.split(':')
    return type === 'pick' ? { direction, pickId: idv } : { direction, playerId: idv }
  }

  if (!session) return <div className="max-w-xl mx-auto px-4 py-16 text-center text-slate-500">Please sign in to propose a trade.</div>

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/trade" className="btn-ghost text-slate-500">← Back</Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Propose Trade</h1>
          <p className="text-slate-500 text-sm">Pick assets from real rosters — players and draft picks from any sport</p>
        </div>
      </div>

      {/* League + partner pickers */}
      <div className="card p-4 mb-5 flex flex-wrap gap-3 items-end">
        {leagues.length > 1 && (
          <div>
            <label className="label">League</label>
            <select className="select" value={leagueId} onChange={e => setLeagueId(e.target.value)}>
              {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
        <div className="flex-1 min-w-48">
          <label className="label">Trade partner</label>
          <select className="select" value={partnerId} onChange={e => setPartnerId(e.target.value)}>
            <option value="">Select a franchise…</option>
            {franchises.filter(f => f.userId !== session.user?.id).map(f => (
              <option key={f.id} value={f.id}>{f.name} ({f.ownerName})</option>
            ))}
          </select>
        </div>
        <div className="text-sm text-slate-500">
          You: <span className="font-semibold text-slate-800">{myTeam?.name ?? '—'}</span>
        </div>
      </div>

      {/* Sport filter */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {SPORTS.map(s => (
          <button key={s} onClick={() => setSport(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${sport === s ? `${sportMeta(s).bg} text-white` : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {sportMeta(s).emoji} {s}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players…" className="input w-44 text-sm py-1.5 ml-auto" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <RosterPanel title="You give" accent="blue" roster={mine} sport={sport} search={search} selected={give} onToggle={(k: string) => toggle(give, setGive, k)} />
        <RosterPanel title="You receive" accent="green" roster={theirs} sport={sport} search={search} selected={get} onToggle={(k: string) => toggle(get, setGet, k)} />
      </div>

      {/* Summary */}
      <div className="card p-4 mt-5">
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <SummaryList title="You give" accent="text-blue-700" roster={mine} keys={give} />
          <SummaryList title="You receive" accent="text-green-700" roster={theirs} keys={get} />
        </div>
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note…" className="input text-sm h-16 resize-none mb-3" />
        <button onClick={submit} disabled={loading || !partnerId} className="btn-primary w-full">
          {loading ? 'Sending…' : 'Send Trade Proposal'}
        </button>
      </div>
    </div>
  )
}

function RosterPanel({ title, accent, roster, sport, search, selected, onToggle }: any) {
  const players: RosterPlayer[] = (roster?.players ?? []).filter((p: RosterPlayer) =>
    p.sport === sport && (!search || p.name.toLowerCase().includes(search.toLowerCase())))
  const picks: Pick[] = (roster?.picks ?? []).filter((p: Pick) => p.sport === sport || p.sport === null)
  const accentBg = accent === 'blue' ? 'bg-blue-600' : 'bg-green-600'

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <span className="text-xs text-slate-400">{roster?.team?.name ?? 'Select a partner'}</span>
      </div>
      <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
        {!roster && <p className="px-4 py-6 text-sm text-slate-400 text-center">No roster loaded.</p>}
        {picks.length > 0 && (
          <div className="px-4 py-2 bg-slate-50/60">
            <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Draft Picks</p>
            <div className="flex flex-wrap gap-1.5">
              {picks.map(pk => {
                const key = `pick:${pk.id}`, on = selected.has(key)
                return (
                  <button key={pk.id} onClick={() => onToggle(key)}
                    className={`text-xs px-2 py-1 rounded ${on ? `${accentBg} text-white` : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                    {pk.year} R{pk.round}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {players.map(p => {
          const key = `player:${p.id}`, on = selected.has(key)
          return (
            <button key={p.rosterId} onClick={() => onToggle(key)} className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-slate-50 ${on ? 'bg-slate-50' : ''}`}>
              <span className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${on ? `${accentBg} text-white` : 'bg-slate-100 text-slate-400'}`}>{on ? '✓' : ''}</span>
              <span className="flex-1 min-w-0">
                <span className="font-medium text-sm text-slate-900 truncate block">{p.name}</span>
                <span className="text-xs text-slate-400">{p.position} · {p.realTeam} · {p.seasonPoints?.toFixed(1)} pts</span>
              </span>
            </button>
          )
        })}
        {roster && players.length === 0 && picks.length === 0 && <p className="px-4 py-6 text-sm text-slate-400 text-center">No {sport} assets.</p>}
      </div>
    </div>
  )
}

function SummaryList({ title, accent, roster, keys }: any) {
  const items = [...keys].map((k: string) => {
    const [type, idv] = k.split(':')
    if (type === 'pick') {
      const pk = (roster?.picks ?? []).find((p: Pick) => p.id === idv)
      return pk ? `${pk.year} ${pk.sport ?? ''} R${pk.round} pick` : 'Pick'
    }
    const pl = (roster?.players ?? []).find((p: RosterPlayer) => p.id === idv)
    return pl ? pl.name : 'Player'
  })
  return (
    <div>
      <p className={`text-xs font-semibold uppercase mb-1.5 ${accent}`}>{title}</p>
      {items.length === 0 ? <p className="text-sm text-slate-300">Nothing selected</p>
        : <ul className="text-sm text-slate-800 space-y-0.5">{items.map((t, i) => <li key={i}>• {t}</li>)}</ul>}
    </div>
  )
}
