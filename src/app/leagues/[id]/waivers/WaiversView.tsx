'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

type Rec = { sport: string; faabRemaining: number; waiverPriority: number }
type FA = { id: string; name: string; position: string; realTeam: string; seasonPoints: number; status: string; sport: string }
type RosterP = { rosterId: string; id: string; name: string; position: string; sport: string }
type Claim = {
  id: string; status: string; bidAmount: number; priority: number; sport: string | null; claimedAt: string
  team?: { id: string; name: string; abbreviation: string }
  addPlayer?: { name: string; position: string }
  dropPlayer?: { name: string; position: string } | null
  mine: boolean
}

export default function WaiversView({
  leagueId, leagueName, waiverType, faabMode, sportsEnabled, isCommissioner, myTeam, myRecords,
}: {
  leagueId: string; leagueName: string; waiverType: string; faabMode: string
  sportsEnabled: string[]; isCommissioner: boolean
  myTeam: { id: string; name: string } | null; myRecords: Rec[]
}) {
  const isFaab = waiverType === 'FAAB'
  const [sport, setSport] = useState(sportsEnabled[0] ?? 'NFL')
  const [claims, setClaims] = useState<Claim[]>([])
  const [fa, setFa] = useState<FA[]>([])
  const [roster, setRoster] = useState<RosterP[]>([])
  const [selAdd, setSelAdd] = useState<FA | null>(null)
  const [selDrop, setSelDrop] = useState<string>('')
  const [bid, setBid] = useState(0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)

  const recFor = (s: string) => myRecords.find(r => r.sport === s)
  const meta = sportMeta(sport)

  const loadClaims = useCallback(() => {
    fetch(`/api/leagues/${leagueId}/waivers`).then(r => r.json()).then(d => {
      setClaims(Array.isArray(d?.claims) ? d.claims : [])
      setPendingCount(d?.pendingCount ?? 0)
    })
  }, [leagueId])

  useEffect(() => { loadClaims() }, [loadClaims])
  useEffect(() => {
    fetch(`/api/players?sport=${sport}&free=true&leagueId=${leagueId}`).then(r => r.json()).then(d => setFa(Array.isArray(d) ? d.slice(0, 60) : []))
    setSelAdd(null)
  }, [sport, leagueId])
  useEffect(() => {
    if (myTeam) fetch(`/api/teams/${myTeam.id}/roster`).then(r => r.json()).then(d => setRoster((d.players ?? []).filter((p: RosterP) => p.sport === sport)))
  }, [myTeam, sport])

  async function submit() {
    if (!selAdd) return
    setBusy(true); setMsg(null)
    const res = await fetch(`/api/leagues/${leagueId}/waivers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'SUBMIT', addPlayerId: selAdd.id, dropPlayerId: selDrop || undefined, bidAmount: isFaab ? bid : 0 }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg(data.error ?? 'Could not submit claim'); return }
    setSelAdd(null); setSelDrop(''); setBid(0); loadClaims()
  }

  async function cancel(claimId: string) {
    await fetch(`/api/leagues/${leagueId}/waivers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'CANCEL', claimId }) })
    loadClaims()
  }

  async function process() {
    setBusy(true); setMsg(null)
    const res = await fetch(`/api/leagues/${leagueId}/waivers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'PROCESS' }) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    setMsg(res.ok ? `Processed ${data.processed} claim(s) — ${data.awarded} awarded.` : (data.error ?? 'Failed'))
    loadClaims()
  }

  const pending = claims.filter(c => c.status === 'PENDING')
  const settled = claims.filter(c => c.status !== 'PENDING')
  const myRec = recFor(sport)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Link href={`/leagues/${leagueId}`} className="btn-ghost text-slate-500">← League</Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Players &amp; Waivers</h1>
          <p className="text-sm text-slate-500">{leagueName} · free agents · {isFaab ? `FAAB bidding (${faabMode === 'PER_SPORT' ? 'per-sport' : 'total'} budget)` : 'Rolling waiver priority'}</p>
        </div>
        {isCommissioner && (
          <button onClick={process} disabled={busy || pendingCount === 0}
            className="ml-auto btn-primary text-sm disabled:opacity-40">
            {busy ? 'Processing…' : `Process Waivers (${pendingCount})`}
          </button>
        )}
      </div>

      {msg && <div className="mb-4 px-4 py-2 rounded-lg bg-blue-50 text-blue-700 text-sm">{msg}</div>}

      {/* Sport selector */}
      <div className="flex gap-1 border-b border-slate-200 mb-5 overflow-x-auto">
        {sportsEnabled.map(s => (
          <button key={s} onClick={() => setSport(s)} className={sport === s ? 'tab-active' : 'tab-inactive'}>
            {sportMeta(s).emoji} {s}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Submit a claim */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-900">New Claim</h2>
            {myTeam && myRec && (
              <span className="text-xs text-slate-500">
                {isFaab ? <>Budget: <span className="font-bold tabular-nums" style={{ color: meta.hex }}>${myRec.faabRemaining}</span></> : <>Priority: <span className="font-bold">#{myRec.waiverPriority}</span></>}
              </span>
            )}
          </div>

          {!myTeam ? (
            <p className="text-sm text-slate-400">You have no franchise in this league.</p>
          ) : (
            <>
              {selAdd ? (
                <div className="rounded-lg border border-slate-200 p-3 mb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{selAdd.name} <span className="text-xs text-slate-400">{selAdd.position} · {selAdd.realTeam}</span></p>
                      <p className="text-xs text-slate-500">{selAdd.seasonPoints?.toFixed(1)} season pts</p>
                    </div>
                    <button onClick={() => setSelAdd(null)} className="text-xs text-slate-400 hover:text-slate-600">change</button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {isFaab && (
                      <label className="text-xs text-slate-500">Bid ($)
                        <input type="number" min={0} max={myRec?.faabRemaining ?? 0} value={bid} onChange={e => setBid(Math.max(0, +e.target.value))}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular-nums" />
                      </label>
                    )}
                    <label className="text-xs text-slate-500">Drop (optional)
                      <select value={selDrop} onChange={e => setSelDrop(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                        <option value="">— none —</option>
                        {roster.map(p => <option key={p.rosterId} value={p.id}>{p.name} ({p.position})</option>)}
                      </select>
                    </label>
                  </div>
                  <button onClick={submit} disabled={busy} className="mt-3 w-full btn-primary text-sm disabled:opacity-40">
                    {busy ? 'Submitting…' : isFaab ? `Place $${bid} claim` : 'Submit claim'}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-400 mb-2">Pick a free agent below to start a claim.</p>
              )}

              <div className="border-t border-slate-100 -mx-5 mt-2 max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-50">
                    {fa.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-5 py-2">
                          <Link href={`/players/${p.id}`} className="font-medium text-slate-800 hover:text-blue-600">{p.name}</Link>
                          <span className="text-[11px] text-slate-400"> {p.position} · {p.realTeam}</span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-500">{p.seasonPoints?.toFixed(1)}</td>
                        <td className="px-5 py-2 text-right">
                          <button onClick={() => { setSelAdd(p); setBid(0) }} className="text-xs px-2 py-1 rounded text-white" style={{ background: meta.hex }}>Claim</button>
                        </td>
                      </tr>
                    ))}
                    {fa.length === 0 && <tr><td className="px-5 py-6 text-slate-400 text-sm">No free agents available.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Claims */}
        <div className="space-y-6">
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold text-slate-900">My Pending Claims</h2>
              <p className="text-[11px] text-slate-400 font-normal">Other franchises' claims stay hidden until the waiver period processes.</p>
            </div>
            {pending.length === 0 ? <p className="px-4 py-6 text-sm text-slate-400">You have no pending claims.</p> : (
              <ul className="divide-y divide-slate-50">
                {pending.map(c => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-base">{sportMeta(c.sport ?? 'NFL').emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700">
                        <span className="font-medium">{c.team?.abbreviation}</span> claims <span className="font-medium">{c.addPlayer?.name}</span>
                        {c.dropPlayer && <span className="text-slate-400"> · drop {c.dropPlayer.name}</span>}
                      </p>
                    </div>
                    {isFaab && <span className="text-sm font-bold tabular-nums text-slate-700">${c.bidAmount}</span>}
                    {!isFaab && <span className="text-xs text-slate-400">#{c.priority}</span>}
                    {c.mine && <button onClick={() => cancel(c.id)} className="text-xs text-red-500 hover:text-red-700">cancel</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="card-header"><h2 className="font-semibold text-slate-900">Recent Results</h2></div>
            {settled.length === 0 ? <p className="px-4 py-6 text-sm text-slate-400">No processed claims yet.</p> : (
              <ul className="divide-y divide-slate-50">
                {settled.slice(0, 15).map(c => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.status === 'WON' ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400'}`}>{c.status}</span>
                    <p className="flex-1 text-sm text-slate-600 min-w-0 truncate">
                      <span className="font-medium">{c.team?.abbreviation}</span> · {c.addPlayer?.name}{isFaab ? ` ($${c.bidAmount})` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
