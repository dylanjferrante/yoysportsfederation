import FranchiseView from '@/components/FranchiseView'
import SeasonRoster from '@/app/teams/[id]/SeasonRoster'

// A club, rendered in-line inside the league dashboard (keeps the nav, header,
// and wire). ?season=<past season> shows that season's archived roster.
export default async function LeagueClubPage({ params, searchParams }: { params: Promise<{ id: string; teamId: string }>; searchParams: Promise<{ season?: string }> }) {
  const { teamId } = await params
  const sp = await searchParams
  if (sp.season) return <SeasonRoster teamId={teamId} season={sp.season} />
  return <FranchiseView teamId={teamId} />
}
