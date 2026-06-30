import { NextResponse } from 'next/server'
import { buildHeadlines, buildScoreboard } from '@/lib/headlines'

// Federation ticker feed — a static scoreboard (flips between games) + a
// scrolling news feed, both assembled from stored data only (no provider calls).
// The client refreshes this every 45s.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [headlines, scores] = await Promise.all([buildHeadlines(id), buildScoreboard(id)])
  // Scores live in the static panel, so keep them out of the scrolling news.
  const news = headlines.filter(h => h.category !== 'SCORE' && h.category !== 'LIVE')
  return NextResponse.json({ scores, news })
}
