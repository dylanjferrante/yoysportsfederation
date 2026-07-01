import { NextResponse } from 'next/server'
import { buildScoreboard } from '@/lib/headlines'
import { buildWire } from '@/lib/wire'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [wire, scores] = await Promise.all([buildWire(id), buildScoreboard(id)])
  return NextResponse.json({ scores, topics: wire.topics, slides: wire.slides })
}
