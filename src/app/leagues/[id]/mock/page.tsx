'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { sportMeta } from '@/lib/utils'

type Team = { id: string; name: string; abbreviation: string; primaryColor: string; secondaryColor: string; logo: string | null }
type Player = { id: string; name: string; position: string; sport: string; realTeamAbbr: string | null; adp: number | null; projectedPoints: number | null }
type Pick = { overall: number; round: number; slot: number; player: Player }

const SPORTS = ['NFL', 'NHL', 'NBA', 'MLB']

export default function MockDraft() {
  const { id } = useParams<{ id: string }>()
  const [teams, setTeams] = useState<Team[]>([])
  const [pool, setPool] = useState<Player[]>([])
  const [enabledSports, setEnabledSports] = useState<string[]>(SPORTS)

  // Setup
  const [mockSport, setMockSport] = useState<string>('ALL')
  const [rounds, setRounds] = useState(5)
  const [snake, setSnake] = useState(true)
  const [order, setOrder] = useState<Team[]>([])      // draft order (editable in setup)
  const [mySlot, setMySlot] = useState(0)
  const [started, setStarted] = useState(false)

  // Draft state
  const [picks, setPicks] = useState<Pick[]>([])
  const [sportFilter, setSportFilter] = useState('ALL')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch(`/api/leagues/${id}/mock`).then(r => r.json()).then(d => {
      setTeams(d.teams ?? [])
      setOrder(d.teams ?? [])
      setPool(d.available ?? [])
      if (Array.isArray(d.sportsEnabled) && d.sportsEnabled.length) setEnabledSports(d.sportsEnabled)
    })
  }, [id])

  const taken = useMemo(() => new Set(picks.map(p => p.player.id)), [picks])
  const scopedPool = useMemo(() => mockSport === 'ALL' ? pool : pool.filter(p => p.sport === mockSport), [pool, mockSport])
  const available = useMemo(() => scopedPool.filter(p => !taken.has(p.id)
    && (sportFilter === 'ALL' || p.sport === sportFilter)
    && (!search || p.name.toLowerCase().includes(search.toLowerCase()))), [scopedPool, taken, sportFilter, search])

  const T = order.length
  const totalPicks = T * rounds
  const onClock = started && picks.length < totalPicks
  const curRound = Math.floor(picks.length / Math.max(1, T)) + 1
  const idxInRound = picks.length % Math.max(1, T)
  const curSlot = onClock ? (snake && curRound % 2 === 0 ? T - 1 - idxInRound : idxInRound) : -1
  const myTurn = onClock && curSlot === mySlot

  function moveTeam(i: number, dir: -1 | 1) {
    setOrder(prev => {
      const next = [...prev]; const j = i + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function randomize() {
    setOrder(prev => [...prev].map(t => ({ t, r: Math.random() })).sort((a, b) => a.r - b.r).map(x => x.t))
  }

  function start() { setPicks([]); setSportFilter('ALL'); setSearch(''); setStarted(true) }

  function pick(player: Player) {
    setPicks(prev => {
      if (prev.length >= totalPicks) return prev
      const round = Math.floor(prev.length / T) + 1
      const inRound = prev.length % T
      const slot = snake && round % 2 === 0 ? T - 1 - inRound : inRound
      return [...prev, { overall: prev.length + 1, round, slot, player }]
    })
  }

  // Bots auto-pick best-available by ADP when it isn't my turn.
  useEffect(() => {
    if (!onClock || myTurn) return
    const best = available[0] ?? scopedPool.find(p => !taken.has(p.id))
    if (!best) return
    const t = setTimeout(() => pick(best), 280)
    return () => clearTimeout(t)
  }, [onClock, myTurn, available, scopedPool, taken])

  // Board cell lookup: cell[round][slot] = pick.
  const cell = useMemo(() => {
    const m: Record<string, Pick> = {}
    for (const p of picks) m[`${p.round}:${p.slot}`] = p
    return m
  }, [picks])
  const myPicks = picks.filter(p => p.slot === mySlot)

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Mock Draft</h1>
        <p className="text-sm text-slate-500">Practice against auto-drafting bots · nothing is saved</p>
      </div>

      {!started ? (
        <div className="card p-6 max-w-2xl space-y-5">
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Sport to mock</label>
              <select className="select" value={mockSport} onChange={e => setMockSport(e.target.value)}>
                <option value="ALL">All sports (dynasty)</option>
                {enabledSports.map(s => <option key={s} value={s}>{sportMeta(s).emoji} {s} only</option>)}
              </select>
            </div>
            <div>
              <label className="label">Rounds</label>
              <select className="select" value={rounds} onChange={e => setRounds(+e.target.value)}>
                {[3, 4, 5, 6, 8, 10, 12, 15].map(n => <option key={n} value={n}>{n} rounds</option>)}
              </select>
            </div>
            <div>
              <label className="label">Type</label>
              <select className="select" value={snake ? 'SNAKE' : 'LINEAR'} onChange={e => setSnake(e.target.value === 'SNAKE')}>
                <option value="SNAKE">Snake</option>
                <option value="LINEAR">Linear</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Draft order — pick your slot</label>
              <button onClick={randomize} className="btn-secondary text-xs">🎲 Randomize</button>
            </div>
            <ol className="space-y-1">
              {order.map((t, i) => (
                <li key={t.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${mySlot === i ? 'border-blue-400 bg-blue-50' : 'border-slate-100'}`}>
                  <span className="text-xs text-slate-400 tabular-nums w-5">{i + 1}.</span>
                  <span className="w-5 h-5 rounded text-white text-[9px] font-bold flex items-center justify-center" style={{ background: t.primaryColor }}>{t.abbreviation?.slice(0, 2)}</span>
                  <span className="text-sm text-slate-800 flex-1 truncate">{t.name}</span>
                  <button onClick={() => setMySlot(i)} className={`text-[11px] px-2 py-0.5 rounded ${mySlot === i ? 'bg-blue-600 text-white' : 'text-blue-600 hover:bg-blue-50'}`}>{mySlot === i ? 'You' : 'Take slot'}</button>
                  <button onClick={() => moveTeam(i, -1)} disabled={i === 0} className="text-slate-400 disabled:opacity-30 px-1">▲</button>
                  <button onClick={() => moveTeam(i, 1)} disabled={i === order.length - 1} className="text-slate-400 disabled:opacity-30 px-1">▼</button>
                </li>
              ))}
            </ol>
          </div>

          <button onClick={start} disabled={teams.length === 0 || pool.length === 0} className="btn-primary w-full disabled:opacity-50">Start Mock Draft</button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className={`rounded-xl px-4 py-2 text-sm font-semibold ${myTurn ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-600'}`}>
              {onClock
                ? <>Round {curRound} · Pick {picks.length + 1}/{totalPicks} — <span className="font-bold">{myTurn ? 'You are on the clock' : `${order[curSlot]?.name} (bot)`}</span></>
                : <>Draft complete — {totalPicks} picks</>}
            </div>
            <button onClick={() => setStarted(false)} className="btn-secondary text-sm">⟲ New mock</button>
          </div>

          {/* Draft board */}
          <div className="card overflow-x-auto mb-5 relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-slate-50 px-2 py-2 text-slate-400 font-medium">Rd</th>
                  {order.map((t, i) => (
                    <th key={t.id} className="px-2 py-2 min-w-[8rem]" style={{ background: t.primaryColor, color: '#fff' }}>
                      <div className="flex items-center gap-1 justify-center">
                        <span className="font-bold">{t.abbreviation}</span>
                        {i === mySlot && <span className="text-[9px] bg-white/25 px-1 rounded">YOU</span>}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rounds }, (_, r) => r + 1).map(round => (
                  <tr key={round} className="border-t border-slate-100">
                    <th className="sticky left-0 bg-white px-2 py-1.5 text-slate-400 font-semibold">{round}</th>
                    {order.map((t, slot) => {
                      const c = cell[`${round}:${slot}`]
                      const isCur = onClock && curRound === round && curSlot === slot
                      return (
                        <td key={t.id} className={`px-2 py-1.5 border-l border-slate-50 align-top ${isCur ? 'ring-2 ring-emerald-400 ring-inset' : ''}`}>
                          {c ? (
                            <div className="leading-tight">
                              <div className="flex items-center gap-1">
                                <span className={`text-[8px] font-bold px-1 rounded ${sportMeta(c.player.sport).light}`}>{c.player.position}</span>
                                <span className="text-[9px] text-slate-300 tabular-nums">{c.overall}</span>
                              </div>
                              <div className="text-slate-800 truncate max-w-[7rem]">{c.player.name}</div>
                            </div>
                          ) : <span className="text-slate-200">—</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid lg:grid-cols-3 gap-5">
            {/* Available players */}
            <div className="lg:col-span-2 card overflow-hidden">
              <div className="p-3 border-b border-slate-100 flex gap-2 flex-wrap items-center">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="input text-sm flex-1 min-w-[10rem]" />
                {mockSport === 'ALL' && <>
                  <button onClick={() => setSportFilter('ALL')} className={`px-2 py-1 rounded text-xs font-medium ${sportFilter === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>All</button>
                  {enabledSports.map(s => <button key={s} onClick={() => setSportFilter(s)} className={`px-2 py-1 rounded text-xs font-medium ${sportFilter === s ? `${sportMeta(s).bg} text-white` : 'bg-slate-100 text-slate-600'}`}>{s}</button>)}
                </>}
              </div>
              <div className="max-h-[26rem] overflow-y-auto divide-y divide-slate-50">
                {available.slice(0, 100).map(p => (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sportMeta(p.sport).light}`}>{p.sport}</span>
                    <span className="font-medium text-slate-800 truncate flex-1">{p.name} <span className="text-xs text-slate-400">{p.position} · {p.realTeamAbbr}</span></span>
                    <span className="text-xs text-slate-400 tabular-nums hidden sm:inline">ADP {p.adp ? p.adp.toFixed(0) : '—'}</span>
                    <button onClick={() => pick(p)} disabled={!myTurn} className="btn-primary text-xs px-3 py-1 disabled:opacity-30">Draft</button>
                  </div>
                ))}
                {available.length === 0 && <p className="px-3 py-8 text-center text-slate-400 text-sm">No players available.</p>}
              </div>
            </div>

            {/* My picks */}
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 font-semibold text-slate-900 text-sm">Your picks ({myPicks.length})</div>
              <div className="divide-y divide-slate-50 max-h-[26rem] overflow-y-auto">
                {myPicks.length === 0 ? <p className="px-4 py-4 text-slate-400 text-sm">No picks yet.</p> : myPicks.map(p => (
                  <div key={p.overall} className="flex items-center gap-2 px-4 py-1.5 text-sm">
                    <span className="text-[11px] text-slate-300 tabular-nums w-7">{p.round}.{String(p.slot + 1).padStart(2, '0')}</span>
                    <span className={`text-[10px] font-bold px-1 rounded ${sportMeta(p.player.sport).light}`}>{p.player.sport}</span>
                    <span className="truncate text-slate-800">{p.player.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
