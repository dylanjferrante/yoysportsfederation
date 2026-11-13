import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { teams, leagues } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import Link from 'next/link'
import MyClub from './MyClub'
import YsfClub from '../teams/[teamId]/YsfClub'
import { YSF_LEAGUE_ID } from '@/lib/ysf'

export const metadata = { title: 'My Club' }

// Your club. In ySF this is the full club page (band, calendar, league tabs, drafts, moves,
// head-to-head) with the lineup / add-drop / trade / pending tools under the band.
export default async function MyTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const { id } = await params
  const myTeam = session?.user?.id
    ? (await db.select({ id: teams.id }).from(teams).where(and(eq(teams.leagueId, id), eq(teams.userId, session.user.id))).limit(1))[0]
    : null

  if (!myTeam) {
    return (
      <div className="card p-8 text-center text-slate-500">
        You don&apos;t have a club in this league.{' '}
        <Link href={`/leagues/${id}/teams`} className="text-blue-600 hover:underline">Browse clubs →</Link>
      </div>
    )
  }
  if (id === YSF_LEAGUE_ID) {
    const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
    if (league) return <YsfClub league={league} teamId={myTeam.id} own />
  }
  return <MyClub leagueId={id} />
}
