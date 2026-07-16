import { db } from '@/db'
import { leagues } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isCommissioner } from '@/lib/permissions'
import RulesView from './RulesView'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select({ name: leagues.name }).from(leagues).where(eq(leagues.id, id)).limit(1)
  return { title: `${league?.name ?? 'League'} · Rules` }
}

export default async function RulesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select({ rules: leagues.rules }).from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()
  const session = await getServerSession(authOptions)
  const canEdit = await isCommissioner(id, session?.user?.id)
  return <RulesView leagueId={id} initialRules={league.rules ?? ''} canEdit={canEdit} />
}
