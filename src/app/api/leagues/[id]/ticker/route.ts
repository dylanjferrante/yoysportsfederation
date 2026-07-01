import { NextResponse } from 'next/server'
import { buildScoreboard } from '@/lib/headlines'
import { buildWireTopics } from '@/lib/wire'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [topics, scores] = await Promise.all([buildWireTopics(id), buildScoreboard(id)])
  return NextResponse.json({ scores, topics })
}
