'use client'

import { useState } from 'react'
import Link from 'next/link'
import { RESERVE_SLOTS } from '@/lib/defaults'

type PL = {
  slot: string; name: string; position: string; playerId: string
  projected: number; points: number | null; colVals: (number | null)[]
  gameDate: string | null; gameLabel: string | null; gameBucket: string | null
}
type Team = { name: string; abbreviation: string; logo: string | null; altLogo: string | null; primaryColor: string | null; secondaryColor: string | null; logoBg: boolean }
type Side = { team: Team | null; starters: PL[]; bench: PL[]; dayOverrides: Record<string, Record<string, string>> }
type Day = { date: string; label: string }
type Mode = 'PROJ' | 'WEEK' | 'DAY'

const isStarter = (slot: string) => !RESERVE_SLOTS.includes(slot)
const round1 = (n: number) => +n.toFixed(1)

function Logo({ team, size }: { team: Team | null; size: number }) {
  if (!team) return <span className="rounded-lg bg-slate-100 flex-shrink-0" style={{ width: size, height: size }} />
  const primary = team.primaryColor || '#0f172a'
  const secondary = team.secondaryColor || '#ffffff'
  const src = team.altLogo || team.logo
  return src
    ? <span className="rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ width: size, height: size, background: team.logoBg ? primary : '#f1f5f9' }}><img src={src} alt="" style={{ width: '80%', height: '80%', objectFit: 'contain' }} /></span>
    : <span className="rounded-lg flex items-center justify-center flex-shrink-0 font-bold" style={{ width: size, height: size, background: primary, color: secondary, fontSize: Math.round(size * 0.34) }}>{(team.abbreviation || team.name || '?').slice(0, 3).toUpperCase()}</span>
}

export default function BoxScores({ home, away, cols, accent, weekScore, weekDays, today }: {
  home: Side; away: Side; cols: string[]; accent: string; weekScore: { home: number; away: number }; weekDays: Day[]; today: string
}) {
  const [mode, setMode] = useState<Mode>('WEEK')
  const daily = weekDays.length > 0
  const defaultDay = weekDays.some(d => d.date === today) ? today : (weekDays[0]?.date ?? '')
  const [day, setDay] = useState(defaultDay)

  // Rows to render for a side, plus that side's displayed total, given the mode.
  const view = (side: Side, which: 'home' | 'away') => {
    if (mode === 'DAY') {
      const roster = [...side.starters, ...side.bench]
      const withSlot = roster.map(p => ({ p, slot: side.dayOverrides[day]?.[p.playerId] ?? p.slot }))
      const starters = withSlot.filter(x => isStarter(x.slot))
      const bench = withSlot.filter(x => !isStarter(x.slot))
      const total = round1(starters.reduce((s, x) => s + (x.p.gameDate === day ? (x.p.points || 0) : 0), 0))
      return { starters, bench, total }
    }
    const total = mode === 'PROJ'
      ? round1(side.starters.reduce((s, p) => s + (p.projected || 0), 0))
      : weekScore[which]
    return { starters: side.starters.map(p => ({ p, slot: p.slot })), bench: side.bench.map(p => ({ p, slot: p.slot })), total }
  }

  const Table = ({ side, which }: { side: Side; which: 'home' | 'away' }) => {
    const { starters, bench, total } = view(side, which)

    const Row = ({ x, benchRow }: { x: { p: PL; slot: string }; benchRow?: boolean }) => {
      const p = x.p
      const playingToday = p.gameDate === day
      const off = mode === 'DAY' && !playingToday       // on roster but no game that day
      const muted = benchRow || off
      const pv = mode === 'PROJ' ? p.projected : mode === 'DAY' ? (playingToday ? p.points : null) : p.points
      const colAt = (i: number) => mode === 'PROJ' ? null : mode === 'DAY' ? (playingToday ? p.colVals[i] : null) : p.colVals[i]
      const gameCell = mode === 'DAY'
        ? (playingToday ? <span className={`text-[10px] font-semibold ${p.gameBucket === 'live' ? 'text-red-500' : p.gameBucket === 'final' ? 'text-slate-400' : 'text-blue-600'}`}>{p.gameLabel}</span> : <span className="text-[10px] font-semibold text-slate-300">Off</span>)
        : (p.gameLabel ? <span className={`text-[10px] font-semibold ${p.gameBucket === 'live' ? 'text-red-500' : p.gameBucket === 'final' ? 'text-slate-400' : 'text-blue-600'}`}>{p.gameLabel}</span> : '—')
      return (
        <tr className={muted ? 'text-slate-400' : 'hover:bg-slate-50'}>
          <td className="px-2 py-1.5 text-[11px] font-semibold text-slate-400 tabular-nums">{x.slot}</td>
          <td className="px-2 py-1.5 whitespace-nowrap">
            <Link href={`/players/${p.playerId}`} className={`font-medium hover:text-blue-600 ${muted ? 'text-slate-400' : 'text-slate-800'}`}>{p.name}</Link>
            <span className="text-[11px] text-slate-400"> {p.position}</span>
          </td>
          {cols.map((c, i) => { const v = colAt(i); return <td key={c} className="px-2 py-1.5 text-center tabular-nums text-slate-600">{v == null ? '—' : v}</td> })}
          <td className="px-2 py-1.5 text-center whitespace-nowrap">{gameCell}</td>
          <td className="px-3 py-1.5 text-right font-bold tabular-nums" style={{ color: muted ? undefined : accent }}>{pv == null ? '—' : pv.toFixed(1)}</td>
        </tr>
      )
    }
    return (
      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
          <span className="flex items-center gap-2 font-bold text-slate-900 min-w-0"><Logo team={side.team} size={26} /><span className="truncate">{side.team?.name ?? 'BYE'}</span></span>
          <span className="text-2xl font-black tabular-nums flex-shrink-0" style={{ color: accent }}>{total.toFixed(1)}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-100">
              <th className="px-2 py-1.5 text-left font-semibold">Pos</th>
              <th className="px-2 py-1.5 text-left font-semibold">{mode === 'DAY' ? 'Player' : 'Starter'}</th>
              {cols.map(c => <th key={c} className="px-2 py-1.5 text-center font-semibold">{c}</th>)}
              <th className="px-2 py-1.5 text-center font-semibold">Game</th>
              <th className="px-3 py-1.5 text-right font-semibold">{mode === 'PROJ' ? 'Proj' : 'Pts'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {starters.map(x => <Row key={x.p.playerId} x={x} />)}
            <tr className="bg-slate-50"><td colSpan={cols.length + 4} className="px-2 py-1 text-[10px] uppercase font-bold text-slate-400">Bench</td></tr>
            {bench.map(x => <Row key={x.p.playerId} x={x} benchRow />)}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {([['PROJ', 'Projected'], ['WEEK', 'Week total'], ...(daily ? [['DAY', 'Day by day']] : [])] as [Mode, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setMode(key)}
              className={`px-3 py-1.5 rounded-md font-medium ${mode === key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'DAY' && daily && (
        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1">
          {weekDays.map(d => (
            <button key={d.date} onClick={() => setDay(d.date)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border ${day === d.date ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
              {d.label}{d.date === today ? ' · Today' : ''}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <Table side={home} which="home" />
        <Table side={away} which="away" />
      </div>
    </div>
  )
}
