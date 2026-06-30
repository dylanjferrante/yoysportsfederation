'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { sportMeta, sportLabel, sportAbbrLabel } from '@/lib/utils'
import { computeFederationStandings, type FederationScoring } from '@/lib/federation'
import SportChip from '@/components/SportChip'

type TeamLite = { id: string; name: string; abbreviation: string; logo: string | null; owner: string | null; primaryColor?: string | null; secondaryColor?: string | null; division?: number | null }
type TeamStat = { allTime: { w: number; l: number; t: number }; fedTitles: number; sportTitles: number }
type TeamRec = { teamId: string; sport: string; wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number; finishPosition: number | null; isChampion: boolean }
type Matchup = { id: string; sport: string; week: number; homeTeamId: string; awayTeamId: string | null; homeScore: number; awayScore: number; isComplete: boolean }
type ColorMap = Record<string, { p?: string; s?: string }>

export default function LeagueTabs({
  leagueId, sportsEnabled, teams, records, matchups, federationScoring, rosterSettings, playoffTeams = 6, divisions = 0, divisionNames = {}, currentUserId, teamStats = {}, sportNames = {}, sportAbbr = {}, divisionLogos = {}, divisionLogoBg = {}, championshipColors = {},
}: {
  leagueId: string
  sportsEnabled: string[]
  teams: TeamLite[]
  records: TeamRec[]
  matchups: Matchup[]
  federationScoring: FederationScoring
  rosterSettings: Record<string, never> | Record<string, Record<string, number>>
  playoffTeams?: number
  divisions?: number
  divisionNames?: Record<string, string>
  currentUserId?: string
  teamStats?: Record<string, TeamStat>
  sportNames?: Record<string, string>
  sportAbbr?: Record<string, string>
  divisionLogos?: Record<string, string>
  divisionLogoBg?: Record<string, boolean>
  championshipColors?: Record<string, { p?: string; s?: string }>
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

  // Combined cross-sport power ranking — separate from federation points. Each sport's
  // power = win% (62%) + scoring relative to that sport's leader (38%); a franchise's
  // league power is the average across the counted sports. A projection of overall strength.
  const power = useMemo(() => {
    const maxPF: Record<string, number> = {}
    for (const r of records) if (included.has(r.sport)) maxPF[r.sport] = Math.max(maxPF[r.sport] ?? 1, r.pointsFor ?? 0)
    const byTeam: Record<string, { sum: number; n: number; perSport: Record<string, number> }> = {}
    for (const r of records) {
      if (!included.has(r.sport)) continue
      const gp = (r.wins ?? 0) + (r.losses ?? 0) + (r.ties ?? 0)
      const winPct = gp ? ((r.wins ?? 0) + 0.5 * (r.ties ?? 0)) / gp : 0
      const p = Math.round(winPct * 100 * 0.62 + ((r.pointsFor ?? 0) / (maxPF[r.sport] || 1)) * 100 * 0.38)
      const t = (byTeam[r.teamId] ??= { sum: 0, n: 0, perSport: {} })
      t.sum += p; t.n++; t.perSport[r.sport] = p
    }
    return teams
      .map(t => { const b = byTeam[t.id]; return { team: t, power: b && b.n ? Math.round(b.sum / b.n) : 0, perSport: b?.perSport ?? {} } })
      .sort((a, b) => b.power - a.power)
  }, [records, teams, included])

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
          <button key={s} onClick={() => setTab(s)} className={`inline-flex items-center gap-1.5 ${tab === s ? 'tab-active' : 'tab-inactive'}`}>
            <SportChip sport={s} logos={divisionLogos} colors={championshipColors} chip={20} size={14} />{sportAbbrLabel(s, sportAbbr)}
          </button>
        ))}
      </div>

      {tab === 'OVERALL'
        ? <Overall standings={standings} power={power} sportsEnabled={sportsEnabled} sportNames={sportNames} sportAbbr={sportAbbr} divisionLogos={divisionLogos} championshipColors={championshipColors} included={included} toggle={toggle} teamById={teamById} currentUserId={currentUserId} fed={federationScoring} divisions={divisions} divisionNames={divisionNames} />
        : <SportView sport={tab} sportNames={sportNames} sportAbbr={sportAbbr} divisionLogos={divisionLogos} championshipColors={championshipColors} teams={teams} teamById={teamById} records={records.filter(r => r.sport === tab)} matchups={matchups.filter(m => m.sport === tab)} rosterSettings={(rosterSettings as any)[tab] ?? {}} playoffTeams={playoffTeams} currentUserId={currentUserId} divisions={divisions} divisionNames={divisionNames} />}
    </div>
  )
}

