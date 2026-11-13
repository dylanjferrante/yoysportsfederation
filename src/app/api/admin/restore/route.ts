// One-time data upload to a new server: a .tar.gz of the data folder (made by scripts/pack-data.sh) is
// unpacked into /app/data. Off unless RESTORE_TOKEN is set; send it as "Authorization: Bearer <token>".
// Remove RESTORE_TOKEN once the data is in, then restart so the server opens the restored database.
import { NextResponse } from 'next/server'
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'
export async function POST(req: Request) {
  const token = process.env.RESTORE_TOKEN
  if (!token || req.headers.get('authorization') !== `Bearer ${token}`) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!req.body) return NextResponse.json({ error: 'No file' }, { status: 400 })
  const dir = path.join(process.cwd(), 'data')
  const stage = path.join(dir, '.restore')
  fs.rmSync(stage, { recursive: true, force: true }); fs.mkdirSync(stage, { recursive: true })
  // receive the whole archive, save it, then unpack it (simpler and sturdier than streaming into tar)
  const file = path.join(dir, '.restore-upload.tgz')
  const buf = Buffer.from(await req.arrayBuffer())
  fs.writeFileSync(file, buf)
  console.log(`restore: received ${(buf.length / 1048576).toFixed(1)} MB`)
  const r = spawnSync('tar', ['-xzf', file, '-C', stage])
  fs.rmSync(file, { force: true })
  const code = r.status ?? 1
  console.log(`restore: unpacked (tar exit ${code}${r.error ? `, ${r.error.message}` : ''})`)
  if (code !== 0 || !fs.existsSync(path.join(stage, 'nexus.db'))) { fs.rmSync(stage, { recursive: true, force: true }); return NextResponse.json({ error: 'Not a data archive' }, { status: 400 }) }
  // move everything into place (the open database file is replaced; restart afterwards)
  for (const f of fs.readdirSync(stage)) {
    fs.rmSync(path.join(dir, f), { recursive: true, force: true })
    fs.renameSync(path.join(stage, f), path.join(dir, f))
  }
  for (const f of ['nexus.db-wal', 'nexus.db-shm']) fs.rmSync(path.join(dir, f), { force: true })
  fs.rmSync(stage, { recursive: true, force: true })
  return NextResponse.json({ ok: true, restart: 'Restart the service now, then remove RESTORE_TOKEN' })
}
