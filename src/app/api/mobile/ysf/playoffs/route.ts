import { NextResponse } from 'next/server'
import { playoffsData } from '@/lib/ysf-mobile-standings'

export const dynamic = 'force-dynamic'
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  return NextResponse.json(await playoffsData(req, q.get('sport') ?? undefined, q.get('season') ?? undefined))
}
