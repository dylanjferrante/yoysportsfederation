import { db } from '@/db'
import { leagues, teams, matchups } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { safeParse } from '@/lib/utils'
import ScoresView from './ScoresView'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  return { title: `${league?.name ?? 'League'} · Scores` }
}

export default async function ScoresPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()

  const franchises = await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation }).from(teams).where(eq(teams.leagueId, id))
  const all = await db.select().from(matchups).where(eq(matchups.leagueId, id)).limit(3000)
  const sportsEnabled = safeParse<string[]>(league.sportsEnabled, [])

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/leagues/${id}`} className="btn-ghost text-slate-500">← Back</Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Scoreboard</h1>
          <p className="text-sm text-slate-500">{league.name}</p>
        </div>
      </div>
      <ScoresView
        matchups={all as any}
        teams={franchises}
        sportsEnabled={sportsEnabled}
        currentSeason={league.season}
      />
    </div>
  )
}
