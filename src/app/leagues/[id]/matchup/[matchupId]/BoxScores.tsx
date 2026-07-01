'use client'

import { useState } from 'react'
import Link from 'next/link'

type PL = {
  slot: string; name: string; position: string; playerId: string
  projected: number; points: number | null; colVals: (number | null)[]
  isToday: boolean; gameLabel: string | null; gameBucket: string | null
}
type Team = { name: string; abbreviation: string; logo: string | null; altLogo: string | null; primaryColor: string | null; secondaryColor: string | null; logoBg: boolean }
type Side = { team: Team | null; starters: PL[]; bench: PL[] }
type Mode = 'WEEK' | 'PROJ' | 'TODAY'

const MODES: { key: Mode; label: string }[] = [
  { key: 'PROJ', label: 'Projected' },
  { key: 'WEEK', label: 'Week total' },
  { key: 'TODAY', label: 'Today' },
]

function Logo({ team, size }: { team: Team | null; size: number }) {
  if (!team) return <span className="rounded-lg bg-slate-100 flex-shrink-0" style={{ width: size, height: size }} />
  const primary = team.primaryColor || '#0f172a'
  const secondary = team.secondaryColor || '#ffffff'
  const src = team.altLogo || team.logo
  return src
    ? <span className="rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ width: size, height: size, background: team.logoBg ? primary : '#f1f5f9' }}><img src={src} alt="" style={{ width: '80%', height: '80%', objectFit: 'contain' }} /></span>
    : <span className="rounded-lg flex items-center justify-center flex-shrink-0 font-bold" style={{ width: size, height: size, background: primary, color: secondary, fontSize: Math.round(size * 0.34) }}>{(team.abbreviation || team.name || '?').slice(0, 3).toUpperCase()}</span>
}

const round1 = (n: number) => +n.toFixed(1)

export default function BoxScores({ home, away, cols, accent, weekScore }: {
  home: Side; away: Side; cols: string[]; accent: string; weekScore: { home: number; away: number }
}) {
  const [mode, setMode] = useState<Mode>('WEEK')

  const ptOf = (p: PL): number | null =>
    mode === 'PROJ' ? p.projected : mode === 'TODAY' ? (p.isToday ? p.points : null) : p.points
  const colOf = (p: PL, i: number): number | null =>
    mode === 'PROJ' ? null : mode === 'TODAY' ? (p.isToday ? p.colVals[i] : null) : p.colVals[i]
  const total = (side: Side, which: 'home' | 'away'): number =>
    mode === 'PROJ' ? round1(side.starters.reduce((s, p) => s + (p.projected || 0), 0))
      : mode === 'TODAY' ? round1(side.starters.reduce((s, p) => s + (p.isToday ? (p.points || 0) : 0), 0))
        : weekScore[which]

  const Table = ({ side, which }: { side: Side; which: 'home' | 'away' }) => {
    const Row = ({ p, bench }: { p: PL; bench?: boolean }) => {
      const muted = bench || (mode === 'TODAY' && !p.isToday)
      const pv = ptOf(p)
      return (
        <tr className={muted ? 'text-slate-400' : 'hover:bg-slate-50'}>
          <td className="px-2 py-1.5 text-[11px] font-semibold text-slate-400 tabular-nums">{p.slot}</td>
          <td className="px-2 py-1.5 whitespace-nowrap">
            <Link href={`/players/${p.playerId}`} className={`font-medium hover:text-blue-600 ${muted ? 'text-slate-400' : 'text-slate-800'}`}>{p.name}</Link>
            <span className="text-[11px] text-slate-400"> {p.position}</span>
          </td>
          {cols.map((c, i) => { const v = colOf(p, i); return <td key={c} className="px-2 py-1.5 text-center tabular-nums text-slate-600">{v == null ? '—' : v}</td> })}
          <td className="px-2 py-1.5 text-center whitespace-nowrap">
            {p.gameLabel ? <span className={`text-[10px] font-semibold ${p.gameBucket === 'live' ? 'text-red-500' : p.gameBucket === 'final' ? 'text-slate-400' : 'text-blue-600'}`}>{p.gameLabel}</span> : '—'}
          </td>
          <td className="px-3 py-1.5 text-right font-bold tabular-nums" style={{ color: muted ? undefined : accent }}>{pv == null ? '—' : pv.toFixed(1)}</td>
        </tr>
      )
    }
    return (
      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
          <span className="flex items-center gap-2 font-bold text-slate-900 min-w-0"><Logo team={side.team} size={26} /><span className="truncate">{side.team?.name ?? 'BYE'}</span></span>
          <span className="text-2xl font-black tabular-nums flex-shrink-0" style={{ color: accent }}>{total(side, which).toFixed(1)}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-100">
              <th className="px-2 py-1.5 text-left font-semibold">Pos</th>
              <th className="px-2 py-1.5 text-left font-semibold">Starter</th>
              {cols.map(c => <th key={c} className="px-2 py-1.5 text-center font-semibold">{c}</th>)}
              <th className="px-2 py-1.5 text-center font-semibold">Game</th>
              <th className="px-3 py-1.5 text-right font-semibold">{mode === 'PROJ' ? 'Proj' : 'Pts'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {side.starters.map(p => <Row key={p.playerId} p={p} />)}
            <tr className="bg-slate-50"><td colSpan={cols.length + 4} className="px-2 py-1 text-[10px] uppercase font-bold text-slate-400">Bench</td></tr>
            {side.bench.map(p => <Row key={p.playerId} p={p} bench />)}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {MODES.map(mo => (
            <button key={mo.key} onClick={() => setMode(mo.key)}
              className={`px-3 py-1.5 rounded-md font-medium ${mode === mo.key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
              {mo.label}
            </button>
          ))}
        </div>
        {mode === 'TODAY' && <span className="text-xs text-slate-400">Only players with a game today count.</span>}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <Table side={home} which="home" />
        <Table side={away} which="away" />
      </div>
    </div>
  )
}
