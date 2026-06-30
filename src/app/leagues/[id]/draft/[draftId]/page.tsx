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

  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(() => { fetch(`/api/drafts/${draftId}`).then(r => r.json()).then(setS) }, [draftId])
  useEffect(() => { load() }, [load])

  async function action(payload: any) {
    setBusy(true)
    await fetch(`/api/drafts/${draftId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setBusy(false); load()
  }

  // Live clock: tick every second; poll + advance the server clock when it expires.
  const live = s?.draft?.status === 'IN_PROGRESS'
  const deadline = s?.draft?.pickDeadline ? Date.parse(s.draft.pickDeadline) : null
  const remaining = deadline ? Math.max(0, Math.round((deadline - now) / 1000)) : null
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [live])
  useEffect(() => {
    if (!live) return
    const poll = setInterval(() => load(), 4000)
    return () => clearInterval(poll)
  }, [live, load])
  useEffect(() => {
    if (live && deadline && now >= deadline && !busy) {
      action({ action: 'TICK' })
    }
  }, [live, deadline, now]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!s?.draft) return <div className="text-center py-20 text-slate-400">Loading draft…</div>
  const d = s.draft
  const myTeamId = s.myTeamId
  const onClock = s.onClockTeam
  const myTurn = onClock && myTeamId && onClock.id === myTeamId

  // Auction state
  const isAuction = d.type === 'AUCTION'
  const au = s.auction
  const myNomTurn = isAuction && au && myTeamId && au.nominatorId === myTeamId && !au.nomPlayer
  const canNominate = isAuction && d.status === 'IN_PROGRESS' && !au?.nomPlayer && (myNomTurn || s.order?.some((o: any) => o.userId === session?.user?.id && o.id === au?.nominatorId))
  const teamName = (tid: string) => (s.order ?? []).find((o: any) => o.id === tid)?.name ?? '—'
  const queuedIds = new Set((s.myQueue ?? []).map((q: any) => q.playerId))
  const available = (s.available ?? []).filter((p: any) => !search || p.name.toLowerCase().includes(search.toLowerCase()))

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
          {d.status === 'IN_PROGRESS' && onClock && (
            <div className="flex items-center gap-3">
              {remaining != null && (
                <span className={`tabular-nums font-black text-2xl leading-none ${remaining <= 10 ? 'text-red-600' : 'text-slate-900'}`}>
                  {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
                </span>
              )}
              <p className="text-slate-700">On the clock: <span className="font-bold text-slate-900">{onClock.name}</span>{myTurn && <span className="ml-2 text-green-600 font-semibold">— your pick!</span>}</p>
            </div>
          )}
          {d.status === 'COMPLETED' && <p className="text-slate-600 font-medium">Draft complete 🎉</p>}
          {d.status === 'PAUSED' && <p className="text-amber-600 font-semibold">⏸ Draft paused by commissioner</p>}
        </div>
        <div className="flex items-center gap-2">
          {d.status === 'PENDING' && s.isCommish && <button onClick={() => action({ action: 'START' })} disabled={busy} className="btn-primary">Start Draft</button>}
          {d.status === 'IN_PROGRESS' && myTeamId && (
            <button onClick={() => action({ action: 'TOGGLE_AUTOPICK' })} disabled={busy}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium ${s.myAutopick ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              Auto-draft {s.myAutopick ? 'ON' : 'OFF'}
            </button>
          )}
          {d.status === 'IN_PROGRESS' && myTurn && <button onClick={() => action({ action: 'AUTO_PICK' })} disabled={busy} className="btn-secondary text-sm">Auto-pick slot</button>}

          {/* Commissioner draft controls */}
          {s.isCommish && d.status === 'IN_PROGRESS' && (
            <>
              <button onClick={() => action({ action: 'FORCE_AUTOPICK' })} disabled={busy} className="text-sm px-3 py-1.5 rounded-lg font-medium bg-slate-100 text-slate-700 hover:bg-slate-200">Skip / force pick</button>
              <button onClick={() => action({ action: 'PAUSE' })} disabled={busy} className="text-sm px-3 py-1.5 rounded-lg font-medium bg-amber-100 text-amber-700 hover:bg-amber-200">Pause</button>
            </>
          )}
          {s.isCommish && d.status === 'PAUSED' && (
            <button onClick={() => action({ action: 'RESUME' })} disabled={busy} className="btn-primary text-sm">Resume draft</button>
          )}
          {s.isCommish && d.status !== 'PENDING' && (
            <button onClick={async () => {
              if (!confirm('⚠️ Reset this draft?\n\nEvery pick is cleared and all players drafted here are removed from rosters. This cannot be undone.')) return
              if (!confirm('Are you absolutely sure? The draft will reopen to PENDING and must be re-run.')) return
              if (prompt('Final confirmation — type RESET to proceed.') !== 'RESET') return
              setBusy(true)
              await fetch(`/api/leagues/${id}/dynasty`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'RESET', draftId: d.id }) })
              setBusy(false); load()
            }} disabled={busy} className="text-sm px-3 py-1.5 rounded-lg font-medium bg-red-50 text-red-600 hover:bg-red-100">Reset draft</button>
          )}
        </div>
      </div>

      {/* Auction: live nomination + budgets */}
      {isAuction && d.status === 'IN_PROGRESS' && (
        <div className="grid lg:grid-cols-3 gap-5 mb-5">
          <div className="lg:col-span-2 card p-5">
            {au?.nomPlayer ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className={`w-10 h-10 rounded-xl ${sportMeta(au.nomPlayer.sport).bg} text-white flex items-center justify-center text-xs font-bold`}>{au.nomPlayer.position?.slice(0, 2)}</span>
                    <div>
                      <p className="font-bold text-slate-900">{au.nomPlayer.name}</p>
                      <p className="text-xs text-slate-400">{au.nomPlayer.sport} · {au.nomPlayer.realTeam}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-black tabular-nums" style={{ color: sportMeta(au.nomPlayer.sport).hex }}>${au.highBid}</p>
                    <p className="text-xs text-slate-400">high bid · {teamName(au.highTeamId)}</p>
                  </div>
                </div>
                {myTeamId && au.highTeamId !== myTeamId && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {[1, 5, 10].map(inc => (
                      <button key={inc} onClick={() => action({ action: 'BID', bid: au.highBid + inc })} disabled={busy || au.highBid + inc > au.myRemaining}
                        className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40">+${inc}</button>
                    ))}
                    <span className="text-xs text-slate-400 ml-auto">Your budget: <span className="font-bold tabular-nums text-slate-600">${au.myRemaining}</span></span>
                  </div>
                )}
                {myTeamId && au.highTeamId === myTeamId && <p className="text-sm text-green-600 font-medium">You hold the high bid.</p>}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-slate-700 font-medium">{au?.nominatorId ? `${teamName(au.nominatorId)} to nominate` : 'Waiting…'}</p>
                {canNominate && <p className="text-xs text-slate-400 mt-1">Pick a player below to nominate (opening bid $1).</p>}
              </div>
            )}
          </div>

          {/* Budget board */}
          <div className="card overflow-hidden">
            <div className="card-header"><h2 className="font-semibold text-slate-900 text-sm">Budgets</h2></div>
            <div className="max-h-56 overflow-y-auto divide-y divide-slate-50">
              {(s.order ?? []).map((o: any) => {
                const b = au?.budgets?.[o.id]
                return (
                  <div key={o.id} className="flex items-center justify-between px-4 py-1.5 text-sm">
                    <span className={`truncate ${o.id === au?.highTeamId ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{o.abbreviation}</span>
                    <span className="tabular-nums text-slate-500">${b ? b.remaining : '—'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

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
                    <span className="text-xs text-slate-400">{p.sport} · {p.realTeam} · value {p.value}{p.adp ? ` · ADP ${p.adp}` : ''}</span>
                  </span>
                  {d.status === 'IN_PROGRESS' && !isAuction && myTurn && <button onClick={() => action({ action: 'PICK', playerId: p.id })} disabled={busy} className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-500">Draft</button>}
                  {d.status === 'IN_PROGRESS' && isAuction && canNominate && <button onClick={() => action({ action: 'NOMINATE', playerId: p.id, bid: 1 })} disabled={busy} className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-500">Nominate</button>}
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
          <div className="inline-block min-w-full">
            {/* Team header row — franchise colors, logo + name; sticks on scroll */}
            <div className="flex gap-1.5 mb-1.5 sticky top-0 z-10 bg-white py-1">
              <span className="w-8 flex-shrink-0" />
              {(s.order ?? []).map((t: any) => (
                <div key={t.id} className="w-36 h-12 flex-shrink-0 rounded-lg px-2 flex items-center gap-1.5"
                  style={{ background: t.primaryColor || '#0f172a', color: t.secondaryColor || '#fff' }}>
                  {t.logo
                    ? <img src={t.logo} alt="" className="w-6 h-6 object-cover flex-shrink-0" />
                    : <span className="w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0" style={{ background: t.secondaryColor || '#fff', color: t.primaryColor || '#0f172a' }}>{(t.abbreviation || t.name || '?').slice(0, 2).toUpperCase()}</span>}
                  <span className="text-[11px] font-bold leading-tight line-clamp-2">{t.name}</span>
                </div>
              ))}
            </div>

            {/* One row per round; columns aligned to the team order. Tiles are a
                fixed size with room for all five lines so nothing clips. */}
            {Array.from({ length: d.rounds }, (_, r) => (
              <div key={r} className="flex gap-1.5 mb-1.5 items-stretch">
                <span className="w-8 flex-shrink-0 flex items-center justify-center text-xs font-bold text-slate-400">R{r + 1}</span>
                {(s.order ?? []).map((t: any) => {
                  const b = (s.board ?? []).find((x: any) => x.round === r + 1 && x.teamId === t.id)
                  if (!b) return <div key={t.id} className="w-36 flex-shrink-0" />
                  const isCurrent = b.pickNumber === s.current && d.status === 'IN_PROGRESS'
                  const p = b.player
                  const meta = p ? sportMeta(p.sport) : null
                  const [first, ...rest] = (p?.name ?? '').split(' ')
                  return (
                    <div key={t.id}
                      className={`w-36 h-[5.25rem] flex-shrink-0 rounded-lg border px-2 py-1.5 flex flex-col ${isCurrent ? 'border-blue-500 ring-1 ring-blue-400' : 'border-slate-200'} ${p ? meta!.light : 'bg-slate-50'}`}>
                      {b.via && <div className="text-[8px] font-bold uppercase tracking-wide text-amber-600 leading-tight truncate" title={`${b.ownerAbbr ? b.ownerAbbr + ' — ' : ''}VIA ${b.via.join(' VIA ')}`}>{b.ownerAbbr ? `${b.ownerAbbr} ` : ''}VIA {b.via.join(' VIA ')}</div>}
                      <div className="text-[9px] font-semibold tabular-nums text-slate-500 leading-tight">({b.pickNumber}, {b.round}.{b.pickInRound})</div>
                      {p ? (
                        <>
                          <div className="text-[9px] font-medium text-slate-500 leading-tight">{p.sport}-{p.realTeamAbbr ?? '—'}, {p.position}</div>
                          <div className="text-[11px] text-slate-600 leading-tight mt-auto">{first}</div>
                          <div className="text-xs font-bold text-slate-900 leading-tight">{rest.join(' ')}</div>
                        </>
                      ) : (
                        <div className="text-[11px] text-slate-300 mt-auto">{isCurrent ? 'on the clock' : '—'}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
