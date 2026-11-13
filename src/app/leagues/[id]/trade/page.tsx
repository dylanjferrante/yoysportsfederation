import TradeCenter from './TradeCenter'
import YsfTrades from './YsfTrades'
import { db } from '@/db'
import { leagues } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { YSF_LEAGUE_ID } from '@/lib/ysf'

export default async function TradePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ s?: string }> }) {
  const { id } = await params
  if (id !== YSF_LEAGUE_ID) return <TradeCenter />
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()
  return <YsfTrades league={league} season={(await searchParams).s} />
}
