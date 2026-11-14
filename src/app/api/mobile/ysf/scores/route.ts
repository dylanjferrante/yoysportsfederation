import { NextResponse } from 'next/server'
import { scoresData } from '@/lib/ysf-mobile'
export const dynamic = 'force-dynamic'
// ?week=N — the season's own week number (Week 1 = the first games); none = this week
export async function GET(req: Request) {
  const w = Number(new URL(req.url).searchParams.get('week'))
  return NextResponse.json(await scoresData(req, Number.isFinite(w) && w > 0 ? w : undefined))
}
