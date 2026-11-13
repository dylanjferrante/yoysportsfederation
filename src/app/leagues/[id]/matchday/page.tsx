// Matchday was folded into Scores (same pairings); keep old links working.
import { redirect } from 'next/navigation'

export default async function MatchdayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lg?: string }> }) {
  const { id } = await params
  const { lg } = await searchParams
  redirect(`/leagues/${id}/scores${lg ? `?lg=${lg}` : ''}`)
}
