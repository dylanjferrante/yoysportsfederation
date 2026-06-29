'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

type Player = { id: string; name: string; sport: string; position: string; realTeam: string; seasonPoints: number }
type Pick   = { id: string; sport: string; round: number; year: number }
type Team   = { id: string; name: string; abbreviation: string; leagueId: string }

type SelectedItem = { type: 'player'; data: Player } | { type: 'pick'; data: Pick }

export default function ProposeTradeNew() {
  const { data: session } = useSession()
  const router = useRouter()

  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [myTeams, setMyTeams] = useState<Team[]>([])
  const [recipientTeams, setRecipientTeams] = useState<Team[]>([])
  const [recipientId, setRecipientId] = useState('')
  const [note, setNote] = useState('')
  const [giving, setGiving] = useState<SelectedItem[]>([])
  const [receiving, setReceiving] = useState<SelectedItem[]>([])
  const [sportFilter, setSportFilter] = useState('NFL')
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/players').then(r => r.json()).then(setAllPlayers)
    // In a real app, fetch user's own teams and all other teams
  }, [])

  const filtered = allPlayers
    .filter(p => p.sport === sportFilter)
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 40)

  function toggleItem(item: SelectedItem, side: 'giving' | 'receiving') {
    const list  = side === 'giving' ? giving : receiving
    const setList = side === 'giving' ? setGiving : setReceiving
    const exists = list.some(i => i.type === item.type && (i.type === 'player' ? (i.data as Player).id === (item.data as Player).id : (i.data as Pick).id === (item.data as Pick).id))
    if (exists) setList(list.filter(i => !(i.type === item.type && JSON.stringify(i.data) === JSON.stringify(item.data))))
    else setList([...list, item])
  }

  async function submit() {
    if (!recipientId) return alert('Select a recipient team')
    if (giving.length === 0 && receiving.length === 0) return alert('Add at least one asset to the trade')
    setLoading(true)
    const items = [
      ...giving.map(i => ({
        direction: 'GIVING',
        playerId: i.type === 'player' ? (i.data as Player).id : undefined,
        pickId:   i.type === 'pick'   ? (i.data as Pick).id   : undefined,
      })),
      ...receiving.map(i => ({
        direction: 'RECEIVING',
        playerId: i.type === 'player' ? (i.data as Player).id : undefined,
        pickId:   i.type === 'pick'   ? (i.data as Pick).id   : undefined,
      })),
    ]
    const res = await fetch('/api/trades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientTeamId: recipientId, note, items }),
    })
    setLoading(false)
    if (res.ok) router.push('/trade')
  }

  function SportBtn({ s }: { s: string }) {
    const m = sportMeta(s)
    return (
      <button onClick={() => setSportFilter(s)}
        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${sportFilter === s ? `${m.bg} text-white` : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
        {m.emoji} {s}
      </button>
    )
  }

  function SelectedList({ items, side }: { items: SelectedItem[]; side: 'giving' | 'receiving' }) {
    if (!items.length) return <p className="text-sm text-slate-300 py-2">None selected</p>
    return (
      <div className="space-y-1.5">
        {items.map((item, i) => {
          const m = sportMeta(item.type === 'player' ? (item.data as Player).sport : (item.data as Pick).sport)
          return (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${m.light}`}>{item.type === 'player' ? (item.data as Player).sport : (item.data as Pick).sport}</span>
              <span className="text-slate-800 font-medium flex-1">
                {item.type === 'player' ? (item.data as Player).name : `${(item.data as Pick).year} Rd ${(item.data as Pick).round}`}
              </span>
              <button onClick={() => toggleItem(item, side)} className="text-red-400 hover:text-red-600">×</button>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/trade" className="btn-ghost text-slate-500">← Back</Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Propose Trade</h1>
          <p className="text-slate-500 text-sm">Select players and picks from any sport</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Player browser */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="card-header">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="font-semibold text-slate-900">Browse Players</h2>
                <input type="search" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} className="input w-40 text-sm py-1.5" />
              </div>
              <div className="flex gap-2 flex-wrap">
                {['NFL','NBA','NHL','MLB'].map(s => <SportBtn key={s} s={s} />)}
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
              {filtered.map(player => {
                const inGiving    = giving.some(i => i.type === 'player' && (i.data as Player).id === player.id)
                const inReceiving = receiving.some(i => i.type === 'player' && (i.data as Player).id === player.id)
                const meta = sportMeta(player.sport)
                return (
                  <div key={player.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors">
                    <div className={`w-8 h-8 rounded-lg ${meta.bg} text-white flex items-center justify-center text-xs font-bold flex-shrink-0`}>
                      {player.position.slice(0,2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-slate-900 truncate">{player.name}</p>
                      <p className="text-xs text-slate-400">{player.realTeam} · {player.position} · {player.seasonPoints?.toFixed(1)} pts</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => toggleItem({ type: 'player', data: player }, 'giving')}
                        className={`text-xs px-2 py-1 rounded transition-colors ${inGiving ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        Give
                      </button>
                      <button onClick={() => toggleItem({ type: 'player', data: player }, 'receiving')}
                        className={`text-xs px-2 py-1 rounded transition-colors ${inReceiving ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        Get
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Trade summary */}
        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="font-semibold text-slate-900 mb-3">Trade Summary</h3>

            <div className="mb-4">
              <label className="label">Recipient Team</label>
              <input className="input text-sm" placeholder="Paste team ID (demo)" value={recipientId} onChange={e => setRecipientId(e.target.value)} />
              <p className="text-xs text-slate-400 mt-1">In full app: search teams from all your leagues</p>
            </div>

            <div className="mb-3">
              <p className="text-xs font-semibold text-blue-700 uppercase mb-1.5">You Give</p>
              <SelectedList items={giving} side="giving" />
            </div>

            <div className="border-t border-slate-100 pt-3 mb-4">
              <p className="text-xs font-semibold text-green-700 uppercase mb-1.5">You Receive</p>
              <SelectedList items={receiving} side="receiving" />
            </div>

            <div className="mb-4">
              <label className="label">Trade Note (optional)</label>
              <textarea className="input text-sm h-20 resize-none" placeholder="Explain the trade…" value={note} onChange={e => setNote(e.target.value)} />
            </div>

            <button onClick={submit} disabled={loading} className="btn-primary w-full">
              {loading ? 'Sending…' : 'Send Trade Proposal'}
            </button>
          </div>

          <div className="card p-4 bg-blue-50 border-blue-100">
            <p className="text-sm font-semibold text-blue-900 mb-1">Cross-Sport Tip</p>
            <p className="text-xs text-blue-700">You can include players and picks from different sports in one trade. Switch sport tabs above to mix assets.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
