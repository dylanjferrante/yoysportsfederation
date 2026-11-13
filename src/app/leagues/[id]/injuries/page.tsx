// ySF Injuries (moved from /news, which is now ySF News).
import { db } from '@/db'
import { leagues } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import YsfInjuries from '../news/YsfInjuries'
import { YSF_LEAGUE_ID } from '@/lib/ysf'

export const metadata = { title: 'yoy Sports Federation · Injuries' }

export default async function InjuriesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lg?: string }> }) {
  const { id } = await params
  if (id !== YSF_LEAGUE_ID) redirect(`/leagues/${id}/news`)
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()
  return <div className="flex flex-col gap-5"><YsfInjuries league={league} lg={(await searchParams).lg} /></div>
}
