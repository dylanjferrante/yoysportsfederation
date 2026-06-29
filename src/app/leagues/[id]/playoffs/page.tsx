import { db } from '@/db'
import { leagues, teams, teamRecords } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { sportMeta, safeParse } from '@/lib/utils'

type Seed = { seed: number; team: { id: string; name: string; abbreviation: string } | null }

// Standard single-elimination seeding order (1, n, ... ) for a power-of-two bracket.
function seedOrder(n: number): number[] {
  let rounds = [1, 2]
  while (rounds.length < n) {
    const len = rounds.length * 2 + 1
    const next: number[] = []
    for (const s of rounds) { next.push(s); next.push(len - s) }
    rounds = next
  }
  return rounds
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  return { title: `${league?.name ?? 'League'} · Playoffs` }
}

export default async function PlayoffsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()

  const sports = safeParse<string[]>(league.sportsEnabled, [])
  const n = league.playoffTeams ?? 4
  const franchises = await db.select().from(teams).where(eq(teams.leagueId, id))
  const records = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, id), eq(teamRecords.season, league.season)))
  const teamById = Object.fromEntries(franchises.map(f => [f.id, f]))

  function seedsFor(sport: string): Seed[] {
    const ranked = records.filter(r => r.sport === sport)
      .sort((a, b) => (a.finishPosition ?? 99) - (b.finishPosition ?? 99) || (b.wins ?? 0) - (a.wins ?? 0))
      .slice(0, n)
    return ranked.map((r, i) => ({ seed: i + 1, team: teamById[r.teamId] ? { id: teamById[r.teamId].id, name: teamById[r.teamId].name, abbreviation: teamById[r.teamId].abbreviation } : null }))
  }

  function rounds(seeds: Seed[]) {
    let p = 1; while (p < seeds.length) p <<= 1
    const order = seedOrder(p)
    const first: [Seed | null, Seed | null][] = []
    for (let i = 0; i < p; i += 2) {
      first.push([seeds[order[i] - 1] ?? null, seeds[order[i + 1] - 1] ?? null])
    }
    const all: [Seed | null, Seed | null][][] = [first]
    let count = p / 2
    while (count >= 1) {
      all.push(Array.from({ length: Math.max(1, Math.floor(count / 2)) }, () => [null, null] as [Seed | null, Seed | null]))
      if (count === 1) break
      count = Math.floor(count / 2)
    }
    return all
  }

  const roundName = (ri: number, total: number) => {
    const fromEnd = total - 1 - ri
    if (fromEnd === 0) return 'Final'
    if (fromEnd === 1) return 'Semifinals'
    if (fromEnd === 2) return 'Quarterfinals'
    return `Round ${ri + 1}`
  }

  function Cell({ s }: { s: Seed | null }) {
    if (!s) return <div className="text-xs text-slate-300 px-2 py-1.5">TBD</div>
    if (!s.team) return <div className="text-xs text-slate-300 px-2 py-1.5">BYE</div>
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-sm">
        <span className="text-[10px] font-bold text-slate-400 w-4">{s.seed}</span>
        <span className="font-medium text-slate-800 truncate">{s.team.abbreviation}</span>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Link href={`/leagues/${id}`} className="btn-ghost text-slate-500">← Back</Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Playoff Brackets</h1>
          <p className="text-sm text-slate-500">{league.name} · top {n} per sport · seeded by standings</p>
        </div>
      </div>

      <div className="space-y-8">
        {sports.map(sport => {
          const seeds = seedsFor(sport)
          const rs = rounds(seeds)
          const meta = sportMeta(sport)
          return (
            <div key={sport} className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className={`w-8 h-8 rounded-lg ${meta.bg} text-white flex items-center justify-center`}>{meta.emoji}</span>
                <h2 className="font-semibold text-slate-900">{sport} Playoffs</h2>
              </div>
              {seeds.length === 0 ? (
                <p className="text-sm text-slate-400">No standings yet.</p>
              ) : (
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {rs.map((round, ri) => (
                    <div key={ri} className="flex-shrink-0 w-40">
                      <p className="text-xs font-bold text-slate-400 uppercase mb-2">{roundName(ri, rs.length)}</p>
                      <div className="space-y-3">
                        {round.map((match, mi) => (
                          <div key={mi} className="border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                            <Cell s={match[0]} />
                            <Cell s={match[1]} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="flex-shrink-0 w-32 flex flex-col justify-center">
                    <p className="text-xs font-bold text-amber-500 uppercase mb-2">Champion</p>
                    <div className="border-2 border-amber-200 bg-amber-50 rounded-lg px-3 py-4 text-center text-sm text-amber-700">🏆 TBD</div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
