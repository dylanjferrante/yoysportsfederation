'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'
import { computeFederationStandings, type FederationScoring } from '@/lib/federation'

type TeamLite = { id: string; name: string; abbreviation: string; logo: string | null; owner: string | null }
type TeamRec = { teamId: string; sport: string; wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number; finishPosition: number | null; isChampion: boolean }
type Matchup = { id: string; sport: string; week: number; homeTeamId: string; awayTeamId: string | null; homeScore: number; awayScore: number; isComplete: boolean }

export default function LeagueTabs({
  leagueId, sportsEnabled, teams, records, matchups, federationScoring, rosterSettings, currentUserId,
}: {
  leagueId: string
  sportsEnabled: string[]
  teams: TeamLite[]
  records: TeamRec[]
  matchups: Matchup[]
  federationScoring: FederationScoring
  rosterSettings: Record<string, never> | Record<string, Record<string, number>>
  currentUserId?: string
}) {
  const [tab, setTab] = useState<string>('OVERALL')
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set((federationScoring.includedSports ?? sportsEnabled).filter(s => sportsEnabled.includes(s)))
  )

  const teamById = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t])), [teams])

  const standings = useMemo(() => computeFederationStandings(
    teams,
    records.map(r => ({ teamId: r.teamId, sport: r.sport, finishPosition: r.finishPosition, isChampion: r.isChampion })),
    federationScoring,
    [...included],
  ), [teams, records, federationScoring, included])

  function toggle(sport: string) {
    setIncluded(prev => {
      const next = new Set(prev)
      next.has(sport) ? next.delete(sport) : next.add(sport)
      return next
    })
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-5 overflow-x-auto">
        <button onClick={() => setTab('OVERALL')} className={tab === 'OVERALL' ? 'tab-active' : 'tab-inactive'}>
          🏆 Overall
        </button>
        {sportsEnabled.map(s => (
          <button key={s} onClick={() => setTab(s)} className={tab === s ? 'tab-active' : 'tab-inactive'}>
            {sportMeta(s).emoji} {s}
          </button>
        ))}
      </div>

      {tab === 'OVERALL'
        ? <Overall standings={standings} sportsEnabled={sportsEnabled} included={included} toggle={toggle} teamById={teamById} currentUserId={currentUserId} fed={federationScoring} />
        : <SportView sport={tab} teams={teams} teamById={teamById} records={records.filter(r => r.sport === tab)} matchups={matchups.filter(m => m.sport === tab)} rosterSettings={(rosterSettings as any)[tab] ?? {}} currentUserId={currentUserId} />}
    </div>
  )
}

