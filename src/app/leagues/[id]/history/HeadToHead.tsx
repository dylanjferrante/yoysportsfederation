'use client'

import { useMemo, useState } from 'react'
import { sportMeta } from '@/lib/utils'

type Matchup = { sport: string; homeTeamId: string; awayTeamId: string | null; homeScore: number; awayScore: number; isComplete: boolean }
type Team = { id: string; name: string; abbreviation: string }

export default function HeadToHead({ matchups, teams, sportsEnabled }: { matchups: Matchup[]; teams: Team[]; sportsEnabled: string[] }) {
  const [sport, setSport] = useState('ALL')

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
                return <td key={col.id} className={`px-2 py-2 text-center ${good ? 'text-green-600 font-semibold' : rec.w < rec.l ? 'text-red-500' : 'text-slate-500'}`}>{rec.w}-{rec.l}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
