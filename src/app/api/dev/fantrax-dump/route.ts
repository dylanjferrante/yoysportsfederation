// DEV ONLY: receives Fantrax history pages pulled in the browser (where the owner is signed in)
// and writes them to data/fantrax-history/<leagueId>/<name>.json. Disabled outside development.
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const CORS = {
  'Access-Control-Allow-Origin': 'https://www.fantrax.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Private-Network': 'true',
}
const ok = () => process.env.NODE_ENV === 'development'

export async function OPTIONS() {
  return new NextResponse(null, { status: ok() ? 204 : 404, headers: CORS })
}

export async function POST(req: Request) {
  if (!ok()) return new NextResponse('not found', { status: 404 })
  // JSON (fetch) or a form post (a top-level navigation from the Fantrax tab, which the browser
  // allows where a background request to localhost is blocked)
  const form = !(req.headers.get('content-type') ?? '').includes('json')
  let leagueId: string, name: string, data: any
  if (form) { const f = await req.formData(); leagueId = String(f.get('leagueId')); name = String(f.get('name')); data = JSON.parse(String(f.get('data'))) }
  else ({ leagueId, name, data } = await req.json())
  if (!/^[a-z0-9]{16}$/.test(String(leagueId)) || !/^[A-Za-z0-9_.-]{1,80}$/.test(String(name))) return NextResponse.json({ error: 'bad name' }, { status: 400, headers: CORS })
  const dir = path.join(process.cwd(), 'data', 'fantrax-history', leagueId)
  fs.mkdirSync(dir, { recursive: true })
  const body = JSON.stringify(data)
  fs.writeFileSync(path.join(dir, `${name}.json`), body)
  if (form) return new NextResponse(`<!doctype html><title>saved</title><p id="saved">saved ${leagueId}/${name} · ${body.length} bytes</p>`, { headers: { 'Content-Type': 'text/html' } })
  return NextResponse.json({ ok: true }, { headers: CORS })
}
