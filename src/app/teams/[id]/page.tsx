'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'
import { eligibleSlots } from '@/lib/defaults'
import { boxScoreColumns } from '@/lib/scoring-categories'
import { oppLabel } from '@/lib/realschedule'

type P = {
  rosterId: string; slot: string; sport: string; onBlock?: boolean; isKeeper?: boolean; salary?: number; contractYears?: number | null; id: string; name: string; position: string
  realTeam: string; realTeamAbbr: string | null; status: string; injuryNote: string | null; byeWeek: number | null
  seasonPoints: number; projectedPoints: number; weeklyAvg: number
  gp: number; lastPts: number | null; seasonStats: Record<string, number>; opp: { opp: string; home: boolean } | null
  locked?: boolean; kickoff?: number | null
}
type Pick = { id: string; sport: string | null; round: number; year: number }
type Team = { id: string; name: string; abbreviation: string; logo: string | null; altLogo: string | null; wordmark: string | null; primaryColor: string; secondaryColor: string; leagueId: string; userId: string; ownerName: string | null }
type FA = { id: string; name: string; position: string; realTeam: string; seasonPoints: number; status: string }

const SPORTS = ['NFL', 'NHL', 'NBA', 'MLB']
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
  const [showMgr, setShowMgr] = useState(false)
  const [mgrEmail, setMgrEmail] = useState('')
  const [mgrErr, setMgrErr] = useState('')

  const load = useCallback(() => {
    fetch(`/api/teams/${id}/roster`).then(r => r.json()).then(d => {
      setData(d)
      // Keep the current sport tab if it still has players; only fall back on first load.
      setSport(prev => {
        const present = SPORTS.filter(s => (d.players ?? []).some((p: P) => p.sport === s))
        return present.includes(prev) ? prev : (present[0] ?? prev)
      })
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

  async function addManager() {
    setMgrErr('')
    const r = await fetch(`/api/teams/${id}/managers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: mgrEmail }) })
    if (!r.ok) { setMgrErr((await r.json().catch(() => ({}))).error ?? 'Failed to add'); return }
    setMgrEmail(''); load()
  }
  async function removeManager(userId: string) {
    await fetch(`/api/teams/${id}/managers`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) })
    load()
  }

  function editContract(p: P) {
    const salStr = window.prompt(`Salary for ${p.name}`, String(p.salary ?? 0))
    if (salStr == null) return
    const yrStr = window.prompt(`Contract years remaining for ${p.name} (blank = none)`, p.contractYears == null ? '' : String(p.contractYears))
    if (yrStr == null) return
    act({ action: 'SET_CONTRACT', rosterId: p.rosterId, salary: Number(salStr) || 0, contractYears: yrStr.trim() === '' ? null : Number(yrStr) })
  }

  if (loading) return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-pulse">
      <div className="h-28 rounded-2xl bg-slate-100 mb-6" />
      <div className="flex gap-2 mb-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 w-24 rounded-full bg-slate-100" />)}</div>
      <div className="card divide-y divide-slate-50">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-9 bg-slate-50 m-2 rounded" />)}</div>
    </div>
  )
  if (!data?.team) return <div className="text-center py-20 text-slate-400">Franchise not found.</div>

  const team: Team = data.team
  const players: P[] = data.players ?? []
  const picks: Pick[] = data.picks ?? []
  const canManage: boolean = data.canManage
  const sportsPresent = SPORTS.filter(s => players.some(p => p.sport === s))
  const rosterForSport = players.filter(p => p.sport === sport).sort((a, b) => (STARTER(b.slot) ? 1 : 0) - (STARTER(a.slot) ? 1 : 0) || b.seasonPoints - a.seasonPoints)
  const picksForSport = picks.filter(p => p.sport === sport || p.sport === null)
  const capEnabled: boolean = !!data.salaryCapEnabled
  const cap: number = data.salaryCap ?? 0
  const totalSalary = players.reduce((s, p) => s + (p.salary ?? 0), 0)
  const overCap = capEnabled && cap > 0 && totalSalary > cap

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Branded header */}
      <div className="rounded-2xl p-5 mb-6 flex items-center gap-4 flex-wrap" style={{ background: `linear-gradient(135deg, ${team.primaryColor} 0%, ${team.secondaryColor} 140%)` }}>
        {team.logo
          ? <img src={team.logo} alt="" className="w-16 h-16 object-contain bg-white/10" style={(team as any).logoBg ? { background: team.primaryColor } : undefined} />
          : <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black text-white/90" style={{ backgroundColor: team.secondaryColor }}>{team.abbreviation}</div>}
        <div className="flex-1 min-w-0">
          {team.wordmark && team.wordmark.startsWith('http')
            ? <img src={team.wordmark} alt={team.name} className="h-8 mb-1" />
            : <h1 className="text-2xl font-black text-white">{team.wordmark || team.name}</h1>}
          <p className="text-white/70 text-sm">{team.ownerName} · {players.length} players{data.isOwner ? ' · your franchise' : data.isCommish ? ' · 🛠 commissioner control' : data.isCoManager ? ' · co-manager' : ''}</p>
          {(data.managers ?? []).length > 0 && (
            <p className="text-white/50 text-xs mt-0.5">co-managers: {(data.managers ?? []).map((m: any) => m.name ?? m.email).join(', ')}</p>
          )}
        </div>
        {team.altLogo && <img src={team.altLogo} alt="" className="w-12 h-12 object-contain bg-white/10 hidden sm:block" />}
        <div className="flex gap-2">
          {canManage && <button onClick={() => { setBrand({ name: team.name, abbreviation: team.abbreviation, logo: team.logo ?? '', altLogo: team.altLogo ?? '', wordmark: team.wordmark ?? '', primaryColor: team.primaryColor, secondaryColor: team.secondaryColor, logoBg: (team as any).logoBg ?? false }); setEditing(!editing) }} className="bg-white/15 hover:bg-white/25 text-white text-sm px-3 py-1.5 rounded-lg">Edit</button>}
          {(data.isOwner || data.isCommish) && <button onClick={() => setShowMgr(!showMgr)} className="bg-white/15 hover:bg-white/25 text-white text-sm px-3 py-1.5 rounded-lg">Co-managers</button>}
          <Link href={`/leagues/${team.leagueId}`} className="bg-white/15 hover:bg-white/25 text-white text-sm px-3 py-1.5 rounded-lg">← League</Link>
        </div>
      </div>

      {/* Branding editor */}
      {editing && (
        <div className="card p-5 mb-6 space-y-3">
          <h3 className="font-semibold text-slate-900">Team Branding</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="label">Team Name</label><input className="input" value={brand.name} onChange={e => setBrand({ ...brand, name: e.target.value })} /></div>
            <div><label className="label">Abbreviation</label><input className="input" maxLength={4} value={brand.abbreviation} onChange={e => setBrand({ ...brand, abbreviation: e.target.value })} /></div>
            <div><label className="label">Logo URL</label><input className="input" placeholder="https://…" value={brand.logo} onChange={e => setBrand({ ...brand, logo: e.target.value })} /></div>
            <div><label className="label">Alternate Logo URL</label><input className="input" placeholder="https://…" value={brand.altLogo} onChange={e => setBrand({ ...brand, altLogo: e.target.value })} /></div>
            <div><label className="label">Wordmark (text or image URL)</label><input className="input" value={brand.wordmark} onChange={e => setBrand({ ...brand, wordmark: e.target.value })} /></div>
            <div className="flex gap-4 items-end">
              <div><label className="label">Primary</label><input type="color" className="h-10 w-16 rounded border border-slate-200" value={brand.primaryColor} onChange={e => setBrand({ ...brand, primaryColor: e.target.value })} /></div>
              <div><label className="label">Secondary</label><input type="color" className="h-10 w-16 rounded border border-slate-200" value={brand.secondaryColor} onChange={e => setBrand({ ...brand, secondaryColor: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm text-slate-600 pb-2"><input type="checkbox" checked={!!brand.logoBg} onChange={e => setBrand({ ...brand, logoBg: e.target.checked })} /> Logo on primary-color background</label>
            </div>
          </div>
          <div className="flex gap-2"><button onClick={saveBranding} className="btn-primary">Save Branding</button><button onClick={() => setEditing(false)} className="btn-secondary">Cancel</button></div>
        </div>
      )}

      {/* Co-managers editor */}
      {showMgr && (data.isOwner || data.isCommish) && (
        <div className="card p-5 mb-6 space-y-3">
          <div>
            <h3 className="font-semibold text-slate-900">Co-managers</h3>
            <p className="text-xs text-slate-500">Co-managers can set lineups and make roster moves for this franchise. The owner keeps full control.</p>
          </div>
          {(data.managers ?? []).length === 0
            ? <p className="text-sm text-slate-400">No co-managers yet.</p>
            : <ul className="divide-y divide-slate-50">
                {(data.managers ?? []).map((m: any) => (
                  <li key={m.userId} className="flex items-center gap-3 py-2">
                    <span className="text-sm text-slate-800">{m.name ?? m.email}</span>
                    <span className="text-xs text-slate-400">{m.email}</span>
                    <button onClick={() => removeManager(m.userId)} className="ml-auto text-[11px] text-red-500 hover:text-red-700">Remove</button>
                  </li>
                ))}
              </ul>}
          <div className="flex gap-2 items-end pt-1">
            <div className="flex-1"><label className="label">Add by email</label><input className="input" placeholder="owner@example.com" value={mgrEmail} onChange={e => setMgrEmail(e.target.value)} /></div>
            <button onClick={addManager} disabled={!mgrEmail.trim()} className="btn-primary disabled:opacity-50">Add</button>
          </div>
          {mgrErr && <p className="text-xs text-red-500">{mgrErr}</p>}
        </div>
      )}

      {/* Salary cap summary */}
      {capEnabled && (
        <div className={`card p-4 mb-5 ${overCap ? 'ring-1 ring-red-200' : ''}`}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-semibold text-slate-900">Salary Cap</span>
            <span className={`text-sm font-bold tabular-nums ${overCap ? 'text-red-600' : 'text-slate-700'}`}>
              {totalSalary.toLocaleString()}{cap > 0 ? ` / ${cap.toLocaleString()}` : ''}
            </span>
          </div>
          {cap > 0 && (
            <div className="h-2 rounded-full overflow-hidden bg-slate-100">
              <div className={overCap ? 'bg-red-500 h-full' : 'bg-emerald-500 h-full'} style={{ width: `${Math.min(100, (totalSalary / cap) * 100)}%` }} />
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1">{overCap ? `Over cap by ${(totalSalary - cap).toLocaleString()}` : cap > 0 ? `${(cap - totalSalary).toLocaleString()} of cap space remaining` : 'No cap amount set'} · total across all sports</p>
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
              <div className="max-h-[34rem] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr className="text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                      <th className="text-left px-2 py-2 font-semibold">Slot</th>
                      <th className="text-left px-2 py-2 font-semibold">Player</th>
                      <th className="text-center px-1.5 py-2 font-semibold">Opp</th>
                      <th className="text-right px-1.5 py-2 font-semibold hidden sm:table-cell">Proj</th>
                      <th className="text-right px-1.5 py-2 font-semibold hidden sm:table-cell">Last</th>
                      <th className="text-right px-1.5 py-2 font-semibold hidden sm:table-cell">Avg</th>
                      <th className="text-right px-1.5 py-2 font-semibold hidden md:table-cell">GP</th>
                      <th className="text-right px-2 py-2 font-semibold">Pts</th>
                      {boxScoreColumns(sport).map(c => <th key={c.label} className="text-right px-1.5 py-2 font-semibold whitespace-nowrap hidden lg:table-cell">{c.label}</th>)}
                      {canManage && <th className="text-right px-3 py-2 font-semibold"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rosterForSport.map(p => {
                      const slots = eligibleSlots(p.position, (data.rosterSettings ?? {})[sport] ?? {})
                      const open = openSlot === p.rosterId
                      const cols = boxScoreColumns(sport)
                      const locked = !!p.locked && !data.isCommish
                      const slotEditable = canManage && !locked
                      return (
                        <tr key={p.rosterId} className={`hover:bg-slate-50 ${STARTER(p.slot) ? '' : 'bg-slate-50/40'}`}>
                          <td className="px-2 py-1.5 relative">
                            <button onClick={() => slotEditable && setOpenSlot(open ? null : p.rosterId)} disabled={!slotEditable}
                              title={locked ? 'Locked — game has started' : undefined}
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STARTER(p.slot) ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'} ${slotEditable ? 'hover:ring-2 hover:ring-blue-200 cursor-pointer' : ''} ${locked ? 'opacity-70' : ''}`}>
                              {locked && '🔒'}{p.slot}{slotEditable && ' ▾'}
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
                          <td className="px-2 py-1.5 bg-inherit sm:whitespace-nowrap">
                            <Link href={`/players/${p.id}`} className="font-medium text-slate-900 hover:text-blue-600">{p.name}</Link>
                            <span className="text-[11px] text-slate-400"> {p.position} · {p.realTeamAbbr ?? p.realTeam}</span>
                            {p.status !== 'ACTIVE' && <span className="ml-1 text-[9px] font-bold text-red-500 align-top">{p.status === 'INJURED' ? 'INJ' : p.status}</span>}
                            {p.byeWeek ? <span className="ml-1 text-[9px] text-slate-300">BYE {p.byeWeek}</span> : null}
                            {capEnabled && (p.salary ?? 0) > 0 && <span className="ml-1 text-[10px] text-emerald-600 font-semibold tabular-nums">${(p.salary ?? 0).toLocaleString()}{p.contractYears ? ` · ${p.contractYears}yr` : ''}</span>}
                          </td>
                          <td className="px-1.5 py-1.5 text-center text-[11px] text-slate-500 tabular-nums whitespace-nowrap">{oppLabel(p.opp ?? undefined)}</td>
                          <td className="px-1.5 py-1.5 text-right tabular-nums text-slate-400 hidden sm:table-cell">{(p.projectedPoints ?? 0).toFixed(1)}</td>
                          <td className="px-1.5 py-1.5 text-right tabular-nums text-slate-500 hidden sm:table-cell">{p.lastPts == null ? '—' : p.lastPts.toFixed(1)}</td>
                          <td className="px-1.5 py-1.5 text-right tabular-nums text-slate-500 hidden sm:table-cell">{(p.weeklyAvg ?? 0).toFixed(1)}</td>
                          <td className="px-1.5 py-1.5 text-right tabular-nums text-slate-400 hidden md:table-cell">{p.gp ?? 0}</td>
                          <td className="px-2 py-1.5 text-right font-bold tabular-nums text-slate-900">{(p.seasonPoints ?? 0).toFixed(1)}</td>
                          {cols.map(c => {
                            const v = +c.get(p.seasonStats ?? {}).toFixed(0)
                            return <td key={c.label} className="px-1.5 py-1.5 text-right tabular-nums text-slate-600 hidden lg:table-cell">{v || '—'}</td>
                          })}
                          {canManage && <td className="px-3 py-1.5 text-right whitespace-nowrap">
                            {capEnabled && (data.isOwner || data.isCommish) && <button onClick={() => editContract(p)} className="text-[11px] mr-2 text-slate-400 hover:text-emerald-600">$</button>}
                            {data.keeperEnabled && <button onClick={() => act({ action: 'SET_KEEPER', rosterId: p.rosterId, isKeeper: !p.isKeeper })} className={`text-[11px] mr-2 ${p.isKeeper ? 'text-emerald-600 font-semibold' : 'text-slate-400 hover:text-emerald-600'}`}>{p.isKeeper ? '🔑 Keeper' : 'Keep'}</button>}
                            <button onClick={() => act({ action: 'SET_BLOCK', rosterId: p.rosterId, onBlock: !p.onBlock })} className={`text-[11px] mr-2 ${p.onBlock ? 'text-amber-600 font-semibold' : 'text-slate-400 hover:text-amber-600'}`}>{p.onBlock ? '◉ Block' : 'Block'}</button>
                            <button onClick={() => act({ action: 'DROP', rosterId: p.rosterId })} className="text-[11px] text-red-500 hover:text-red-700">Drop</button>
                          </td>}
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
