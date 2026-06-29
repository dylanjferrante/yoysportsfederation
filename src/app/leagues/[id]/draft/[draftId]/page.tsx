'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

export default function DraftRoom() {
  const { id, draftId } = useParams<{ id: string; draftId: string }>()
  const { data: session } = useSession()
  const [s, setS] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'players' | 'board'>('players')

  const load = useCallback(() => { fetch(`/api/drafts/${draftId}`).then(r => r.json()).then(setS) }, [draftId])
  useEffect(() => { load() }, [load])

  async function action(payload: any) {
    setBusy(true)
    await fetch(`/api/drafts/${draftId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setBusy(false); load()
  }

  if (!s?.draft) return <div className="text-center py-20 text-slate-400">Loading draft…</div>
  const d = s.draft
  const myTeamId = s.myTeamId
  const onClock = s.onClockTeam
  const myTurn = onClock && myTeamId && onClock.id === myTeamId
  const queuedIds = new Set((s.myQueue ?? []).map((q: any) => q.playerId))
  const available = (s.available ?? []).filter((p: any) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
  const abbrOf = (tid: string) => (s.order ?? []).find((o: any) => o.id === tid)?.abbreviation ?? '—'

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <Link href={`/leagues/${id}/draft`} className="btn-ghost text-slate-500">← Drafts</Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{d.kind === 'DYNASTY' ? 'Dynasty Draft' : `${d.scope === 'OVERALL' ? 'Combined' : d.scope} Rookie Draft`}</h1>
          <p className="text-sm text-slate-500">{d.season} · {d.rounds} rounds · pick {s.current}/{s.total}</p>
        </div>
        <span className={`badge ${d.status === 'IN_PROGRESS' ? 'bg-green-100 text-green-700' : d.status === 'COMPLETED' ? 'bg-slate-100 text-slate-600' : 'bg-yellow-100 text-yellow-800'}`}>{d.status}</span>
      </div>

      {/* Control bar */}
      <div className="card p-4 mb-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          {d.status === 'PENDING' && <p className="text-slate-600">Draft hasn't started.</p>}
          {d.status === 'IN_PROGRESS' && onClock && <p className="text-slate-700">On the clock: <span className="font-bold text-slate-900">{onClock.name}</span>{myTurn && <span className="ml-2 text-green-600 font-semibold">— your pick!</span>}</p>}
          {d.status === 'COMPLETED' && <p className="text-slate-600 font-medium">Draft complete 🎉</p>}
        </div>
        <div className="flex items-center gap-2">
          {d.status === 'PENDING' && s.order?.some((o: any) => o.userId === session?.user?.id) && <button onClick={() => action({ action: 'START' })} disabled={busy} className="btn-primary">Start Draft</button>}
          {d.status === 'IN_PROGRESS' && myTeamId && (
            <button onClick={() => action({ action: 'TOGGLE_AUTOPICK' })} disabled={busy}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium ${s.myAutopick ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              Auto-draft {s.myAutopick ? 'ON' : 'OFF'}
            </button>
          )}
          {d.status === 'IN_PROGRESS' && myTurn && <button onClick={() => action({ action: 'AUTO_PICK' })} disabled={busy} className="btn-secondary text-sm">Auto-pick slot</button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-4">
        <button onClick={() => setTab('players')} className={tab === 'players' ? 'tab-active' : 'tab-inactive'}>Players & Queue</button>
        <button onClick={() => setTab('board')} className={tab === 'board' ? 'tab-active' : 'tab-inactive'}>Draft Board</button>
      </div>

      {tab === 'players' && (
        <div className="grid lg:grid-cols-3 gap-5">
          {/* Available */}
          <div className="lg:col-span-2 card overflow-hidden">
            <div className="card-header flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Best Available</h2>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="input w-40 text-sm py-1" />
            </div>
            <div className="max-h-[32rem] overflow-y-auto divide-y divide-slate-50">
              {available.slice(0, 150).map((p: any) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50">
                  <span className={`w-7 h-7 rounded-lg ${sportMeta(p.sport).bg} text-white flex items-center justify-center text-[10px] font-bold`}>{p.position?.slice(0, 2)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="font-medium text-sm text-slate-900 truncate block">{p.name}</span>
                    <span className="text-xs text-slate-400">{p.sport} · {p.realTeam} · value {p.value}</span>
                  </span>
                  {d.status === 'IN_PROGRESS' && myTurn && <button onClick={() => action({ action: 'PICK', playerId: p.id })} disabled={busy} className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-500">Draft</button>}
                  {myTeamId && !queuedIds.has(p.id) && <button onClick={() => action({ action: 'QUEUE_ADD', playerId: p.id })} disabled={busy} className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200">+ Queue</button>}
                  {queuedIds.has(p.id) && <span className="text-xs text-green-600 font-medium">queued</span>}
                </div>
              ))}
              {available.length === 0 && <p className="px-4 py-6 text-slate-400 text-sm text-center">No players available.</p>}
            </div>
          </div>

          {/* My queue */}
          <div className="card overflow-hidden">
            <div className="card-header"><h2 className="font-semibold text-slate-900">My Queue</h2></div>
            <div className="max-h-[32rem] overflow-y-auto divide-y divide-slate-50">
              {(!s.myQueue || s.myQueue.length === 0) && <p className="px-4 py-6 text-slate-400 text-sm text-center">Queue players to auto-draft them.</p>}
              {(s.myQueue ?? []).map((q: any, i: number) => (
                <div key={q.playerId} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="text-xs font-bold text-slate-400 w-5">{i + 1}</span>
                  <span className="flex-1 min-w-0"><span className="font-medium text-slate-900 truncate block">{q.name}</span><span className="text-xs text-slate-400">{q.sport} · {q.pos}</span></span>
                  <button onClick={() => action({ action: 'QUEUE_MOVE', playerId: q.playerId, direction: 'up' })} disabled={busy || i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30">▲</button>
                  <button onClick={() => action({ action: 'QUEUE_MOVE', playerId: q.playerId, direction: 'down' })} disabled={busy} className="text-slate-400 hover:text-slate-700">▼</button>
                  <button onClick={() => action({ action: 'QUEUE_REMOVE', playerId: q.playerId })} disabled={busy} className="text-red-400 hover:text-red-600">×</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'board' && (
        <div className="card p-4 overflow-x-auto">
          <div className="space-y-2">
            {Array.from({ length: d.rounds }, (_, r) => {
              const picks = (s.board ?? []).filter((b: any) => b.round === r + 1)
              return (
                <div key={r} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 w-10 flex-shrink-0">R{r + 1}</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {picks.map((b: any) => {
                      const isCurrent = b.pickNumber === s.current && d.status === 'IN_PROGRESS'
                      return (
                        <div key={b.pickNumber} className={`w-28 rounded-lg border px-2 py-1.5 ${isCurrent ? 'border-blue-500 bg-blue-50' : b.player ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'}`}>
                          <div className="text-[9px] text-slate-400">#{b.pickNumber} · {abbrOf(b.teamId)}</div>
                          {b.player ? <div className="text-xs font-semibold text-slate-800 truncate">{b.player.name}</div> : <div className="text-xs text-slate-300">{isCurrent ? 'on the clock' : '—'}</div>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
