import { db } from '@/db'
import { leagues, teams, teamRecords, drafts } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { sportMeta, safeParse, draftTypeLabel } from '@/lib/utils'
import { computeFederationStandings } from '@/lib/federation'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  return { title: `${league?.name ?? 'League'} · Draft` }
}

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()

  const sports = safeParse<string[]>(league.sportsEnabled, [])
  const fed = safeParse<any>(league.federationScoring, { placement: [], championBonus: 0, regularSeasonBonus: 0, includedSports: sports })
  const franchises = await db.select().from(teams).where(eq(teams.leagueId, id))
  const records = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, id), eq(teamRecords.season, league.season)))
  const draftList = await db.select().from(drafts).where(eq(drafts.leagueId, id))

  // Draft order = reverse federation standings (worst picks first).
  const standings = computeFederationStandings(
    franchises.map(f => ({ id: f.id })),
    records.map(r => ({ teamId: r.teamId, sport: r.sport, finishPosition: r.finishPosition, isChampion: r.isChampion })),
    fed, fed.includedSports ?? sports,
  )
  const order = [...standings].reverse().map(s => franchises.find(f => f.id === s.team.id)!).filter(Boolean)
  const rookieMode = league.rookieDraftMode

  const dynasty = draftList.filter(d => d.kind === 'DYNASTY')
  const rookies = draftList.filter(d => d.kind === 'ROOKIE')

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Link href={`/leagues/${id}`} className="btn-ghost text-slate-500">← Back</Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Draft Center</h1>
          <p className="text-sm text-slate-500">{league.name} · {draftTypeLabel(league.draftType ?? 'SNAKE')} · rookie drafts {rookieMode === 'COMBINED' ? 'combined' : 'per sport'}</p>
        </div>
      </div>

      {/* Dynasty draft */}
      {dynasty.map(d => (
        <div key={d.id} className="card p-5 mb-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Inaugural Dynasty Draft</h2>
              <p className="text-sm text-slate-500">Combined across all sports · {d.rounds} rounds · {draftTypeLabel(d.type ?? 'SNAKE')}</p>
            </div>
            <span className={`badge ${d.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-800'}`}>{d.status}</span>
          </div>
          {d.status === 'COMPLETED' && <p className="text-xs text-slate-400 mt-2">Completed — current franchise rosters reflect the results.</p>}
        </div>
      ))}

      {/* Rookie drafts */}
      <h2 className="font-semibold text-slate-900 mb-3">Upcoming Rookie Drafts</h2>
      <div className="space-y-5">
        {rookies.length === 0 && <p className="text-slate-400 text-sm">No rookie drafts scheduled.</p>}
        {rookies.map(d => (
          <div key={d.id} className="card">
            <div className="card-header flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">
                {d.scope === 'OVERALL' ? '🏆 Combined' : `${sportMeta(d.scope).emoji} ${d.scope}`} Rookie Draft · {d.season}
              </h3>
              <div className="flex items-center gap-2">
                {d.startsAt && <span className="text-xs text-slate-400">{new Date(d.startsAt).toLocaleDateString()}</span>}
                <span className="badge bg-slate-100 text-slate-600">{d.status}</span>
              </div>
            </div>
            <div className="card-body overflow-x-auto">
              <p className="text-xs text-slate-400 mb-3">Snake order · {d.rounds} rounds (order set by reverse federation standings)</p>
              <div className="space-y-2">
                {Array.from({ length: d.rounds ?? 4 }, (_, r) => {
                  const roundOrder = r % 2 === 0 ? order : [...order].reverse()
                  return (
                    <div key={r} className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-400 w-12">R{r + 1}</span>
                      {roundOrder.map((t, i) => (
                        <span key={t.id} className="text-xs px-2 py-1 rounded bg-slate-50 text-slate-600 border border-slate-100">
                          <span className="text-slate-400">{r + 1}.{i + 1}</span> {t.abbreviation}
                        </span>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
