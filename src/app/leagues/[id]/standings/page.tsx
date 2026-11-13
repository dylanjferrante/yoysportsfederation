import { db } from '@/db'
import { leagues } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { YSF_LEAGUE_ID } from '@/lib/ysf'
import YsfStandings from '../YsfStandings'

export const metadata = { title: 'Standings' }

export default async function StandingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (id !== YSF_LEAGUE_ID) redirect(`/leagues/${id}`)
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()
  return <YsfStandings league={league} />
}
