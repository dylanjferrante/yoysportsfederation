import FranchiseView from '@/components/FranchiseView'
import SeasonRoster from './SeasonRoster'

// A franchise page. With ?season=<past season>, render that season's archived
// roster (read-only); otherwise the live, interactive franchise view.
export default async function TeamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ season?: string }> }) {
  const { id } = await params
  const sp = await searchParams
  if (sp.season) return <SeasonRoster teamId={id} season={sp.season} />
  return <FranchiseView teamId={id} />
}
