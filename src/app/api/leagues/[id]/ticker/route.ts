import { NextResponse } from 'next/server'
import { buildHeadlines, buildScoreboard } from '@/lib/headlines'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [headlines, scores] = await Promise.all([buildHeadlines(id), buildScoreboard(id)])
  const news = headlines.filter(h => h.category !== 'SCORE' && h.category !== 'LIVE')
  return NextResponse.json({ scores, news })
}
