import { NextResponse } from 'next/server'
import { db } from '@/db'
import { leagues } from '@/db/schema'
import { advanceLeague } from '@/lib/advance'

// Hit by a scheduler (e.g. Vercel Cron) so seasons advance with zero human
// action. Optionally protected by CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const all = await db.select({ id: leagues.id }).from(leagues)
  for (const l of all) await advanceLeague(l.id, true)
  return NextResponse.json({ ok: true, advanced: all.length })
}
