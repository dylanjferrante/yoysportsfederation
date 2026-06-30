import { NextResponse } from 'next/server'
import { buildHeadlines } from '@/lib/headlines'

// Federation ticker feed — assembled from stored data only (no provider calls),
// so it's cheap to poll. The client refreshes this every 45s.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headlines = await buildHeadlines(id)
  return NextResponse.json({ headlines })
}
