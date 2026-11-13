// Keeps the ySF data current while the app server runs (no cron needed):
//   every  5 min  settle due waiver claims and trades whose review has ended
//   every  2 min  NHL games in progress (official feed)
//   every 15 min  NHL official stats, Fantrax lineups, engine scores
//   every hour    Tank01 box scores and season stats (cached; only new finals are fetched)
//   every  6 h    injury designations
//   every 24 h    pro experience (taxi eligibility)
// Each job runs one at a time; a job still running is skipped rather than doubled up.
// Off when YSF_SCHEDULER=off. Output goes to data/logs/scheduler.log.
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

type Job = { name: string; every: number; run: () => Promise<void> }
const LOG = path.join(process.cwd(), 'data', 'logs', 'scheduler.log')
const log = (msg: string) => { try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`) } catch { /* ignore */ } }

function script(file: string, ...args: string[]): Promise<void> {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join('scripts', file), ...args], { cwd: process.cwd(), env: process.env })
    let out = ''
    p.stdout.on('data', d => { out += d }); p.stderr.on('data', d => { out += d })
    p.on('close', code => { log(`${file}${args.length ? ' ' + args.join(' ') : ''} → ${code === 0 ? 'ok' : `exit ${code}`}${code ? `\n${out.slice(-1500)}` : ''}`); resolve() })
    p.on('error', e => { log(`${file} failed to start: ${e.message}`); resolve() })
  })
}

const MIN = 60_000
const JOBS: Job[] = [
  { name: 'settle', every: 5 * MIN, run: async () => {
    const { db } = await import('@/db'); const { leagues } = await import('@/db/schema'); const { eq } = await import('drizzle-orm')
    const [lg] = await db.select().from(leagues).where(eq(leagues.id, 'ysf')).limit(1)
    if (!lg) return
    const { settleYsfWaivers } = await import('@/lib/waivers'); const { settleTrades } = await import('@/lib/trades')
    const w = await settleYsfWaivers(lg); await settleTrades('ysf')
    if (w.processed) log(`settle → ${w.processed} claims processed, ${w.awarded} awarded`)
  } },
  { name: 'nhl-live', every: 2 * MIN, run: () => script('nhl-sync.ts', '--live') },
  { name: 'scores', every: 15 * MIN, run: async () => { await script('nhl-sync.ts'); await script('fantrax-capture.ts'); await script('ysf-score.ts', '--write') } },
  { name: 'stats', every: 60 * MIN, run: () => script('ysf-sync.ts', '--stats') },
  { name: 'injuries', every: 6 * 60 * MIN, run: () => script('ysf-injuries.ts') },
  { name: 'eligibility', every: 24 * 60 * MIN, run: () => script('ysf-eligibility.ts') },
]

export function startYsfScheduler() {
  const g = globalThis as any
  if (g.__ysfScheduler || process.env.YSF_SCHEDULER === 'off') return
  g.__ysfScheduler = true
  const busy = new Set<string>()
  const tick = (j: Job) => async () => {
    if (busy.has(j.name)) return
    busy.add(j.name)
    try { await j.run() } catch (e: any) { log(`${j.name} error: ${e?.message ?? e}`) } finally { busy.delete(j.name) }
  }
  log('scheduler started')
  // stagger the first runs so the server finishes starting first
  JOBS.forEach((j, i) => { setTimeout(tick(j), (30 + i * 20) * 1000); setInterval(tick(j), j.every) })
}
