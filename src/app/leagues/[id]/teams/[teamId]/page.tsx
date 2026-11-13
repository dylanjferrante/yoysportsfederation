import FranchiseView from '@/components/FranchiseView'
import SeasonRoster from '@/app/teams/[id]/SeasonRoster'
import { db } from '@/db'
import { leagues } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { YSF_LEAGUE_ID } from '@/lib/ysf'
import YsfClub from './YsfClub'

// A club page. The ySF league uses the ySF Site Redesign club page; ?season=<past season>
// shows that season's archived roster.
export default async function LeagueClubPage({ params, searchParams }: { params: Promise<{ id: string; teamId: string }>; searchParams: Promise<{ season?: string }> }) {
  const { id, teamId } = await params
  const sp = await searchParams
  if (sp.season) return <SeasonRoster teamId={teamId} season={sp.season} />
  if (id === YSF_LEAGUE_ID) {
    const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
    if (league) return <YsfClub league={league} teamId={teamId} />
  }
  return <FranchiseView teamId={teamId} />
}