// Division label (custom name from settings, else "Division N").
const divLabel = (idx: number, names: Record<string, string>) => names[String(idx)]?.trim() || `Division ${idx}`

function Overall({ standings, power = [], sportsEnabled, sportNames = {}, sportAbbr = {}, divisionLogos = {}, championshipColors = {}, included, toggle, teamById, currentUserId, fed, divisions = 0, divisionNames = {} }: any) {
  const countedSports = sportsEnabled.filter((s: string) => included.has(s))
  // When divisions are enabled, the federation standings split into divisions
  // (re-ranked within each) on top of the league-wide overall table below.
  const divGroups = divisions > 0
    ? Array.from({ length: divisions }, (_, i) => i + 1)
        .map(d => ({ d, rows: standings.filter((row: any) => teamById[row.team.id]?.division === d) }))
        .filter(g => g.rows.length)
    : []
  return (
    <div className="space-y-4">
      {divGroups.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {divGroups.map(({ d, rows }) => (
            <div key={d} className="card overflow-x-auto">
              <div className="card-header"><h2 className="font-semibold text-slate-900">{divLabel(d, divisionNames)}</h2></div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-3 py-2 font-medium">#</th>
                    <th className="text-left px-2 py-2 font-medium">Franchise</th>
                    {countedSports.map((s: string) => (
                      <th key={s} className="text-center px-1.5 py-2 font-medium hidden sm:table-cell"><SportChip sport={s} logos={divisionLogos} colors={championshipColors} chip={18} size={12} /></th>
                    ))}
                    <th className="text-center px-3 py-2 font-medium">Fed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((row: any, i: number) => {
                    const t = teamById[row.team.id]
                    return (
                      <tr key={row.team.id} className={`hover:bg-slate-50 ${i === 0 ? 'bg-amber-50/40' : ''}`}>
                        <td className="px-3 py-2 text-slate-400 font-medium">{i + 1}</td>
                        <td className="px-2 py-2">
                          <Link href={`/teams/${row.team.id}`} className="flex items-center gap-2 group">
                            <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600">{t?.abbreviation}</span>
                            <span className="font-medium text-slate-900 group-hover:text-blue-600 truncate">{t?.name}</span>
                          </Link>
                        </td>
                        {countedSports.map((s: string) => (
                          <td key={s} className="text-center px-1.5 py-2 text-slate-500 tabular-nums hidden sm:table-cell">{row.perSport[s] ?? '—'}</td>
                        ))}
                        <td className="text-center px-3 py-2 font-bold text-slate-900">{row.total}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-slate-700">Count sports:</span>
        {sportsEnabled.map((s: string) => (
          <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={included.has(s)} onChange={() => toggle(s)} className="w-4 h-4" />
            <span className="inline-flex items-center gap-1.5"><SportChip sport={s} logos={divisionLogos} colors={championshipColors} chip={20} size={14} />{sportAbbrLabel(s, sportAbbr)}</span>
          </label>
        ))}
        <span className="text-xs text-slate-400 ml-auto">
          Champion bonus +{fed.championBonus} · placement {fed.placement?.[0] ?? '—'} → 1
        </span>
      </div>

      <div className="card overflow-x-auto">
        {divisions > 0 && <div className="card-header"><h2 className="font-semibold text-slate-900">Overall Federation Standings</h2></div>}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 font-medium">#</th>
              <th className="text-left px-2 py-3 font-medium">Franchise</th>
              {sportsEnabled.filter((s: string) => included.has(s)).map((s: string) => (
                <th key={s} className="text-center px-2 py-3 font-medium"><SportChip sport={s} logos={divisionLogos} colors={championshipColors} chip={22} size={16} /></th>
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
                    {i + 1}
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

      {/* Combined cross-sport power ranking — a projection of overall strength, not titles. */}
      <div className="card overflow-x-auto">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">⚡ League Power Rankings</h2>
          <span className="text-xs text-slate-400">combined strength across counted sports</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2.5 font-medium">#</th>
              <th className="text-left px-2 py-2.5 font-medium">Franchise</th>
              {sportsEnabled.filter((s: string) => included.has(s)).map((s: string) => (
                <th key={s} className="text-center px-2 py-2.5 font-medium hidden sm:table-cell"><SportChip sport={s} logos={divisionLogos} colors={championshipColors} chip={22} size={16} /></th>
              ))}
              <th className="text-right px-4 py-2.5 font-medium">Power</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {power.map((row: any, i: number) => {
              const t = teamById[row.team.id]
              const max = power[0]?.power || 1
              return (
                <tr key={row.team.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-400 font-medium">{i + 1}</td>
                  <td className="px-2 py-2.5">
                    <Link href={`/teams/${row.team.id}`} className="flex items-center gap-2 group">
                      <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600">{t?.abbreviation}</span>
                      <span className="font-medium text-slate-900 group-hover:text-blue-600 truncate">{t?.name}</span>
                    </Link>
                  </td>
                  {sportsEnabled.filter((s: string) => included.has(s)).map((s: string) => (
                    <td key={s} className="text-center px-2 py-2.5 text-slate-500 tabular-nums hidden sm:table-cell">{row.perSport[s] ?? '—'}</td>
                  ))}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <span className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden hidden md:block"><span className="block h-full bg-slate-800" style={{ width: `${(row.power / max) * 100}%` }} /></span>
                      <span className="tabular-nums font-bold text-slate-900 w-8 text-right">{row.power}</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-50">A projection of overall strength (win % + scoring) averaged across the counted sports — independent of federation points.</p>
      </div>
    </div>
  )
}

function SportView({ sport, sportNames = {}, sportAbbr = {}, divisionLogos = {}, championshipColors = {}, teamById, records, matchups, rosterSettings, playoffTeams = 6, currentUserId, divisions = 0, divisionNames = {} }: any) {
  const meta = sportMeta(sport)
  const ranked = [...records].sort((a: TeamRec, b: TeamRec) =>
    (a.finishPosition ?? 99) - (b.finishPosition ?? 99) || b.wins - a.wins || b.pointsFor - a.pointsFor)

  // When divisions are enabled, split this sport's standings by division (re-ranked
  // within each) above the league-wide overall table.
  const divGroups = divisions > 0
    ? Array.from({ length: divisions }, (_, i) => i + 1)
        .map(d => ({ d, rows: ranked.filter((r: TeamRec) => teamById[r.teamId]?.division === d) }))
        .filter(g => g.rows.length)
    : []

  // Current week = lowest week not yet complete (else latest).
  const incomplete = matchups.filter((m: Matchup) => !m.isComplete)
  const week = incomplete.length ? Math.min(...incomplete.map((m: Matchup) => m.week)) : (matchups.length ? Math.max(...matchups.map((m: Matchup) => m.week)) : 0)
  const weekMatchups = matchups.filter((m: Matchup) => m.week === week)

  // ── Analytics: streak, last-5, power rating, playoff odds, top weekly score ──
  const analytics = useMemo(() => {
    const done = matchups.filter((m: Matchup) => m.isComplete && m.awayTeamId)
      .sort((a: Matchup, b: Matchup) => a.week - b.week)
    const byTeam: Record<string, { res: ('W' | 'L' | 'T')[]; remaining: number }> = {}
    for (const r of records) byTeam[r.teamId] = { res: [], remaining: 0 }
    for (const m of matchups) {
      if (m.isComplete && m.awayTeamId) continue
      if (byTeam[m.homeTeamId]) byTeam[m.homeTeamId].remaining++
      if (m.awayTeamId && byTeam[m.awayTeamId]) byTeam[m.awayTeamId].remaining++
    }
    for (const m of done) {
      const hw = (m.homeScore ?? 0) > (m.awayScore ?? 0), aw = (m.awayScore ?? 0) > (m.homeScore ?? 0)
      if (byTeam[m.homeTeamId]) byTeam[m.homeTeamId].res.push(hw ? 'W' : aw ? 'L' : 'T')
      if (m.awayTeamId && byTeam[m.awayTeamId]) byTeam[m.awayTeamId].res.push(aw ? 'W' : hw ? 'L' : 'T')
    }
    const maxPF = Math.max(1, ...records.map((r: TeamRec) => r.pointsFor ?? 0))
    const order = [...records].sort((a: TeamRec, b: TeamRec) => b.wins - a.wins || b.pointsFor - a.pointsFor)
    const out: Record<string, { streak: string; last5: ('W'|'L'|'T')[]; power: number; odds: number }> = {}
    for (const r of records) {
      const res = byTeam[r.teamId]?.res ?? []
      const last = res[res.length - 1]
      let n = 0; for (let i = res.length - 1; i >= 0 && res[i] === last; i--) n++
      const streak = last ? `${last}${n}` : '—'
      const gp = (r.wins ?? 0) + (r.losses ?? 0) + (r.ties ?? 0)
      const winPct = gp ? ((r.wins ?? 0) + 0.5 * (r.ties ?? 0)) / gp : 0
      const power = Math.round(winPct * 100 * 0.62 + ((r.pointsFor ?? 0) / maxPF) * 100 * 0.38)
      const rank = order.findIndex((o: TeamRec) => o.teamId === r.teamId)
      const remaining = byTeam[r.teamId]?.remaining ?? 0
      const conf = Math.max(0.4, gp / (gp + remaining || 1))
      let odds = 100 / (1 + Math.exp(-(playoffTeams - rank - 0.5)))
      odds = Math.round(50 + (odds - 50) * conf)
      out[r.teamId] = { streak, last5: res.slice(-5), power, odds }
    }
    // Top single-week team score this season.
    let top: { teamId: string; score: number; week: number } | null = null
    for (const m of done) {
      for (const [tid, sc] of [[m.homeTeamId, m.homeScore], [m.awayTeamId, m.awayScore]] as const) {
        if (tid && (sc ?? 0) > (top?.score ?? -1)) top = { teamId: tid, score: sc ?? 0, week: m.week }
      }
    }
    return { byTeamId: out, top }
  }, [matchups, records, playoffTeams])

  const powerOrder = [...records].sort((a: TeamRec, b: TeamRec) => (analytics.byTeamId[b.teamId]?.power ?? 0) - (analytics.byTeamId[a.teamId]?.power ?? 0))

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        {divGroups.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-4">
            {divGroups.map(({ d, rows }: any) => (
              <div key={d} className="card overflow-x-auto">
                <div className="card-header"><h2 className="font-semibold text-slate-900">{divLabel(d, divisionNames)}</h2></div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                      <th className="text-left px-3 py-2 font-semibold">#</th>
                      <th className="text-left px-2 py-2 font-semibold">Franchise</th>
                      <th className="text-center px-2 py-2 font-semibold">W</th>
                      <th className="text-center px-2 py-2 font-semibold">L</th>
                      <th className="text-center px-1.5 py-2 font-semibold">Pct</th>
                      <th className="text-right px-3 py-2 font-semibold">PF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.map((r: TeamRec, i: number) => {
                      const t = teamById[r.teamId]
                      const gp = (r.wins ?? 0) + (r.losses ?? 0) + (r.ties ?? 0)
                      const pct = gp ? (((r.wins ?? 0) + 0.5 * (r.ties ?? 0)) / gp).toFixed(3).replace(/^0/, '') : '—'
                      return (
                        <tr key={r.teamId} className={`hover:bg-slate-50 ${i === 0 ? 'bg-amber-50/40' : ''}`}>
                          <td className="px-3 py-2 font-medium text-slate-400">{i + 1}</td>
                          <td className="px-2 py-2">
                            <Link href={`/teams/${r.teamId}`} className="flex items-center gap-2 group">
                              <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600">{t?.abbreviation}</span>
                              <span className="font-medium text-slate-900 group-hover:text-blue-600 truncate">{t?.name}</span>
                            </Link>
                          </td>
                          <td className="text-center px-2 py-2 font-semibold tabular-nums">{r.wins}</td>
                          <td className="text-center px-2 py-2 text-slate-500 tabular-nums">{r.losses}</td>
                          <td className="text-center px-1.5 py-2 text-slate-500 tabular-nums">{pct}</td>
                          <td className="text-right px-3 py-2 text-slate-700 tabular-nums">{r.pointsFor?.toFixed(0)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
        <div className="card overflow-x-auto">
          <div className="card-header"><h2 className="font-semibold text-slate-900 flex items-center gap-2"><SportChip sport={sport} logos={divisionLogos} colors={championshipColors} chip={24} size={16} /> {sportLabel(sport, sportNames)} {divGroups.length > 0 ? 'Overall ' : ''}Standings</h2></div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="text-left px-3 py-2 font-semibold">#</th>
                <th className="text-left px-2 py-2 font-semibold">Franchise</th>
                <th className="text-center px-2 py-2 font-semibold">W</th>
                <th className="text-center px-2 py-2 font-semibold">L</th>
                <th className="text-center px-1.5 py-2 font-semibold">Pct</th>
                <th className="text-center px-1.5 py-2 font-semibold hidden sm:table-cell">Strk</th>
                <th className="text-center px-2 py-2 font-semibold hidden md:table-cell">Last 5</th>
                <th className="text-right px-2 py-2 font-semibold hidden sm:table-cell">PF</th>
                <th className="text-right px-2 py-2 font-semibold hidden md:table-cell">PA</th>
                <th className="text-right px-3 py-2 font-semibold">Odds</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ranked.map((r: TeamRec, i: number) => {
                const t = teamById[r.teamId]
                const a = analytics.byTeamId[r.teamId]
                const gp = (r.wins ?? 0) + (r.losses ?? 0) + (r.ties ?? 0)
                const pct = gp ? (((r.wins ?? 0) + 0.5 * (r.ties ?? 0)) / gp).toFixed(3).replace(/^0/, '') : '—'
                const inPlayoffs = i < playoffTeams
                return (
                  <tr key={r.teamId} className={`hover:bg-slate-50 ${inPlayoffs ? '' : ''}`}>
                    <td className="px-3 py-2.5 font-medium">
                      <span className={inPlayoffs ? 'text-green-600' : 'text-slate-300'}>{i + 1}</span>
                    </td>
                    <td className="px-2 py-2.5">
                      <Link href={`/teams/${r.teamId}`} className="flex items-center gap-2 group">
                        <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600">{t?.abbreviation}</span>
                        <span className="font-medium text-slate-900 group-hover:text-blue-600 truncate">{t?.name}</span>
                      </Link>
                    </td>
                    <td className="text-center px-2 py-2.5 font-semibold tabular-nums">{r.wins}</td>
                    <td className="text-center px-2 py-2.5 text-slate-500 tabular-nums">{r.losses}</td>
                    <td className="text-center px-1.5 py-2.5 text-slate-500 tabular-nums">{pct}</td>
                    <td className="text-center px-1.5 py-2.5 tabular-nums text-xs font-semibold hidden sm:table-cell">
                      <span className={a?.streak?.startsWith('W') ? 'text-green-600' : a?.streak?.startsWith('L') ? 'text-red-500' : 'text-slate-400'}>{a?.streak ?? '—'}</span>
                    </td>
                    <td className="text-center px-2 py-2.5 hidden md:table-cell">
                      <span className="inline-flex gap-0.5">
                        {(a?.last5 ?? []).map((x: string, k: number) => (
                          <span key={k} className={`w-3.5 h-3.5 rounded-sm text-[8px] font-bold text-white flex items-center justify-center ${x === 'W' ? 'bg-green-500' : x === 'L' ? 'bg-red-400' : 'bg-slate-300'}`}>{x}</span>
                        ))}
                      </span>
                    </td>
                    <td className="text-right px-2 py-2.5 text-slate-700 tabular-nums hidden sm:table-cell">{r.pointsFor?.toFixed(0)}</td>
                    <td className="text-right px-2 py-2.5 text-slate-400 tabular-nums hidden md:table-cell">{r.pointsAgainst?.toFixed(0)}</td>
                    <td className="text-right px-3 py-2.5 tabular-nums font-semibold" style={{ color: (a?.odds ?? 0) >= 50 ? meta.hex : undefined }}>{a ? `${a.odds}%` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-50">Top {playoffTeams} make the playoffs (green). Odds are a projection from record + scoring.</p>
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
        {/* Power rankings */}
        <div className="card">
          <div className="card-header"><h2 className="font-semibold text-slate-900">Power Rankings</h2></div>
          <div className="divide-y divide-slate-50">
            {powerOrder.map((r: TeamRec, i: number) => {
              const t = teamById[r.teamId]
              const a = analytics.byTeamId[r.teamId]
              return (
                <div key={r.teamId} className="flex items-center gap-2 px-4 py-2 text-sm">
                  <span className="w-4 text-slate-300 font-bold text-xs">{i + 1}</span>
                  <Link href={`/teams/${r.teamId}`} className="flex-1 font-medium text-slate-800 hover:text-blue-600 truncate">{t?.name}</Link>
                  <span className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden hidden sm:block"><span className="block h-full" style={{ width: `${a?.power ?? 0}%`, background: meta.hex }} /></span>
                  <span className="tabular-nums font-bold text-slate-700 w-7 text-right">{a?.power ?? '—'}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Top weekly score award */}
        {analytics.top && (
          <div className="card p-4 flex items-center gap-3">
            <span className="text-2xl">🔥</span>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Top Score · Week {analytics.top.week}</p>
              <p className="text-sm"><Link href={`/teams/${analytics.top.teamId}`} className="font-semibold text-slate-900 hover:text-blue-600">{teamById[analytics.top.teamId]?.name}</Link> <span className="font-bold tabular-nums" style={{ color: meta.hex }}>{analytics.top.score.toFixed(1)}</span></p>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header"><h2 className="font-semibold text-slate-900">{sportLabel(sport, sportNames)} Roster Slots</h2></div>
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

