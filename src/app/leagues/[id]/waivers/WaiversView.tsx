'use client'

import { Fragment, useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'
import { boxScoreColumns } from '@/lib/scoring-categories'

type Rec = { sport: string; faabRemaining: number; waiverPriority: number }
type RosterP = { rosterId: string; id: string; name: string; position: string; sport: string }
type Player = {
  id: string; name: string; sport: string; position: string; realTeam: string; realTeamAbbr: string | null
  status: string; seasonPoints: number; projectedPoints: number
  seasonStats: Record<string, number>; gp: number; lastPts: number | null; avg: number
  owned: boolean; ownerTeamId: string | null; ownerTeamName: string | null; ownerTeamAbbr: string | null
  posRank: number; value: number; adp?: number | null
}
type Claim = {
  id: string; status: string; bidAmount: number; priority: number; sport: string | null; claimedAt: string
  team?: { id: string; name: string; abbreviation: string }
  addPlayer?: { name: string; position: string }
  dropPlayer?: { name: string; position: string } | null
  mine: boolean
}

const SPORTS = ['NFL', 'NBA', 'NHL', 'MLB']
const POS: Record<string, string[]> = {
  NFL: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
  NBA: ['PG', 'SG', 'SF', 'PF', 'C'],
  NHL: ['C', 'LW', 'RW', 'D', 'G'],
  MLB: ['C', '1B', '2B', '3B', 'SS', 'OF', 'SP', 'RP'],
}

export default function WaiversView({
  leagueId, leagueName, waiverType, faabMode, sportsEnabled, isCommissioner, myTeam, myRecords,
}: {
  leagueId: string; leagueName: string; waiverType: string; faabMode: string
  sportsEnabled: string[]; isCommissioner: boolean
  myTeam: { id: string; name: string } | null; myRecords: Rec[]
}) {
  const isFaab = waiverType === 'FAAB'
  const enabled = sportsEnabled.length ? sportsEnabled : SPORTS

  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [sport, setSport] = useState('')
  const [position, setPosition] = useState('')
  const [search, setSearch] = useState('')
  const [faOnly, setFaOnly] = useState(false)
  const [sortKey, setSortKey] = useState('value')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [roster, setRoster] = useState<RosterP[]>([])
  const [claims, setClaims] = useState<Claim[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [showClaims, setShowClaims] = useState(false)

  // Active claim builder for one free agent.
  const [selAdd, setSelAdd] = useState<Player | null>(null)
  const [selDrop, setSelDrop] = useState('')
  const [bid, setBid] = useState(0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const recFor = (s: string) => myRecords.find(r => r.sport === s)

  const loadPlayers = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ rich: 'true', leagueId })
    if (sport) params.set('sport', sport)
    if (position) params.set('position', position)
    if (search) params.set('q', search)
    fetch(`/api/players?${params}`).then(r => r.json()).then(d => { setPlayers(Array.isArray(d) ? d : []); setLoading(false) })
  }, [leagueId, sport, position, search])

  const loadClaims = useCallback(() => {
    fetch(`/api/leagues/${leagueId}/waivers`).then(r => r.json()).then(d => {
      setClaims(Array.isArray(d?.claims) ? d.claims : [])
      setPendingCount(d?.pendingCount ?? 0)
    })
  }, [leagueId])

  useEffect(() => { loadPlayers() }, [loadPlayers])
  useEffect(() => { loadClaims() }, [loadClaims])
  useEffect(() => {
    if (myTeam) fetch(`/api/teams/${myTeam.id}/roster`).then(r => r.json()).then(d => setRoster(d.players ?? []))
  }, [myTeam])

  const cats = sport ? boxScoreColumns(sport) : []
  const cols = useMemo(() => {
    const base = [
      { key: 'adp', label: 'ADP', val: (p: Player) => p.adp ?? 9999, fmt: (v: number) => (v >= 9999 ? '—' : String(v)), align: 'right' as const, dim: true, hide: 'hidden md:table-cell' },
      { key: 'proj', label: 'Proj', val: (p: Player) => p.projectedPoints ?? 0, fmt: (v: number) => v.toFixed(1), align: 'right' as const, dim: true, hide: 'hidden sm:table-cell' },
      { key: 'avg', label: 'Avg', val: (p: Player) => p.avg ?? 0, fmt: (v: number) => v.toFixed(1), align: 'right' as const, hide: '' },
      { key: 'gp', label: 'GP', val: (p: Player) => p.gp ?? 0, fmt: (v: number) => String(v), align: 'right' as const, dim: true, hide: 'hidden md:table-cell' },
      { key: 'seasonPoints', label: 'Pts', val: (p: Player) => p.seasonPoints ?? 0, fmt: (v: number) => v.toFixed(1), align: 'right' as const, hide: '' },
      { key: 'value', label: 'Val', val: (p: Player) => p.value ?? 0, fmt: (v: number) => String(v), align: 'right' as const, bold: true, hide: '' },
    ]
    const catCols = cats.map(c => ({ key: `cat:${c.label}`, label: c.label, val: (p: Player) => +c.get(p.seasonStats ?? {}).toFixed(0), fmt: (v: number) => (v ? String(v) : '—'), align: 'right' as const, dim: false, bold: false, hide: 'hidden lg:table-cell' }))
    return [...base, ...catCols]
  }, [cats])

  const rows = useMemo(() => {
    let r = players
    if (faOnly) r = r.filter(p => !p.owned)
    const col = cols.find(c => c.key === sortKey)
    const get = col ? col.val : (p: Player) => p.value ?? 0
    return [...r].sort((a, b) => { const d = (get(a) as number) - (get(b) as number); return sortDir === 'desc' ? -d : d })
  }, [players, faOnly, sortKey, sortDir, cols])

  function sortBy(key: string) {
    if (sortKey === key) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
  }
  const arrow = (key: string) => sortKey === key ? (sortDir === 'desc' ? ' ▾' : ' ▴') : ''

  function beginClaim(p: Player) { setSelAdd(p); setSelDrop(''); setBid(0); setMsg(null) }

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
    setSelAdd(null); loadClaims(); loadPlayers()
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
    loadClaims(); loadPlayers()
  }

  const pending = claims.filter(c => c.status === 'PENDING')
  const settled = claims.filter(c => c.status !== 'PENDING')
  const dropOptions = selAdd ? roster.filter(p => p.sport === selAdd.sport) : []
  const myRec = selAdd ? recFor(selAdd.sport) : null

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Link href={`/leagues/${leagueId}`} className="btn-ghost text-slate-500">← League</Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Players</h1>
          <p className="text-sm text-slate-500">{leagueName} · {isFaab ? `FAAB (${faabMode === 'PER_SPORT' ? 'per-sport' : 'total'} budget)` : 'Waiver priority'} · add / drop / claim</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowClaims(s => !s)} className="btn-secondary text-sm">
            Claims{pendingCount ? ` (${pendingCount})` : ''}
          </button>
          {isCommissioner && (
            <button onClick={process} disabled={busy || pendingCount === 0} className="btn-primary text-sm disabled:opacity-40">
              {busy ? 'Processing…' : `Process (${pendingCount})`}
            </button>
          )}
        </div>
      </div>

      {msg && <div className="mb-4 px-4 py-2 rounded-lg bg-blue-50 text-blue-700 text-sm">{msg}</div>}

      {/* Claims drawer */}
      {showClaims && (
        <div className="grid lg:grid-cols-2 gap-5 mb-5">
          <div className="card">
            <div className="card-header"><h2 className="font-semibold text-slate-900">Pending Claims</h2></div>
            {pending.length === 0 ? <p className="px-4 py-5 text-sm text-slate-400">No pending claims.</p> : (
              <ul className="divide-y divide-slate-50">
                {pending.map(c => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span>{sportMeta(c.sport ?? 'NFL').emoji}</span>
                    <span className="flex-1 min-w-0 truncate text-slate-700"><span className="font-medium">{c.team?.abbreviation}</span> → {c.addPlayer?.name}{c.dropPlayer && <span className="text-slate-400"> · drop {c.dropPlayer.name}</span>}</span>
                    {isFaab && <span className="font-bold tabular-nums text-slate-700">${c.bidAmount}</span>}
                    {c.mine && <button onClick={() => cancel(c.id)} className="text-xs text-red-500 hover:text-red-700">cancel</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card">
            <div className="card-header"><h2 className="font-semibold text-slate-900">Recent Results</h2></div>
            {settled.length === 0 ? <p className="px-4 py-5 text-sm text-slate-400">No processed claims yet.</p> : (
              <ul className="divide-y divide-slate-50">
                {settled.slice(0, 12).map(c => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.status === 'WON' ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400'}`}>{c.status}</span>
                    <span className="flex-1 truncate text-slate-600"><span className="font-medium">{c.team?.abbreviation}</span> · {c.addPlayer?.name}{isFaab ? ` ($${c.bidAmount})` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input type="search" placeholder="Search players…" value={search} onChange={e => setSearch(e.target.value)} className="input w-56 text-sm py-2" />
        <button onClick={() => { setSport(''); setPosition('') }} className={`px-3 py-1.5 rounded-full text-sm font-medium ${!sport ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>All</button>
        {enabled.map(s => {
          const m = sportMeta(s)
          return <button key={s} onClick={() => { setSport(s); setPosition('') }} className={`px-3 py-1.5 rounded-full text-sm font-medium ${sport === s ? `${m.bg} text-white` : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{m.emoji} {s}</button>
        })}
        {sport && (
          <select className="select w-28 text-sm py-1.5" value={position} onChange={e => setPosition(e.target.value)}>
            <option value="">All Pos</option>
            {(POS[sport] ?? []).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-sm text-slate-600 ml-auto cursor-pointer">
          <input type="checkbox" checked={faOnly} onChange={e => setFaOnly(e.target.checked)} className="rounded" />
          Free agents only
        </label>
      </div>

      {loading ? (
        <div className="card divide-y divide-slate-50">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 animate-pulse"><div className="w-6 h-6 rounded bg-slate-100" /><div className="h-3 bg-slate-100 rounded w-40" /><div className="ml-auto h-3 bg-slate-100 rounded w-10" /></div>
          ))}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50">
                <th className="text-left px-2 py-2 font-semibold">Player</th>
                <th className="text-center px-2 py-2 font-semibold">Status</th>
                {cols.map(c => (
                  <th key={c.key} onClick={() => sortBy(c.key)} className={`px-2 py-2 font-semibold cursor-pointer hover:text-slate-700 whitespace-nowrap text-${c.align} ${c.hide}`}>{c.label}{arrow(c.key)}</th>
                ))}
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.slice(0, 150).map((p, i) => {
                const m = sportMeta(p.sport)
                const isSel = selAdd?.id === p.id
                return (
                  <Fragment key={p.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-2 py-1.5 bg-white whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className={`w-6 h-6 rounded ${m.bg} text-white flex items-center justify-center text-[9px] font-bold flex-shrink-0`}>{p.position.slice(0, 2)}</span>
                          <span className="text-[10px] text-slate-300 tabular-nums w-5 flex-shrink-0">{position ? p.posRank : i + 1}</span>
                          <span>
                            <Link href={`/players/${p.id}`} className="font-medium text-slate-900 hover:text-blue-600">{p.name}</Link>
                            <span className="text-[11px] text-slate-400"> {p.sport} · {p.position} · {p.realTeamAbbr ?? p.realTeam}</span>
                            {p.status !== 'ACTIVE' && <span className="ml-1 text-[9px] font-bold text-red-500">{p.status === 'INJURED' ? 'INJ' : p.status}</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {p.owned
                          ? <Link href={`/teams/${p.ownerTeamId}`} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:text-slate-700">{p.ownerTeamAbbr}</Link>
                          : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-600">FA</span>}
                      </td>
                      {cols.map(c => (
                        <td key={c.key} className={`px-2 py-1.5 tabular-nums text-${c.align} ${c.hide} ${c.bold ? 'font-bold text-slate-900' : c.dim ? 'text-slate-400' : 'text-slate-600'}`}>{c.fmt(c.val(p) as number)}</td>
                      ))}
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        {!p.owned && myTeam && (
                          <button onClick={() => isSel ? setSelAdd(null) : beginClaim(p)} className="text-xs px-2.5 py-1 rounded text-white" style={{ background: isSel ? '#64748b' : m.hex }}>{isSel ? 'Close' : (isFaab ? 'Claim' : 'Add')}</button>
                        )}
                      </td>
                    </tr>
                    {isSel && myTeam && (
                      <tr className="bg-slate-50">
                        <td colSpan={cols.length + 3} className="px-4 py-3">
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="text-sm text-slate-600">
                              Add <span className="font-semibold text-slate-900">{p.name}</span>
                              {myRec && <span className="ml-2 text-xs text-slate-400">{isFaab ? `budget $${myRec.faabRemaining}` : `priority #${myRec.waiverPriority}`}</span>}
                            </div>
                            {isFaab && (
                              <label className="text-xs text-slate-500">Bid ($)
                                <input type="number" min={0} max={myRec?.faabRemaining ?? 0} value={bid} onChange={e => setBid(Math.max(0, +e.target.value))} className="mt-1 w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular-nums block" />
                              </label>
                            )}
                            <label className="text-xs text-slate-500">Drop ({p.sport}, optional)
                              <select value={selDrop} onChange={e => setSelDrop(e.target.value)} className="mt-1 w-52 rounded-lg border border-slate-200 px-2 py-1.5 text-sm block">
                                <option value="">— none —</option>
                                {dropOptions.map(d => <option key={d.rosterId} value={d.id}>{d.name} ({d.position})</option>)}
                              </select>
                            </label>
                            <button onClick={submit} disabled={busy} className="btn-primary text-sm disabled:opacity-40">{busy ? 'Submitting…' : isFaab ? `Place $${bid} claim` : 'Submit'}</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {rows.length === 0 && <tr><td colSpan={cols.length + 3} className="px-4 py-8 text-center text-slate-400 text-sm">No players match.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
