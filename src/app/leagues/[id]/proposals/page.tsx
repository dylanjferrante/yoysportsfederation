import { db } from '@/db'
import { leagues } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import ProposalsView from './ProposalsView'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select({ name: leagues.name }).from(leagues).where(eq(leagues.id, id)).limit(1)
  return { title: `${league?.name ?? 'League'} · Proposals` }
}

export default async function ProposalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select({ id: leagues.id }).from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()
  return <ProposalsView leagueId={id} />
}
