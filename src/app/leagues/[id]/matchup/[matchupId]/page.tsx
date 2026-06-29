import { db } from '@/db'
import { leagues, teams, matchups, rosters, players, playerGameStats } from '@/db/schema'
import { eq, and, or, ne } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { sportMeta, safeParse } from '@/lib/utils'
import { RESERVE_SLOTS } from '@/lib/defaults'
import { boxScoreColumns } from '@/lib/scoring-categories'
import MatchupChat from './MatchupChat'

const isStarter = (slot: string) => !RESERVE_SLOTS.includes(slot)

export default async function MatchupPage({ params }: { params: Promise<{ id: string; matchupId: string }> }) {
  const { id, matchupId } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  const [m] = await db.select().from(matchups).where(eq(matchups.id, matchupId)).limit(1)
  if (!league || !m) notFound()
  const meta = sportMeta(m.sport)
  const cols = boxScoreColumns(m.sport)

  async function lineup(teamId: string | null) {
    if (!teamId) return { team: null, starters: [] as any[], bench: [] as any[], proj: 0, optimal: 0, benchPts: 0, yetToPlay: 0 }
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1)
    const rows = await db
      .select({ slot: rosters.slot, name: players.name, position: players.position, realTeam: players.realTeam, playerId: players.id, projected: players.projectedPoints, points: playerGameStats.points, stats: playerGameStats.stats })
      .from(rosters).innerJoin(players, eq(rosters.playerId, players.id))
      .leftJoin(playerGameStats, and(eq(playerGameStats.playerId, rosters.playerId), eq(playerGameStats.leagueId, id), eq(playerGameStats.season, m.season ?? league!.season), eq(playerGameStats.week, m.week)))
      .where(and(eq(rosters.teamId, teamId), eq(rosters.sport, m.sport)))
    const starters = rows.filter(r => isStarter(r.slot)).sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    const bench = rows.filter(r => !isStarter(r.slot)).sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    const proj = +starters.reduce((s, r) => s + (r.projected ?? 0), 0).toFixed(1)
    const benchPts = +bench.reduce((s, r) => s + (r.points ?? 0), 0).toFixed(1)
    // Best possible starter total from the whole roster (points left on bench).
    const optimal = +[...rows].map(r => r.points ?? 0).sort((a, b) => b - a).slice(0, starters.length).reduce((s, v) => s + v, 0).toFixed(1)
    const yetToPlay = starters.filter(r => r.points == null).length
    return { team, starters, bench, proj, optimal, benchPts, yetToPlay }
  }

  const home = await lineup(m.homeTeamId)
  const away = await lineup(m.awayTeamId)

  // Pregame win probability from projected starter totals (logistic on the spread).
  const spread = (home.proj || 0) - (away.proj || 0)
  const scale = Math.max(10, ((home.proj || 0) + (away.proj || 0)) * 0.06)
  const homeWinPct = Math.round(100 / (1 + Math.exp(-spread / scale)))

  // All-time head-to-head between these two franchises in this sport.
  let h2h: { homeW: number; awayW: number; recent: { week: number; season: string | null; hs: number; as: number; homeIsThis: boolean }[] } | null = null
  if (m.homeTeamId && m.awayTeamId) {
    const a = m.homeTeamId, b = m.awayTeamId
    const past = await db.select().from(matchups).where(and(
      eq(matchups.leagueId, id), eq(matchups.sport, m.sport), eq(matchups.isComplete, true), ne(matchups.id, m.id),
      or(and(eq(matchups.homeTeamId, a), eq(matchups.awayTeamId, b)), and(eq(matchups.homeTeamId, b), eq(matchups.awayTeamId, a))),
    ))
    let homeW = 0, awayW = 0
    for (const g of past) {
      const aScore = g.homeTeamId === a ? (g.homeScore ?? 0) : (g.awayScore ?? 0)
      const bScore = g.homeTeamId === a ? (g.awayScore ?? 0) : (g.homeScore ?? 0)
      if (aScore > bScore) homeW++; else if (bScore > aScore) awayW++
    }
    const recent = past
      .sort((x, y) => (y.season ?? '').localeCompare(x.season ?? '') || y.week - x.week)
      .slice(0, 5)
      .map(g => ({ week: g.week, season: g.season, hs: g.homeTeamId === a ? (g.homeScore ?? 0) : (g.awayScore ?? 0), as: g.homeTeamId === a ? (g.awayScore ?? 0) : (g.homeScore ?? 0), homeIsThis: true }))
    h2h = { homeW, awayW, recent }
  }

  function StatTable({ side, score }: { side: any; score: number }) {
    const Row = ({ p, dim }: { p: any; dim?: boolean }) => {
      const stats = safeParse<Record<string, number>>(p.stats ?? '{}', {})
      return (
        <tr className={dim ? 'text-slate-400' : 'hover:bg-slate-50'}>
          <td className="px-2 py-1.5 text-[11px] font-semibold text-slate-400 tabular-nums">{p.slot}</td>
          <td className="px-2 py-1.5 whitespace-nowrap">
            <Link href={`/players/${p.playerId}`} className="font-medium text-slate-800 hover:text-blue-600">{p.name}</Link>
            <span className="text-[11px] text-slate-400"> {p.position}</span>
          </td>
          {cols.map(c => <td key={c.label} className="px-2 py-1.5 text-center tabular-nums text-slate-600">{p.points == null ? '—' : (+c.get(stats).toFixed(1) || 0)}</td>)}
          <td className="px-3 py-1.5 text-right font-bold tabular-nums" style={{ color: dim ? undefined : meta.hex }}>{p.points == null ? '—' : p.points.toFixed(1)}</td>
        </tr>
      )
    }
    return (
      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="font-bold text-slate-900">{side.team?.name ?? 'BYE'}</span>
          <span className="text-2xl font-black tabular-nums" style={{ color: meta.hex }}>{(score ?? 0).toFixed(1)}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-100">
              <th className="px-2 py-1.5 text-left font-semibold">Pos</th>
              <th className="px-2 py-1.5 text-left font-semibold">Starter</th>
              {cols.map(c => <th key={c.label} className="px-2 py-1.5 text-center font-semibold">{c.label}</th>)}
              <th className="px-3 py-1.5 text-right font-semibold">Pts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {side.starters.map((p: any) => <Row key={p.playerId} p={p} />)}
            <tr className="bg-slate-50"><td colSpan={cols.length + 3} className="px-2 py-1 text-[10px] uppercase font-bold text-slate-400">Bench</td></tr>
            {side.bench.slice(0, 10).map((p: any) => <Row key={p.playerId} p={p} dim />)}
          </tbody>
        </table>
      </div>
    )
  }

  const Fact = ({ label, h, a, fmt }: { label: string; h: number; a: number; fmt?: (n: number) => string }) => (
    <div className="grid grid-cols-3 items-center py-1.5 text-sm">
      <span className="text-right font-semibold tabular-nums text-slate-700">{fmt ? fmt(h) : h}</span>
      <span className="text-center text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-left font-semibold tabular-nums text-slate-700">{fmt ? fmt(a) : a}</span>
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-5">
        <Link href={`/leagues/${id}/scores`} className="btn-ghost text-slate-500">← Scores</Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{meta.emoji} {m.sport} · Week {m.week}</h1>
          <p className="text-sm text-slate-500">{league.name} · {m.isComplete ? 'Final' : 'Live'}</p>
        </div>
      </div>

      {/* Scoreboard + analysis */}
      <div className="card p-5 mb-6">
        <div className="grid grid-cols-3 items-center mb-4">
          <div className="text-center">
            <p className="font-bold text-slate-900 truncate">{home.team?.name ?? 'BYE'}</p>
            <p className="text-4xl font-black tabular-nums" style={{ color: meta.hex }}>{(m.homeScore ?? 0).toFixed(1)}</p>
            <p className="text-xs text-slate-400">proj {home.proj.toFixed(1)}</p>
          </div>
          <div className="text-center text-slate-300 text-sm font-bold">{m.isComplete ? 'FINAL' : 'VS'}</div>
          <div className="text-center">
            <p className="font-bold text-slate-900 truncate">{away.team?.name ?? 'BYE'}</p>
            <p className="text-4xl font-black tabular-nums" style={{ color: meta.hex }}>{(m.awayScore ?? 0).toFixed(1)}</p>
            <p className="text-xs text-slate-400">proj {away.proj.toFixed(1)}</p>
          </div>
        </div>

        {/* Win probability bar */}
        <div className="mb-4">
          <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1">
            <span>{homeWinPct}%</span>
            <span className="uppercase tracking-wide text-slate-400">Pregame Win Prob</span>
            <span>{100 - homeWinPct}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden bg-slate-100 flex">
            <div style={{ width: `${homeWinPct}%`, background: meta.hex }} />
            <div style={{ width: `${100 - homeWinPct}%` }} className="bg-slate-300" />
          </div>
        </div>

        {/* Matchup facts */}
        <div className="border-t border-slate-100 pt-2 divide-y divide-slate-50">
          <Fact label="Projected" h={home.proj} a={away.proj} fmt={n => n.toFixed(1)} />
          <Fact label="Optimal" h={home.optimal} a={away.optimal} fmt={n => n.toFixed(1)} />
          <Fact label="Bench Pts" h={home.benchPts} a={away.benchPts} fmt={n => n.toFixed(1)} />
          <Fact label="Yet to Play" h={home.yetToPlay} a={away.yetToPlay} />
        </div>
      </div>

      {/* Head-to-head history */}
      {h2h && (h2h.homeW + h2h.awayW > 0) && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-900">All-Time Series</h2>
            <span className="text-sm font-bold tabular-nums text-slate-700">{h2h.homeW}<span className="text-slate-300"> – </span>{h2h.awayW}</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {h2h.recent.map((g, i) => {
              const homeWon = g.hs > g.as
              return (
                <div key={i} className="text-xs rounded-lg border border-slate-100 px-2.5 py-1.5">
                  <span className="text-slate-400">{g.season} Wk{g.week}</span>
                  <span className="ml-2 font-semibold tabular-nums" style={{ color: homeWon ? meta.hex : undefined }}>{g.hs.toFixed(0)}</span>
                  <span className="text-slate-300">–</span>
                  <span className="font-semibold tabular-nums" style={{ color: !homeWon ? meta.hex : undefined }}>{g.as.toFixed(0)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <StatTable side={home} score={m.homeScore ?? 0} />
        <StatTable side={away} score={m.awayScore ?? 0} />
      </div>

      {home.team && away.team && <MatchupChat leagueId={id} matchupId={matchupId} accent={meta.hex} />}
    </div>
  )
}
