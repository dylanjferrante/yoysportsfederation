'use client'

import { useState } from 'react'
import Link from 'next/link'
import { RESERVE_SLOTS } from '@/lib/defaults'
import { positionGroups, groupIndexFor } from '@/lib/box-score-layout'
import { scoreBreakdown, type ScoreLine, type Stats } from '@/lib/scoring'
import { statMeta } from '@/lib/scoring-categories'

type PL = {
  slot: string; name: string; position: string; playerId: string
  projected: number; points: number | null
  weekStats: Stats; projStats: Stats
  gameLabel: string | null; gameBucket: string | null; gameDate: string | null
}
type Team = { name: string; abbreviation: string; logo: string | null; altLogo: string | null; primaryColor: string | null; secondaryColor: string | null; logoBg: boolean }
type Side = { team: Team | null; starters: PL[]; bench: PL[]; dayOverrides: Record<string, Record<string, string>> }
type Day = { date: string; label: string }
type DayEntry = { points: number; stats: Stats }
type DayStats = Record<string, Record<string, DayEntry>>
type Mode = 'PROJ' | 'WEEK' | 'DAY'
type Modal = { name: string; position: string; scope: string; game: string | null; items: ScoreLine[]; total: number }

const isStarter = (slot: string) => !RESERVE_SLOTS.includes(slot)
const round1 = (n: number) => +n.toFixed(1)
const cellVal = (v: string | number) => typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : v
const sig = (n: number) => Number.isInteger(n) ? String(n) : String(+n.toFixed(2))

function Logo({ team, size }: { team: Team | null; size: number }) {
  if (!team) return <span className="rounded-lg bg-slate-100 flex-shrink-0" style={{ width: size, height: size }} />
  const primary = team.primaryColor || '#0f172a'
  const secondary = team.secondaryColor || '#ffffff'
  const src = team.altLogo || team.logo
  return src
    ? <span className="rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ width: size, height: size, background: team.logoBg ? primary : '#f1f5f9' }}><img src={src} alt="" style={{ width: '80%', height: '80%', objectFit: 'contain' }} /></span>
    : <span className="rounded-lg flex items-center justify-center flex-shrink-0 font-bold" style={{ width: size, height: size, background: primary, color: secondary, fontSize: Math.round(size * 0.34) }}>{(team.abbreviation || team.name || '?').slice(0, 3).toUpperCase()}</span>
}

