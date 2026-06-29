import { db } from '@/db'
import { leagues, teams, matchups, rosters, players, playerGameStats } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { sportMeta, safeParse } from '@/lib/utils'
import { RESERVE_SLOTS } from '@/lib/defaults'
import { boxScoreColumns } from '@/lib/scoring-categories'

const isStarter = (slot: string) => !RESERVE_SLOTS.includes(slot)

export default async function MatchupPage({ params }: { params: Promise<{ id: string; matchupId: string }> }) {
  const { id, matchupId } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  const [m] = await db.select().from(matchups).where(eq(matchups.id, matchupId)).limit(1)
  if (!league || !m) notFound()
  const meta = sportMeta(m.sport)
  const cols = boxScoreColumns(m.sport)

  async function lineup(teamId: string | null) {
    if (!teamId) return { team: null, starters: [] as any[], bench: [] as any[] }
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1)
    const rows = await db
      .select({ slot: rosters.slot, name: players.name, position: players.position, realTeam: players.realTeam, playerId: players.id, points: playerGameStats.points, stats: playerGameStats.stats })
      .from(rosters).innerJoin(players, eq(rosters.playerId, players.id))
      .leftJoin(playerGameStats, and(eq(playerGameStats.playerId, rosters.playerId), eq(playerGameStats.leagueId, id), eq(playerGameStats.season, m.season ?? league!.season), eq(playerGameStats.week, m.week)))
      .where(and(eq(rosters.teamId, teamId), eq(rosters.sport, m.sport)))
    const starters = rows.filter(r => isStarter(r.slot)).sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    const bench = rows.filter(r => !isStarter(r.slot)).sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    return { team, starters, bench }
  }

  const home = await lineup(m.homeTeamId)
  const away = await lineup(m.awayTeamId)

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

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/leagues/${id}/scores`} className="btn-ghost text-slate-500">← Scores</Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{m.sport} · Week {m.week}</h1>
          <p className="text-sm text-slate-500">{league.name} · {m.isComplete ? 'Final' : 'Live'}</p>
        </div>
        <div className="ml-auto flex items-baseline gap-3 text-2xl font-black tabular-nums">
          <span className="text-slate-900">{(m.homeScore ?? 0).toFixed(1)}</span>
          <span className="text-slate-300 text-base">–</span>
          <span className="text-slate-900">{(m.awayScore ?? 0).toFixed(1)}</span>
        </div>
      </div>
      <div className="space-y-6">
        <StatTable side={home} score={m.homeScore ?? 0} />
        <StatTable side={away} score={m.awayScore ?? 0} />
      </div>
    </div>
  )
}
