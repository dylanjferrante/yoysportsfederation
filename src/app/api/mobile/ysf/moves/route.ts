import { NextResponse } from 'next/server'
import { movesData } from '@/lib/ysf-mobile'
export const dynamic = 'force-dynamic'
// ?season=2025-26 — another season; none = this one
export async function GET(req: Request) { return NextResponse.json(await movesData(req, new URL(req.url).searchParams.get('season') || undefined)) }
