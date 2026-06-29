'use client'

import { useMemo, useState } from 'react'
import { sportMeta } from '@/lib/utils'

type Matchup = { id: string; sport: string; season: string | null; week: number; homeTeamId: string; awayTeamId: string | null; homeScore: number; awayScore: number; isComplete: boolean }
type Team = { id: string; name: string; abbreviation: string }

export default function ScoresView({ matchups, teams, sportsEnabled, currentSeason }: {
  matchups: Matchup[]; teams: Team[]; sportsEnabled: string[]; currentSeason: string
}) {
  const teamById = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t])), [teams])
  const seasons = useMemo(() => {
    const s = [...new Set(matchups.map(m => m.season).filter(Boolean) as string[])]
    return s.sort().reverse()
  }, [matchups])

  const [season, setSeason] = useState(currentSeason)
  const seasonMatchups = useMemo(() => matchups.filter(m => m.season === season), [matchups, season])

  const weeks = useMemo(() => [...new Set(seasonMatchups.map(m => m.week))].sort((a, b) => a - b), [seasonMatchups])
  // Default to the current week: first with any incomplete game, else the last.
  const defaultWeek = useMemo(() => {
    const incomplete = seasonMatchups.filter(m => !m.isComplete).map(m => m.week)
    return incomplete.length ? Math.min(...incomplete) : (weeks[weeks.length - 1] ?? 1)
  }, [seasonMatchups, weeks])
  const [week, setWeek] = useState<number | null>(null)
  const activeWeek = week ?? defaultWeek

  const weekMatchups = seasonMatchups.filter(m => m.week === activeWeek)
  const activeSports = sportsEnabled.filter(s => weekMatchups.some(m => m.sport === s))
  const idx = weeks.indexOf(activeWeek)

  return (
    <div>
      {/* Controls */}
      <div className="card p-4 mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setWeek(weeks[Math.max(0, idx - 1)])} disabled={idx <= 0} className="btn-secondary text-sm disabled:opacity-40">← Prev</button>
          <span className="font-semibold text-slate-900 w-20 text-center">Week {activeWeek}</span>
          <button onClick={() => setWeek(weeks[Math.min(weeks.length - 1, idx + 1)])} disabled={idx >= weeks.length - 1} className="btn-secondary text-sm disabled:opacity-40">Next →</button>
        </div>
        <button onClick={() => setWeek(defaultWeek)} className="btn-ghost text-sm">Current week</button>
        <div className="ml-auto">
          <select className="select" value={season} onChange={e => { setSeason(e.target.value); setWeek(null) }}>
            {seasons.map(s => <option key={s} value={s}>{s}{s === currentSeason ? ' (current)' : ''}</option>)}
          </select>
        </div>
      </div>

      {activeSports.length === 0 && <p className="text-center text-slate-400 py-12">No games this week.</p>}

      <div className="space-y-6">
        {activeSports.map(sport => {
          const games = weekMatchups.filter(m => m.sport === sport)
          const meta = sportMeta(sport)
          return (
            <div key={sport} className="card">
              <div className="card-header flex items-center gap-2">
                <span className={`w-7 h-7 rounded-lg ${meta.bg} text-white flex items-center justify-center`}>{meta.emoji}</span>
                <h2 className="font-semibold text-slate-900">{sport}</h2>
                <span className="text-xs text-slate-400">{games.length} games</span>
              </div>
              <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 divide-slate-50">
                {games.map(m => {
                  const home = teamById[m.homeTeamId], away = m.awayTeamId ? teamById[m.awayTeamId] : null
                  const homeWin = m.homeScore >= m.awayScore
                  return (
                    <div key={m.id} className="p-4 border-slate-50 sm:border sm:m-1.5 sm:rounded-xl">
                      <div className={`flex items-center justify-between text-sm ${m.isComplete && homeWin ? 'font-bold text-slate-900' : 'text-slate-700'}`}>
                        <span className="truncate">{home?.name ?? '—'}</span>
                        <span>{m.homeScore?.toFixed(1)}</span>
                      </div>
                      <div className={`flex items-center justify-between text-sm mt-1 ${m.isComplete && !homeWin ? 'font-bold text-slate-900' : 'text-slate-700'}`}>
                        <span className="truncate">{away?.name ?? 'BYE'}</span>
                        <span>{m.awayScore?.toFixed(1)}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1.5">{m.isComplete ? 'Final' : 'Live'}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
