import { db } from '@/db'
import { leagues } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isCommissioner } from '@/lib/permissions'
import RulesView from './RulesView'
import YsfOffice from './YsfOffice'
import { YSF_LEAGUE_ID } from '@/lib/ysf'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select({ name: leagues.name }).from(leagues).where(eq(leagues.id, id)).limit(1)
  return { title: `${league?.name ?? 'League'} · Rules` }
}

export default async function RulesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params
  if (id === YSF_LEAGUE_ID) return <YsfOffice league={{ id }} tab={(await searchParams).tab} />
  const [league] = await db.select({ rules: leagues.rules }).from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()
  const session = await getServerSession(authOptions)
  const canEdit = await isCommissioner(id, session?.user?.id)
  return <RulesView leagueId={id} initialRules={league.rules ?? ''} canEdit={canEdit} />
}
