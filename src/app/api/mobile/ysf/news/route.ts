import { NextResponse } from 'next/server'
import { newsList } from '@/lib/ysf-mobile'
export const dynamic = 'force-dynamic'
// ?s=NFL|NHL|NBA|MLB|CUP|MOVES — one section; none = every story, newest first
export async function GET(req: Request) { return NextResponse.json(await newsList(req, new URL(req.url).searchParams.get('s') || undefined)) }