export default function BoxScores({ home, away, sport, scoring, accent, weekScore, weekDays, today, dayStats }: {
  home: Side; away: Side; sport: string; scoring: Record<string, number>; accent: string
  weekScore: { home: number; away: number }; weekDays: Day[]; today: string; dayStats: DayStats
}) {
  const [mode, setMode] = useState<Mode>('WEEK')
  const [modal, setModal] = useState<Modal | null>(null)
  const daily = weekDays.length > 0
  const defaultDay = weekDays.some(d => d.date === today) ? today : (weekDays[0]?.date ?? '')
  const [day, setDay] = useState(defaultDay)
  const groups = positionGroups(sport)
  const scopeLabel = mode === 'PROJ' ? 'Projected' : mode === 'WEEK' ? 'Week total' : (weekDays.find(d => d.date === day)?.label ?? 'Day')

  // The stat line + points to show for a player in the current mode (null when the
  // player has no line to show — bench in projected, or no game that day).
  const rowData = (p: PL): { stats: Stats | null; pts: number | null } => {
    if (mode === 'PROJ') return Object.keys(p.projStats).length ? { stats: p.projStats, pts: scoreBreakdown(p.projStats, scoring).total } : { stats: null, pts: p.projected }
    if (mode === 'DAY') { const ds = dayStats[p.playerId]?.[day]; return ds ? { stats: ds.stats, pts: ds.points } : { stats: null, pts: null } }
    return p.points == null ? { stats: null, pts: null } : { stats: p.weekStats, pts: p.points }
  }

  // Effective (slot-resolved) starters/bench for a side under the current mode.
  const rosterFor = (side: Side) => {
    if (mode === 'DAY') {
      const all = [...side.starters, ...side.bench].map(p => ({ p, slot: side.dayOverrides[day]?.[p.playerId] ?? p.slot }))
      return { starters: all.filter(x => isStarter(x.slot)), bench: all.filter(x => !isStarter(x.slot)) }
    }
    return { starters: side.starters.map(p => ({ p, slot: p.slot })), bench: side.bench.map(p => ({ p, slot: p.slot })) }
  }

  const sideTotal = (side: Side, which: 'home' | 'away') => {
    if (mode === 'WEEK') return weekScore[which]
    return round1(rosterFor(side).starters.reduce((s, x) => s + (rowData(x.p).pts || 0), 0))
  }

  const openBreakdown = (p: PL, stats: Stats, game: string | null) => {
    const { items, total } = scoreBreakdown(stats, scoring)
    setModal({ name: p.name, position: p.position, scope: scopeLabel, game, items, total })
  }

  const Row = ({ x, cols, benchRow }: { x: { p: PL; slot: string }; cols: ReturnType<typeof positionGroups>[number]['cols']; benchRow?: boolean }) => {
    const p = x.p
    const { stats, pts } = rowData(p)
    const off = mode === 'DAY' && !stats           // on roster but no game that day
    const muted = benchRow || off
    const breakdown = stats ? scoreBreakdown(stats, scoring) : null
    const clickable = !!breakdown && breakdown.items.length > 0
    const gameCell = mode === 'DAY'
      ? (stats ? <span className="text-[10px] font-semibold text-slate-400">Played</span> : <span className="text-[10px] font-semibold text-slate-300">Off</span>)
      : (p.gameLabel ? <span className={`text-[10px] font-semibold ${p.gameBucket === 'live' ? 'text-red-500' : p.gameBucket === 'final' ? 'text-slate-400' : 'text-blue-600'}`}>{p.gameLabel}</span> : '—')
    return (
      <tr className={muted ? 'text-slate-400' : 'hover:bg-slate-50'}>
        <td className="px-2 py-1.5 text-[11px] font-semibold text-slate-400 tabular-nums">{x.slot}</td>
        <td className="px-2 py-1.5 whitespace-nowrap">
          <Link href={`/players/${p.playerId}`} className={`font-medium hover:text-blue-600 ${muted ? 'text-slate-400' : 'text-slate-800'}`}>{p.name}</Link>
          <span className="text-[11px] text-slate-400"> {p.position}</span>
        </td>
        {cols.map((c, i) => <td key={i} className="px-2 py-1.5 text-center tabular-nums text-slate-600">{stats ? cellVal(c.get(stats)) : '—'}</td>)}
        <td className="px-2 py-1.5 text-center whitespace-nowrap">{gameCell}</td>
        <td className="px-3 py-1.5 text-right">
          {pts == null ? <span className="text-slate-300">—</span>
            : clickable
              ? <button onClick={() => openBreakdown(p, stats!, mode === 'DAY' ? null : p.gameLabel)}
                  className="font-bold tabular-nums underline decoration-dotted decoration-slate-300 underline-offset-2 hover:decoration-current"
                  style={{ color: muted ? undefined : accent }} title="Scoring breakdown">{pts.toFixed(1)}</button>
              : <span className="font-bold tabular-nums" style={{ color: muted ? undefined : accent }}>{pts.toFixed(1)}</span>}
        </td>
      </tr>
    )
  }

  const SideView = ({ side, which }: { side: Side; which: 'home' | 'away' }) => {
    const { starters, bench } = rosterFor(side)
    const total = sideTotal(side, which)
    return (
      <div className="space-y-3">
        <div className="card flex items-center justify-between px-4 py-2.5">
          <span className="flex items-center gap-2 font-bold text-slate-900 min-w-0"><Logo team={side.team} size={26} /><span className="truncate">{side.team?.name ?? 'BYE'}</span></span>
          <span className="text-2xl font-black tabular-nums flex-shrink-0" style={{ color: accent }}>{total.toFixed(1)}</span>
        </div>
        {groups.map((grp, gi) => {
          const gs = starters.filter(x => groupIndexFor(groups, x.p.position) === gi)
          const gb = bench.filter(x => groupIndexFor(groups, x.p.position) === gi)
          if (!gs.length && !gb.length) return null
          const span = grp.cols.length + 4
          return (
            <div key={grp.title} className="card overflow-x-auto">
              <div className="px-4 py-2 border-b border-slate-100 text-[11px] uppercase font-bold tracking-wide text-slate-500">{grp.title}</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-100">
                    <th className="px-2 py-1.5 text-left font-semibold">Slot</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Player</th>
                    {grp.cols.map(c => <th key={c.label} className="px-2 py-1.5 text-center font-semibold">{c.label}</th>)}
                    <th className="px-2 py-1.5 text-center font-semibold">Game</th>
                    <th className="px-3 py-1.5 text-right font-semibold">{mode === 'PROJ' ? 'Proj' : 'Pts'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {gs.map(x => <Row key={x.p.playerId} x={x} cols={grp.cols} />)}
                  {gb.length > 0 && <tr className="bg-slate-50"><td colSpan={span} className="px-2 py-1 text-[10px] uppercase font-bold text-slate-400">Bench</td></tr>}
                  {gb.map(x => <Row key={x.p.playerId} x={x} cols={grp.cols} benchRow />)}
                </tbody>
              </table>
            </div>
          )
        })}
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
        <span className="text-[11px] text-slate-400">Tap a player's points for the scoring breakdown</span>
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
        <SideView side={home} which="home" />
        <SideView side={away} which="away" />
      </div>

      {modal && <BreakdownModal sport={sport} accent={accent} modal={modal} onClose={() => setModal(null)} />}
    </div>
  )
}

function BreakdownModal({ sport, accent, modal, onClose }: { sport: string; accent: string; modal: Modal; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40" onClick={onClose}>
      <div className="card w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
          <div className="min-w-0">
            <p className="font-bold text-slate-900 truncate">{modal.name} <span className="text-sm font-normal text-slate-400">{modal.position}</span></p>
            <p className="text-[11px] text-slate-400">{modal.scope}{modal.game ? ` · ${modal.game}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1" aria-label="Close">✕</button>
        </div>
        {modal.items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-400 text-center">No scoring categories for this game.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-100">
                <th className="px-4 py-1.5 text-left font-semibold">Category</th>
                <th className="px-2 py-1.5 text-right font-semibold">Stat</th>
                <th className="px-2 py-1.5 text-right font-semibold">Pts/unit</th>
                <th className="px-4 py-1.5 text-right font-semibold">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {modal.items.map(it => (
                <tr key={it.key}>
                  <td className="px-4 py-1.5 text-slate-700">{statMeta(sport, it.key).label}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{sig(it.stat)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{sig(it.perUnit)}</td>
                  <td className={`px-4 py-1.5 text-right tabular-nums font-semibold ${it.points < 0 ? 'text-red-500' : 'text-slate-800'}`}>{it.points > 0 ? '+' : ''}{sig(it.points)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 font-bold">
                <td className="px-4 py-2 text-slate-900" colSpan={3}>Total</td>
                <td className="px-4 py-2 text-right tabular-nums" style={{ color: accent }}>{modal.total.toFixed(1)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
