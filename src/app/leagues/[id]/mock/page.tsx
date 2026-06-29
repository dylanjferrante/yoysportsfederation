'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

type Team = { id: string; name: string; abbreviation: string; primaryColor: string; secondaryColor: string; logo: string | null }
type Player = { id: string; name: string; position: string; sport: string; realTeamAbbr: string | null; adp: number | null; projectedPoints: number | null }
type Pick = { overall: number; round: number; teamIdx: number; player: Player }

const SPORTS = ['NFL', 'NBA', 'NHL', 'MLB']

export default function MockDraft() {
  const { id } = useParams<{ id: string }>()
  const [teams, setTeams] = useState<Team[]>([])
  const [pool, setPool] = useState<Player[]>([])
  const [rounds, setRounds] = useState(5)
  const [myIdx, setMyIdx] = useState(0)
  const [order, setOrder] = useState<Team[]>([])
  const [picks, setPicks] = useState<Pick[]>([])
  const [started, setStarted] = useState(false)
  const [sportFilter, setSportFilter] = useState('ALL')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch(`/api/leagues/${id}/mock`).then(r => r.json()).then(d => {
      setTeams(d.teams ?? [])
      setPool(d.available ?? [])
    })
  }, [id])

  const taken = useMemo(() => new Set(picks.map(p => p.player.id)), [picks])
  const available = useMemo(() => pool.filter(p => !taken.has(p.id)
    && (sportFilter === 'ALL' || p.sport === sportFilter)
    && (!search || p.name.toLowerCase().includes(search.toLowerCase()))), [pool, taken, sportFilter, search])

  const totalPicks = order.length * rounds
  const onClock = started && picks.length < totalPicks
  const curRound = Math.floor(picks.length / Math.max(1, order.length)) + 1
  const idxInRound = picks.length % Math.max(1, order.length)
  // Snake: even rounds reverse.
  const curTeamIdx = onClock ? (curRound % 2 === 1 ? idxInRound : order.length - 1 - idxInRound) : -1
  const myTurn = onClock && curTeamIdx === myIdx

  function start() {
    // Randomize draft order; remember which slot is "me".
    const shuffled = [...teams].map(t => ({ t, r: Math.random() })).sort((a, b) => a.r - b.r).map(x => x.t)
    setOrder(shuffled)
    setMyIdx(Math.max(0, shuffled.findIndex(t => t.id === teams[myIdx]?.id)))
    setPicks([])
    setStarted(true)
  }

  function pick(player: Player) {
    setPicks(prev => {
      if (prev.length >= totalPicks) return prev
      const round = Math.floor(prev.length / order.length) + 1
      const inRound = prev.length % order.length
      const teamIdx = round % 2 === 1 ? inRound : order.length - 1 - inRound
      return [...prev, { overall: prev.length + 1, round, teamIdx, player }]
    })
  }

  // Bots auto-pick best-available by ADP whenever it isn't my turn.
  useEffect(() => {
    if (!onClock || myTurn) return
    const best = available[0]
    if (!best) return
    const t = setTimeout(() => pick(best), 350)
    return () => clearTimeout(t)
  }, [onClock, myTurn, available])

  const myRoster = picks.filter(p => p.teamIdx === myIdx)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-5">
        <Link href={`/leagues/${id}`} className="btn-ghost text-slate-500">← League</Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Mock Draft</h1>
          <p className="text-sm text-slate-500">Practice against auto-drafting bots · nothing is saved</p>
        </div>
      </div>

      {!started ? (
        <div className="card p-6 max-w-md space-y-4">
          <div>
            <label className="label">Your franchise</label>
            <select className="select" value={myIdx} onChange={e => setMyIdx(+e.target.value)}>
              {teams.map((t, i) => <option key={t.id} value={i}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Rounds</label>
            <select className="select" value={rounds} onChange={e => setRounds(+e.target.value)}>
              {[3, 4, 5, 6, 8, 10, 12, 15].map(n => <option key={n} value={n}>{n} rounds</option>)}
            </select>
          </div>
          <button onClick={start} disabled={teams.length === 0 || pool.length === 0} className="btn-primary w-full disabled:opacity-50">Start Mock Draft</button>
          <p className="text-xs text-slate-400">{pool.length} players in the pool · draft order is randomized.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className={`rounded-xl px-4 py-2 text-sm font-semibold ${myTurn ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-600'}`}>
              {onClock
                ? <>Round {curRound} · Pick {picks.length + 1} of {totalPicks} — <span className="font-bold">{myTurn ? 'You are on the clock' : `${order[curTeamIdx]?.name} (bot)`}</span></>
                : <>Draft complete — {totalPicks} picks made</>}
            </div>
            <button onClick={() => setStarted(false)} className="btn-secondary text-sm">Reset</button>
          </div>

          <div className="grid lg:grid-cols-3 gap-5">
            {/* Available players */}
            <div className="lg:col-span-2 card overflow-hidden">
              <div className="p-3 border-b border-slate-100 flex gap-2 flex-wrap items-center">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players…" className="input text-sm flex-1 min-w-[10rem]" />
                <button onClick={() => setSportFilter('ALL')} className={`px-2 py-1 rounded text-xs font-medium ${sportFilter === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>All</button>
                {SPORTS.map(s => <button key={s} onClick={() => setSportFilter(s)} className={`px-2 py-1 rounded text-xs font-medium ${sportFilter === s ? `${sportMeta(s).bg} text-white` : 'bg-slate-100 text-slate-600'}`}>{s}</button>)}
              </div>
              <div className="max-h-[28rem] overflow-y-auto divide-y divide-slate-50">
                {available.slice(0, 100).map(p => (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sportMeta(p.sport).light}`}>{p.sport}</span>
                    <span className="font-medium text-slate-800 truncate flex-1">{p.name} <span className="text-xs text-slate-400">{p.position} · {p.realTeamAbbr}</span></span>
                    <span className="text-xs text-slate-400 tabular-nums hidden sm:inline">ADP {p.adp ? p.adp.toFixed(0) : '—'}</span>
                    <button onClick={() => pick(p)} disabled={!myTurn} className="btn-primary text-xs px-3 py-1 disabled:opacity-30">Draft</button>
                  </div>
                ))}
                {available.length === 0 && <p className="px-3 py-8 text-center text-slate-400 text-sm">No players match.</p>}
              </div>
            </div>

            {/* My roster + recent picks */}
            <div className="space-y-5">
              <div className="card overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 font-semibold text-slate-900 text-sm">Your picks ({myRoster.length})</div>
                <div className="divide-y divide-slate-50 max-h-56 overflow-y-auto">
                  {myRoster.length === 0 ? <p className="px-4 py-4 text-slate-400 text-sm">No picks yet.</p> : myRoster.map(p => (
                    <div key={p.overall} className="flex items-center gap-2 px-4 py-1.5 text-sm">
                      <span className="text-[11px] text-slate-300 tabular-nums w-7">{p.round}.{String(((p.overall - 1) % order.length) + 1).padStart(2, '0')}</span>
                      <span className={`text-[10px] font-bold px-1 rounded ${sportMeta(p.player.sport).light}`}>{p.player.sport}</span>
                      <span className="truncate text-slate-800">{p.player.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 font-semibold text-slate-900 text-sm">Recent picks</div>
                <div className="divide-y divide-slate-50 max-h-56 overflow-y-auto">
                  {[...picks].slice(-12).reverse().map(p => (
                    <div key={p.overall} className="flex items-center gap-2 px-4 py-1.5 text-xs">
                      <span className="text-slate-300 tabular-nums w-6">{p.overall}</span>
                      <span className="text-slate-500 truncate w-20">{order[p.teamIdx]?.abbreviation}</span>
                      <span className="truncate text-slate-800">{p.player.name}</span>
                    </div>
                  ))}
                  {picks.length === 0 && <p className="px-4 py-4 text-slate-400 text-xs">Draft hasn’t started.</p>}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
