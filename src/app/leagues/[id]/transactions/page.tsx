import { db } from '@/db'
import { leagues, activity } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import TransactionsView from './TransactionsView'

export const metadata = { title: 'Transactions' }

export default async function TransactionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()

  const rows = await db.select().from(activity)
    .where(eq(activity.leagueId, id))
    .orderBy(desc(activity.createdAt))
    .limit(300)

  return <TransactionsView leagueId={id} leagueName={league.name} rows={rows as any} />
}
