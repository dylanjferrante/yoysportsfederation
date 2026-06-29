'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

type Team = { id: string; name: string; abbreviation: string }
type Matchup = { id: string; sport: string; week: number; season: string | null; homeTeamId: string; awayTeamId: string | null; homeScore: number; awayScore: number; isComplete: boolean }

export default function CommishSchedule() {
  const params = useParams<{ id: string }>()
  const { data: session } = useSession()
  const [league, setLeague] = useState<any>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [matchups, setMatchups] = useState<Matchup[]>([])
  const [week, setWeek] = useState<number | null>(null)
  const [freqSport, setFreqSport] = useState('NFL')
  const [busy, setBusy] = useState(false)

  const load = () => fetch(`/api/leagues/${params.id}`).then(r => r.json()).then(d => {
    setLeague(d.league)
    setTeams((d.teams ?? []).map((t: any) => ({ id: t.team.id, name: t.team.name, abbreviation: t.team.abbreviation })))
    setMatchups((d.matchups ?? []).filter((m: Matchup) => m.season === d.league.season))
  })
  useEffect(() => { load() }, [params.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const teamById = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t])), [teams])
  const sportsEnabled: string[] = useMemo(() => { try { return JSON.parse(league?.sportsEnabled ?? '[]') } catch { return [] } }, [league])
  const weeks = useMemo(() => [...new Set(matchups.map(m => m.week))].sort((a, b) => a - b), [matchups])
  const activeWeek = week ?? weeks[0] ?? 1
  const weekGames = matchups.filter(m => m.week === activeWeek)
  const weekSports = sportsEnabled.filter(s => weekGames.some(m => m.sport === s))

  if (!league) return <div className="text-center py-20 text-slate-400">Loading…</div>
  if (session?.user?.id !== league.commissionerId)
    return <div className="max-w-2xl mx-auto px-4 py-16 text-center text-slate-500">Only the commissioner can edit the schedule.</div>

  async function patch(payload: any) {
    setBusy(true)
    await fetch(`/api/leagues/${params.id}/matchups`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setBusy(false); await load()
  }
  const setM = (id: string, patch: Partial<Matchup>) => setMatchups(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))

  // Frequency matrix for the selected sport: counts[a][b] = matchups between a & b.
  const freq = useMemo(() => {
    const c: Record<string, Record<string, number>> = {}
    for (const t of teams) { c[t.id] = {}; for (const o of teams) c[t.id][o.id] = 0 }
    for (const m of matchups) {
      if (m.sport !== freqSport || !m.awayTeamId) continue
      if (c[m.homeTeamId]?.[m.awayTeamId] != null) { c[m.homeTeamId][m.awayTeamId]++; c[m.awayTeamId][m.homeTeamId]++ }
    }
    return c
  }, [matchups, teams, freqSport])

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-5">
        <Link href={`/leagues/${params.id}`} className="btn-ghost text-slate-500">← League</Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Schedule Editor</h1>
          <p className="text-sm text-slate-500">{league.name} · edit matchups & override results</p>
        </div>
      </div>

      {/* Week selector */}
      <div className="card p-3 mb-4 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-slate-700">Week</span>
        <select className="select w-28" value={activeWeek} onChange={e => setWeek(+e.target.value)}>
          {weeks.map(w => <option key={w} value={w}>Week {w}</option>)}
        </select>
        {weekSports.length > 1 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-500">Copy pairings:</span>
            {weekSports.map(s => (
              <button key={s} disabled={busy} onClick={() => patch({ action: 'COPY_WEEK_PAIRINGS', week: activeWeek, fromSport: s })}
                className={`text-xs px-2 py-1 rounded font-medium ${sportMeta(s).light}`}>{s} → all</button>
            ))}
          </div>
        )}
      </div>

      {/* Matchups for the week, grouped by sport */}
      <div className="space-y-4 mb-8">
        {weekSports.map(sport => {
          const meta = sportMeta(sport)
          return (
            <div key={sport} className="card overflow-hidden">
              <div className="card-header"><h2 className="font-semibold text-slate-900">{meta.emoji} {sport} · Week {activeWeek}</h2></div>
              <div className="divide-y divide-slate-50">
                {weekGames.filter(m => m.sport === sport).map(m => (
                  <div key={m.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                    <select className="select w-40 py-1" value={m.homeTeamId} onChange={e => setM(m.id, { homeTeamId: e.target.value })}>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <input type="number" step="0.1" className="input w-20 py-1 text-right" value={m.homeScore ?? 0} onChange={e => setM(m.id, { homeScore: +e.target.value })} />
                    <span className="text-slate-300">vs</span>
                    <input type="number" step="0.1" className="input w-20 py-1 text-right" value={m.awayScore ?? 0} onChange={e => setM(m.id, { awayScore: +e.target.value })} />
                    <select className="select w-40 py-1" value={m.awayTeamId ?? ''} onChange={e => setM(m.id, { awayTeamId: e.target.value || null })}>
                      <option value="">BYE</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <label className="text-xs text-slate-500 flex items-center gap-1"><input type="checkbox" checked={m.isComplete} onChange={e => setM(m.id, { isComplete: e.target.checked })} /> Final</label>
                    <button disabled={busy} onClick={() => patch({ action: 'UPDATE', matchupId: m.id, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeScore: m.homeScore, awayScore: m.awayScore, isComplete: m.isComplete })}
                      className="btn-secondary text-xs ml-auto">Save</button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        {weekSports.length === 0 && <p className="text-center text-slate-400 py-10">No matchups this week.</p>}
      </div>

      {/* Matchup-frequency table */}
      <div className="card overflow-x-auto">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Matchups vs Opponent</h2>
          <div className="flex gap-1.5">
            {sportsEnabled.map(s => (
              <button key={s} onClick={() => setFreqSport(s)} className={`px-2.5 py-1 rounded-full text-xs font-semibold ${freqSport === s ? `${sportMeta(s).bg} text-white` : 'bg-slate-100 text-slate-600'}`}>{sportMeta(s).emoji} {s}</button>
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
                {teams.map(col => col.id === row.id
                  ? <td key={col.id} className="px-2 py-2 text-center bg-slate-50 text-slate-300">—</td>
                  : <td key={col.id} className={`px-2 py-2 text-center ${(freq[row.id]?.[col.id] ?? 0) === 0 ? 'text-slate-300' : 'text-slate-700 font-medium'}`}>{freq[row.id]?.[col.id] ?? 0}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
