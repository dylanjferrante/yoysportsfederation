import { db } from '@/db'
import { leagues, teams, matchups, rosters, players, playerGameStats } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { sportMeta, safeParse } from '@/lib/utils'
import { RESERVE_SLOTS } from '@/lib/defaults'

const isStarter = (slot: string) => !RESERVE_SLOTS.includes(slot)

export default async function MatchupPage({ params }: { params: Promise<{ id: string; matchupId: string }> }) {
  const { id, matchupId } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  const [m] = await db.select().from(matchups).where(eq(matchups.id, matchupId)).limit(1)
  if (!league || !m) notFound()

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
  const meta = sportMeta(m.sport)

  function Side({ side, score, align }: { side: any; score: number; align: 'left' | 'right' }) {
    return (
      <div>
        <div className={`flex items-center gap-2 mb-3 ${align === 'right' ? 'justify-end' : ''}`}>
          <span className="font-bold text-slate-900">{side.team?.name ?? 'BYE'}</span>
          <span className="text-2xl font-black" style={{ color: meta.hex }}>{(score ?? 0).toFixed(1)}</span>
        </div>
        <div className="card divide-y divide-slate-50">
          <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase bg-slate-50">Starters</div>
          {side.starters.map((p: any) => (
            <div key={p.playerId} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="text-[10px] font-bold text-slate-400 w-9">{p.slot}</span>
              <span className="flex-1 min-w-0 truncate"><span className="font-medium text-slate-800">{p.name}</span> <span className="text-xs text-slate-400">{p.position}</span></span>
              <span className="font-semibold text-slate-900 w-12 text-right">{p.points != null ? p.points.toFixed(1) : '—'}</span>
            </div>
          ))}
          {side.bench.length > 0 && <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase bg-slate-50">Bench</div>}
          {side.bench.slice(0, 12).map((p: any) => (
            <div key={p.playerId} className="flex items-center gap-2 px-3 py-1.5 text-sm opacity-60">
              <span className="text-[10px] font-bold text-slate-400 w-9">{p.slot}</span>
              <span className="flex-1 min-w-0 truncate">{p.name}</span>
              <span className="text-slate-500 w-12 text-right">{p.points != null ? p.points.toFixed(1) : '—'}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/leagues/${id}/scores`} className="btn-ghost text-slate-500">← Scores</Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{meta.emoji} {m.sport} · Week {m.week}</h1>
          <p className="text-sm text-slate-500">{league.name} · {m.isComplete ? 'Final' : 'Live'}</p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-6">
        <Side side={home} score={m.homeScore ?? 0} align="left" />
        <Side side={away} score={m.awayScore ?? 0} align="left" />
      </div>
    </div>
  )
}
