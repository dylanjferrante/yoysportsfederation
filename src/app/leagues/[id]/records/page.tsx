import RecordBook from './RecordBook'
import YsfRecords from './YsfRecords'
import { db } from '@/db'
import { leagues } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { YSF_LEAGUE_ID } from '@/lib/ysf'

export default async function RecordsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lg?: string }> }) {
  const { id } = await params
  if (id !== YSF_LEAGUE_ID) return <RecordBook />
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()
  return <YsfRecords league={league} lg={(await searchParams).lg} />
}
