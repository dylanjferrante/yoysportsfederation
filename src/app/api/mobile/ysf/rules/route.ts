import { NextResponse } from 'next/server'
import { rulesData } from '@/lib/ysf-mobile'
export const dynamic = 'force-dynamic'
export async function GET() { return NextResponse.json(await rulesData()) }
