'use client'

import { useMemo, useState } from 'react'
import { sportMeta } from '@/lib/utils'
import { sportWeekOf, type ScheduleEntry } from '@/lib/defaults'

type Matchup = { sport: string; season?: string | null; week?: number; homeTeamId: string; awayTeamId: string | null; homeScore: number; awayScore: number; isComplete: boolean }
type Team = { id: string; name: string; abbreviation: string }

export default function HeadToHead({ matchups, teams, sportsEnabled, schedule = [] }: { matchups: Matchup[]; teams: Team[]; sportsEnabled: string[]; schedule?: ScheduleEntry[] }) {
  const [sport, setSport] = useState('ALL')
  const [pair, setPair] = useState<{ a: Team; b: Team } | null>(null)

  // Matchups between the selected pair (respecting the sport filter), newest first.
  const pairGames = useMemo(() => {
    if (!pair) return []
    return matchups
      .filter(m => m.isComplete && m.awayTeamId &&
        ((m.homeTeamId === pair.a.id && m.awayTeamId === pair.b.id) || (m.homeTeamId === pair.b.id && m.awayTeamId === pair.a.id)) &&
        (sport === 'ALL' || m.sport === sport))
      .sort((x, y) => (y.season ?? '').localeCompare(x.season ?? '') || (y.week ?? 0) - (x.week ?? 0))
  }, [pair, matchups, sport])

  // record[a][b] = wins of a over b
  const record = useMemo(() => {
    const r: Record<string, Record<string, { w: number; l: number }>> = {}
    for (const t of teams) { r[t.id] = {}; for (const o of teams) if (o.id !== t.id) r[t.id][o.id] = { w: 0, l: 0 } }
    for (const m of matchups) {
      if (!m.isComplete || !m.awayTeamId) continue
      if (sport !== 'ALL' && m.sport !== sport) continue
      const homeWin = m.homeScore >= m.awayScore
      if (!r[m.homeTeamId]?.[m.awayTeamId]) continue
      if (homeWin) { r[m.homeTeamId][m.awayTeamId].w++; r[m.awayTeamId][m.homeTeamId].l++ }
      else { r[m.awayTeamId][m.homeTeamId].w++; r[m.homeTeamId][m.awayTeamId].l++ }
    }
    return r
  }, [matchups, teams, sport])

  return (
    <div className="card overflow-x-auto">
      <div className="card-header flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">All-Time Head-to-Head</h2>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setSport('ALL')} className={`px-2.5 py-1 rounded-full text-xs font-semibold ${sport === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>All</button>
          {sportsEnabled.map(s => (
            <button key={s} onClick={() => setSport(s)} className={`px-2.5 py-1 rounded-full text-xs font-semibold ${sport === s ? `${sportMeta(s).bg} text-white` : 'bg-slate-100 text-slate-600'}`}>{sportMeta(s).emoji} {s}</button>
          ))}
        </div>
      </div>
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-slate-50 px-2 py-2 text-left text-slate-400 font-medium">vs →</th>
            {teams.map(t => <th key={t.id} className="px-2 py-2 text-slate-500 font-semibold">{t.abbreviation}</th>)}
          </tr>
        </thead>
        <tbody>
          {teams.map(row => (
            <tr key={row.id} className="border-t border-slate-50">
              <th className="sticky left-0 bg-white px-2 py-2 text-left font-semibold text-slate-700 whitespace-nowrap">{row.abbreviation}</th>
              {teams.map(col => {
                if (col.id === row.id) return <td key={col.id} className="px-2 py-2 text-center bg-slate-50 text-slate-300">—</td>
                const rec = record[row.id]?.[col.id] ?? { w: 0, l: 0 }
                const good = rec.w > rec.l
                const total = rec.w + rec.l
                return (
                  <td key={col.id} className="px-1 py-1 text-center">
                    <button disabled={!total} onClick={() => setPair({ a: row, b: col })}
                      className={`px-1.5 py-1 rounded ${total ? 'hover:bg-slate-100 cursor-pointer' : 'cursor-default'} ${good ? 'text-green-600 font-semibold' : rec.w < rec.l ? 'text-red-500' : 'text-slate-500'}`}>
                      {rec.w}-{rec.l}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Matchup list for the selected pair — inline, below the table */}
      {pair && (() => {
        const aWins = pairGames.filter(m => (m.homeTeamId === pair.a.id ? m.homeScore : m.awayScore) >= (m.homeTeamId === pair.a.id ? m.awayScore : m.homeScore)).length
        const bWins = pairGames.length - aWins
        return (
        <div className="border-t border-slate-100">
          <div className="px-5 py-3 flex items-center justify-between bg-slate-50 flex-wrap gap-2">
            <h3 className="font-semibold text-slate-900 text-sm">
              {pair.a.name} vs {pair.b.name}{sport !== 'ALL' ? ` · ${sport}` : ''}
              <span className="ml-2 font-normal text-slate-400">{pairGames.length} games · {aWins}–{bWins}</span>
            </h3>
            <button onClick={() => setPair(null)} className="text-slate-400 hover:text-slate-700 text-sm">Close ×</button>
          </div>
          {pairGames.length === 0 ? <p className="px-5 py-8 text-center text-slate-400 text-sm">No completed matchups.</p> : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-white sticky top-0">
                    <th className="text-left px-5 py-2 font-semibold">Sport</th>
                    <th className="text-left px-2 py-2 font-semibold">Season</th>
                    <th className="text-left px-2 py-2 font-semibold">Week</th>
                    <th className="text-right px-3 py-2 font-semibold">{pair.a.name}</th>
                    <th className="text-right px-3 py-2 font-semibold">{pair.b.name}</th>
                    <th className="text-left px-3 py-2 font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {pairGames.map((m, i) => {
                    const aHome = m.homeTeamId === pair.a.id
                    const aScore = aHome ? m.homeScore : m.awayScore
                    const bScore = aHome ? m.awayScore : m.homeScore
                    const aWon = aScore >= bScore
                    const margin = Math.abs(aScore - bScore).toFixed(1)
                    const meta = sportMeta(m.sport)
                    const winner = aWon ? pair.a : pair.b
                    return (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-5 py-2"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${meta.light}`}>{meta.emoji} {m.sport}</span></td>
                        <td className="px-2 py-2 text-slate-500 text-xs tabular-nums">{m.season ?? '—'}</td>
                        <td className="px-2 py-2 text-slate-500 text-xs tabular-nums">{(() => { const sw = m.week ? sportWeekOf(schedule, m.sport, m.week) : null; return sw ? `Wk ${sw}` : (m.week ? `Wk ${m.week}` : '—') })()}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${aWon ? 'font-bold text-slate-900' : 'text-slate-500'}`}>{(aScore ?? 0).toFixed(1)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${!aWon ? 'font-bold text-slate-900' : 'text-slate-500'}`}>{(bScore ?? 0).toFixed(1)}</td>
                        <td className="px-3 py-2 text-xs text-slate-500"><span className="font-semibold text-slate-700">{winner.abbreviation}</span> by {margin}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )
      })()}
    </div>
  )
}
