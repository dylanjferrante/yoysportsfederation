import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, teamRecords } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { safeParse } from '@/lib/utils'
import WaiversView from './WaiversView'

export const metadata = { title: 'Waivers' }

export default async function WaiversPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()

  const sportsEnabled = safeParse<string[]>(league.sportsEnabled, [])
  const isCommissioner = league.commissionerId === session?.user?.id

  let myTeam: { id: string; name: string } | null = null
  let myRecords: { sport: string; faabRemaining: number; waiverPriority: number }[] = []
  if (session?.user?.id) {
    const [t] = await db.select({ id: teams.id, name: teams.name }).from(teams)
      .where(and(eq(teams.leagueId, id), eq(teams.userId, session.user.id))).limit(1)
    if (t) {
      myTeam = t
      myRecords = await db.select({ sport: teamRecords.sport, faabRemaining: teamRecords.faabRemaining, waiverPriority: teamRecords.waiverPriority })
        .from(teamRecords).where(and(eq(teamRecords.teamId, t.id), eq(teamRecords.season, league.season))) as any
    }
  }

  return (
    <WaiversView
      leagueId={id}
      leagueName={league.name}
      waiverType={league.waiverType ?? 'PRIORITY'}
      faabMode={league.faabMode ?? 'TOTAL'}
      sportsEnabled={sportsEnabled}
      isCommissioner={isCommissioner}
      myTeam={myTeam}
      myRecords={myRecords}
    />
  )
}
