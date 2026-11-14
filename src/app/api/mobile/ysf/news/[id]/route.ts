import { NextResponse } from 'next/server'
import { newsArticle } from '@/lib/ysf-mobile'
export const dynamic = 'force-dynamic'
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await newsArticle(req, (await params).id)
  return a ? NextResponse.json(a) : NextResponse.json({ error: 'Not found' }, { status: 404 })
}
