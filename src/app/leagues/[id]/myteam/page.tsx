import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { teams } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import Link from 'next/link'
import FranchiseView from '@/components/FranchiseView'

export const metadata = { title: 'My Club' }

// Renders the user's franchise inline within the league layout (not a separate page).
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
  return <FranchiseView teamId={myTeam.id} />
}