function Overall({ standings, sportsEnabled, included, toggle, teamById, currentUserId, fed }: any) {
  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-slate-700">Count sports:</span>
        {sportsEnabled.map((s: string) => (
          <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={included.has(s)} onChange={() => toggle(s)} className="w-4 h-4" />
            <span>{sportMeta(s).emoji} {s}</span>
          </label>
        ))}
        <span className="text-xs text-slate-400 ml-auto">
          Champion bonus +{fed.championBonus} · placement {fed.placement?.[0] ?? '—'} → 1
        </span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 font-medium">#</th>
              <th className="text-left px-2 py-3 font-medium">Franchise</th>
              {sportsEnabled.filter((s: string) => included.has(s)).map((s: string) => (
                <th key={s} className="text-center px-2 py-3 font-medium">{sportMeta(s).emoji}</th>
              ))}
              <th className="text-center px-4 py-3 font-medium">Fed Pts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {standings.map((row: any, i: number) => {
              const t = teamById[row.team.id]
              const isMe = false
              return (
                <tr key={row.team.id} className={`hover:bg-slate-50 ${i === 0 ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-4 py-3 text-slate-400 font-medium">
                    {i === 0 ? '👑' : i + 1}
                  </td>
                  <td className="px-2 py-3">
                    <Link href={`/teams/${row.team.id}`} className="flex items-center gap-2 group">
                      <span className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">{t?.abbreviation}</span>
                      <span>
                        <span className="font-medium text-slate-900 group-hover:text-blue-600">{t?.name}</span>
                        <span className="block text-xs text-slate-400">{t?.owner}</span>
                      </span>
                    </Link>
                  </td>
                  {sportsEnabled.filter((s: string) => included.has(s)).map((s: string) => (
                    <td key={s} className="text-center px-2 py-3 text-slate-600">{row.perSport[s] ?? '—'}</td>
                  ))}
                  <td className="text-center px-4 py-3 font-bold text-slate-900 text-base">{row.total}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 px-1">
        Federation points are awarded by where each franchise finishes in every counted sport. Toggle sports above to see the standings with or without them.
      </p>
    </div>
  )
}

function SportView({ sport, teamById, records, matchups, rosterSettings, currentUserId }: any) {
  const meta = sportMeta(sport)
  const ranked = [...records].sort((a: TeamRec, b: TeamRec) =>
    (a.finishPosition ?? 99) - (b.finishPosition ?? 99) || b.wins - a.wins || b.pointsFor - a.pointsFor)

  // Current week = lowest week not yet complete (else latest).
  const incomplete = matchups.filter((m: Matchup) => !m.isComplete)
  const week = incomplete.length ? Math.min(...incomplete.map((m: Matchup) => m.week)) : (matchups.length ? Math.max(...matchups.map((m: Matchup) => m.week)) : 0)
  const weekMatchups = matchups.filter((m: Matchup) => m.week === week)

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="card overflow-x-auto">
          <div className="card-header"><h2 className="font-semibold text-slate-900">{meta.emoji} {sport} Standings</h2></div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-100">
                <th className="text-left px-4 py-2 font-medium">#</th>
                <th className="text-left px-2 py-2 font-medium">Franchise</th>
                <th className="text-center px-2 py-2 font-medium">W</th>
                <th className="text-center px-2 py-2 font-medium">L</th>
                <th className="text-center px-2 py-2 font-medium">PF</th>
                <th className="text-center px-2 py-2 font-medium">PA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ranked.map((r: TeamRec, i: number) => {
                const t = teamById[r.teamId]
                return (
                  <tr key={r.teamId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-400 font-medium">{i + 1}</td>
                    <td className="px-2 py-3">
                      <Link href={`/teams/${r.teamId}`} className="flex items-center gap-2 group">
                        <span className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">{t?.abbreviation}</span>
                        <span className="font-medium text-slate-900 group-hover:text-blue-600">{t?.name}</span>
                      </Link>
                    </td>
                    <td className="text-center px-2 py-3 font-semibold">{r.wins}</td>
                    <td className="text-center px-2 py-3 text-slate-500">{r.losses}</td>
                    <td className="text-center px-2 py-3 text-slate-700">{r.pointsFor?.toFixed(1)}</td>
                    <td className="text-center px-2 py-3 text-slate-400">{r.pointsAgainst?.toFixed(1)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {weekMatchups.length > 0 && (
          <div className="card">
            <div className="card-header"><h2 className="font-semibold text-slate-900">Week {week} Matchups</h2></div>
            <div className="divide-y divide-slate-50">
              {weekMatchups.map((m: Matchup) => {
                const home = teamById[m.homeTeamId], away = m.awayTeamId ? teamById[m.awayTeamId] : null
                return (
                  <div key={m.id} className="px-6 py-3 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-900 flex-1 truncate">{home?.name ?? '—'}</span>
                    <span className="text-center px-3">
                      <span className="font-bold text-slate-900">{m.homeScore?.toFixed(1)} – {m.awayScore?.toFixed(1)}</span>
                      <span className="block text-[10px] text-slate-400">{m.isComplete ? 'Final' : 'Live'}</span>
                    </span>
                    <span className="font-medium text-slate-900 flex-1 text-right truncate">{away?.name ?? 'BYE'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="card">
          <div className="card-header"><h2 className="font-semibold text-slate-900">{sport} Roster Slots</h2></div>
          <div className="card-body space-y-1 text-sm">
            {Object.entries(rosterSettings).length === 0
              ? <p className="text-slate-400">No roster configured.</p>
              : Object.entries(rosterSettings).map(([pos, n]) => (
                <div key={pos} className="flex justify-between">
                  <span className="text-slate-500">{pos}</span>
                  <span className="font-medium">{String(n)}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}
