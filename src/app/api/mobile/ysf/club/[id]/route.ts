import { NextResponse } from 'next/server'
import { clubData } from '@/lib/ysf-mobile'
export const dynamic = 'force-dynamic'
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await clubData(req, (await params).id)
  return c ? NextResponse.json(c) : NextResponse.json({ error: 'Not found' }, { status: 404 })
}
