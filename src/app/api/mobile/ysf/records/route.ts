import { NextResponse } from 'next/server'
import { recordsData } from '@/lib/ysf-mobile-standings'

export const dynamic = 'force-dynamic'
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  return NextResponse.json(await recordsData(req, q.get('sport') ?? undefined))
}
