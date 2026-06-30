import { redirect } from 'next/navigation'

// The schedule editor now lives inside commissioner settings (Schedule tab).
export default async function ScheduleRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/leagues/${id}/settings`)
}
