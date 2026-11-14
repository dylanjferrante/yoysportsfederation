import { NextResponse } from 'next/server'
import { injuriesData } from '@/lib/ysf-mobile'
export const dynamic = 'force-dynamic'
export async function GET(req: Request) { return NextResponse.json(await injuriesData(req)) }
