import { redirect } from 'next/navigation'
import { YSF_LEAGUE_ID } from '@/lib/ysf'
import ProposeNexus from './ProposeNexus'

// ySF proposes trades from My Club's TRADE tab; other leagues keep the Nexus form.
export default async function LeagueProposeTradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (id === YSF_LEAGUE_ID) redirect(`/leagues/${id}/myteam?tab=trade`)
  return <ProposeNexus id={id} />
}
