'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

export default function DraftRoom() {
  const { id, draftId } = useParams<{ id: string; draftId: string }>()
  const { data: session } = useSession()
  const [state, setState] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/drafts/${draftId}`).then(r => r.json()).then(setState)
  }, [draftId])
  useEffect(() => { load() }, [load])

  async function action(payload: any) {
    setBusy(true)
    await fetch(`/api/drafts/${draftId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setBusy(false)
    load()
  }

  if (!state?.draft) return <div className="text-center py-20 text-slate-400">Loading draft…</div>
  const d = state.draft
  const myTeam = (state.order ?? []).find((o: any) => o.userId === session?.user?.id)
  const onClock = state.onClockTeam
  const myTurn = onClock && myTeam && onClock.id === myTeam.id
  const available = (state.available ?? []).filter((p: any) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
  const made: any[] = state.made ?? []

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Link href={`/leagues/${id}/draft`} className="btn-ghost text-slate-500">← Drafts</Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">
            {d.kind === 'DYNASTY' ? 'Dynasty Draft' : `${d.scope === 'OVERALL' ? 'Combined' : d.scope} Rookie Draft`}
          </h1>
          <p className="text-sm text-slate-500">{d.season} · {d.rounds} rounds · pick {state.current}/{state.total}</p>
        </div>
        <span className={`badge ${d.status === 'IN_PROGRESS' ? 'bg-green-100 text-green-700' : d.status === 'COMPLETED' ? 'bg-slate-100 text-slate-600' : 'bg-yellow-100 text-yellow-800'}`}>{d.status}</span>
      </div>

      {/* On the clock */}
      <div className="card p-4 mb-5 flex items-center justify-between flex-wrap gap-3">
        {d.status === 'PENDING' && <p className="text-slate-600">Draft hasn't started.</p>}
        {d.status === 'IN_PROGRESS' && onClock && (
          <p className="text-slate-700">On the clock: <span className="font-bold text-slate-900">{onClock.name}</span>{myTurn && <span className="ml-2 text-green-600 font-semibold">— that's you!</span>}</p>
        )}
        {d.status === 'COMPLETED' && <p className="text-slate-600 font-medium">Draft complete 🎉</p>}
        {d.status === 'PENDING' && state.order?.some((o: any) => o.userId === session?.user?.id) && (
          <button onClick={() => action({ action: 'START' })} disabled={busy} className="btn-primary">Start Draft</button>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Available players */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Available Players</h2>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="input w-40 text-sm py-1" />
          </div>
          <div className="max-h-[34rem] overflow-y-auto divide-y divide-slate-50">
            {available.slice(0, 150).map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50">
                <span className={`w-7 h-7 rounded-lg ${sportMeta(p.sport).bg} text-white flex items-center justify-center text-[10px] font-bold`}>{p.position?.slice(0, 2)}</span>
                <span className="flex-1 min-w-0">
                  <span className="font-medium text-sm text-slate-900 truncate block">{p.name}</span>
                  <span className="text-xs text-slate-400">{p.sport} · {p.realTeam} · {p.seasonPoints?.toFixed(1)} pts</span>
                </span>
                {d.status === 'IN_PROGRESS' && (myTurn || !myTeam) && (
                  <button onClick={() => action({ action: 'PICK', playerId: p.id })} disabled={busy || (!myTurn)}
                    className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40">Draft</button>
                )}
              </div>
            ))}
            {available.length === 0 && <p className="px-4 py-6 text-slate-400 text-sm text-center">No players available.</p>}
          </div>
        </div>

        {/* Recent picks */}
        <div className="card overflow-hidden">
          <div className="card-header"><h2 className="font-semibold text-slate-900">Picks</h2></div>
          <div className="max-h-[34rem] overflow-y-auto divide-y divide-slate-50">
            {made.length === 0 && <p className="px-4 py-6 text-slate-400 text-sm text-center">No picks yet.</p>}
            {[...made].reverse().map((m: any) => (
              <div key={m.pickNumber} className="flex items-center gap-2 px-4 py-2 text-sm">
                <span className="text-xs font-bold text-slate-400 w-8">#{m.pickNumber}</span>
                <span className="flex-1 min-w-0">
                  <span className="font-medium text-slate-900 truncate block">{m.playerName ?? '—'}</span>
                  <span className="text-xs text-slate-400">{m.sport} · {(state.order ?? []).find((o: any) => o.id === m.teamId)?.abbreviation}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
