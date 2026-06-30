'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { sportMeta, sportLabel } from '@/lib/utils'
import { formatWeekRange, sportWeekOf, type ScheduleEntry } from '@/lib/defaults'

type Matchup = { id: string; sport: string; season: string | null; week: number; homeTeamId: string; awayTeamId: string | null; homeScore: number; awayScore: number; isComplete: boolean }
type Team = { id: string; name: string; abbreviation: string; logo?: string | null; primaryColor?: string | null; secondaryColor?: string | null; logoBg?: boolean | null }
type Rec = { teamId: string; sport: string; wins: number; losses: number; ties: number }

export default function ScoresView({ leagueId, matchups, teams, sportsEnabled, currentSeason, sportNames = {}, schedule = [], records = [] }: {
  leagueId: string; matchups: Matchup[]; teams: Team[]; sportsEnabled: string[]; currentSeason: string; sportNames?: Record<string, string>; schedule?: ScheduleEntry[]; records?: Rec[]; isCommish?: boolean
}) {
  const teamById = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t])), [teams])
  const recBy = useMemo(() => {
    const m: Record<string, string> = {}
    for (const r of records) m[`${r.teamId}:${r.sport}`] = `${r.wins ?? 0}-${r.losses ?? 0}${(r.ties ?? 0) ? `-${r.ties}` : ''}`
    return m
  }, [records])
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
          <span className="text-center leading-tight">
            <span className="block font-semibold text-slate-900">Week {activeWeek}</span>
            <span className="block text-[11px] text-slate-400">{formatWeekRange(season, activeWeek)}</span>
          </span>
          <button onClick={() => setWeek(weeks[Math.min(weeks.length - 1, idx + 1)])} disabled={idx >= weeks.length - 1} className="btn-secondary text-sm disabled:opacity-40">Next →</button>
        </div>
        <button onClick={() => setWeek(defaultWeek)} className="btn-ghost text-sm">Current week</button>
        <div className="ml-auto flex items-center gap-2">
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
                <h2 className="font-semibold text-slate-900">{sportLabel(sport, sportNames)}</h2>
                {(() => { const sw = sportWeekOf(schedule, sport, activeWeek); return sw ? <span className="text-xs font-medium text-slate-500">{sport} Wk {sw}</span> : null })()}
                <span className="text-xs text-slate-400">{games.length} games</span>
              </div>
              <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 divide-slate-50">
                {games.map(m => {
                  const home = teamById[m.homeTeamId], away = m.awayTeamId ? teamById[m.awayTeamId] : null
                  const homeWin = m.homeScore >= m.awayScore
                  return (
                    <Link key={m.id} href={`/leagues/${leagueId}/matchup/${m.id}`} className="block sm:m-1.5 rounded-xl overflow-hidden border border-slate-100 hover:ring-2 hover:ring-slate-200 transition">
                      <TeamBar team={home} score={m.homeScore} win={m.isComplete && homeWin} rec={home ? recBy[`${home.id}:${sport}`] : null} />
                      <TeamBar team={away} score={m.awayScore} win={m.isComplete && !homeWin} rec={away ? recBy[`${away.id}:${sport}`] : null} bye={!away} />
                      <p className="text-[10px] text-slate-400 px-3 py-1 bg-white">{m.isComplete ? 'Final' : 'Live'} · box score →</p>
                    </Link>
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

// Full-width franchise bar: the team's primary→secondary gradient fills the row,
// logo + name + record on the left, score on the right (white text for contrast).
function TeamBar({ team, score, win, rec, bye }: { team: Team | null; score: number; win: boolean; rec?: string | null; bye?: boolean }) {
  if (bye || !team) return <div className="px-3 py-2.5 bg-slate-100 text-slate-400 text-sm font-medium">BYE</div>
  const primary = team.primaryColor || '#0f172a'
  const secondary = team.secondaryColor || '#3b82f6'
  const ink = { color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.45)' }
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ background: `linear-gradient(100deg, ${primary} 0%, ${secondary} 100%)` }}>
      {team.logo
        ? <img src={team.logo} alt="" className="w-8 h-8 object-contain flex-shrink-0" style={team.logoBg ? { background: primary } : undefined} />
        : <span className="w-8 h-8 flex items-center justify-center text-[10px] font-black flex-shrink-0" style={{ background: '#ffffff33', color: '#fff' }}>{(team.abbreviation || '?').slice(0, 3)}</span>}
      <div className="flex-1 min-w-0">
        <div className="font-bold truncate leading-tight" style={ink}>{team.name}{win ? ' ▸' : ''}</div>
        {rec && <div className="text-[11px] leading-tight" style={ink}>{rec}</div>}
      </div>
      <span className="tabular-nums font-black text-lg flex-shrink-0" style={ink}>{(score ?? 0).toFixed(1)}</span>
    </div>
  )
}
