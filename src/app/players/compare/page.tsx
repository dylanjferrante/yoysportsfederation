import { db } from '@/db'
import { players, playerGameStats } from '@/db/schema'
import { inArray } from 'drizzle-orm'
import Link from 'next/link'
import { sportMeta, safeParse } from '@/lib/utils'
import { boxScoreColumns } from '@/lib/scoring-categories'

export const metadata = { title: 'Compare Players' }

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams
  const idList = (ids ?? '').split(',').filter(Boolean).slice(0, 3)

  const rows = idList.length ? await db.select().from(players).where(inArray(players.id, idList)) : []
  const ps = idList.map(id => rows.find(r => r.id === id)).filter(Boolean) as typeof rows
  const logs = idList.length ? await db.select({ playerId: playerGameStats.playerId, points: playerGameStats.points, stats: playerGameStats.stats }).from(playerGameStats).where(inArray(playerGameStats.playerId, idList)) : []

  const agg: Record<string, { season: Record<string, number>; gp: number }> = {}
  for (const g of logs) {
    const a = (agg[g.playerId] ??= { season: {}, gp: 0 })
    const s = safeParse<Record<string, number>>(g.stats ?? '{}', {})
    for (const k in s) a.season[k] = (a.season[k] ?? 0) + (s[k] ?? 0)
    a.gp++
  }

  const oneSport = ps.length && ps.every(p => p.sport === ps[0].sport) ? ps[0].sport : null
  const cats = oneSport ? boxScoreColumns(oneSport) : []

  // Metric rows: higher is better except where noted.
  const metrics: { label: string; get: (p: any) => number; fmt?: (n: number) => string }[] = [
    { label: 'Season Pts', get: p => p.seasonPoints ?? 0, fmt: n => n.toFixed(1) },
    { label: 'Projected', get: p => p.projectedPoints ?? 0, fmt: n => n.toFixed(1) },
    { label: 'Per Game', get: p => p.weeklyAvg ?? 0, fmt: n => n.toFixed(1) },
    { label: 'Games', get: p => agg[p.id]?.gp ?? 0 },
    ...cats.map(c => ({ label: c.label, get: (p: any) => +c.get(agg[p.id]?.season ?? {}).toFixed(0) })),
  ]

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href="/players" className="btn-ghost text-slate-500 mb-4 inline-block">← Players</Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Compare Players</h1>
      <p className="text-sm text-slate-500 mb-6">{oneSport ? `${sportMeta(oneSport).emoji} ${oneSport} — season totals` : 'Cross-sport — core metrics only'}</p>

      {ps.length < 2 ? (
        <div className="card p-8 text-center text-slate-400">Pick 2–3 players on the <Link href="/players" className="text-blue-600">Players</Link> page to compare.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-3 text-[10px] uppercase text-slate-400 font-semibold">Stat</th>
                {ps.map(p => {
                  const m = sportMeta(p.sport)
                  return (
                    <th key={p.id} className="px-4 py-3 text-center">
                      <span className={`inline-flex w-8 h-8 rounded-lg ${m.bg} text-white items-center justify-center text-[10px] font-bold mb-1`}>{p.position}</span>
                      <Link href={`/players/${p.id}`} className="block font-semibold text-slate-900 hover:text-blue-600">{p.name}</Link>
                      <span className="text-[11px] text-slate-400">{p.sport} · {p.realTeamAbbr ?? p.realTeam}</span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {metrics.map(row => {
                const vals = ps.map(p => row.get(p))
                const best = Math.max(...vals)
                return (
                  <tr key={row.label} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-500">{row.label}</td>
                    {ps.map((p, i) => (
                      <td key={p.id} className={`px-4 py-2.5 text-center tabular-nums ${vals[i] === best && best > 0 ? 'font-bold text-slate-900 bg-green-50/50' : 'text-slate-600'}`}>
                        {row.fmt ? row.fmt(vals[i]) : vals[i]}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
