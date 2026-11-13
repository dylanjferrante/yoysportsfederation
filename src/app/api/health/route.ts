// Health check for the host (Railway): the server is up and the database answers
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'
export async function GET() {
  try { db.all(sql`SELECT 1`); return NextResponse.json({ ok: true }) } catch { return NextResponse.json({ ok: false }, { status: 503 }) }
}
