// Keeps the ySF data current while the app server runs (no cron needed):
//   every  5 min  settle due waiver claims and trades whose review has ended
//   every 30 s    start drafts at their set time; auto-pick when a pick clock runs out
//   every  2 min  NHL games in progress (official feed)
//   every 15 min  NHL official stats, Fantrax lineups, engine scores
//   every hour    Tank01 box scores and season stats (cached; only new finals are fetched)
//   every  6 h    injury designations
//   every hour    the ySF projection model
//   every hour    ySF News stories that are due (when ANTHROPIC_API_KEY is set)
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
  { name: 'drafts', every: 30_000, run: async () => {
    // start a scheduled draft on time, and auto-pick when a pick clock runs out — only once the app runs the
    // drafts itself (YSF_RUN_DRAFTS=on); until the switch-over the real drafts happen on Fantrax
    if (process.env.YSF_RUN_DRAFTS !== 'on') return
    const { db } = await import('@/db'); const { sql } = await import('drizzle-orm')
    const now = new Date().toISOString()
    const due = db.all<{ id: string; status: string }>(sql`SELECT id, status FROM drafts WHERE (status = 'PENDING' AND starts_at IS NOT NULL AND starts_at <= ${now}) OR (status = 'IN_PROGRESS' AND pick_deadline IS NOT NULL AND pick_deadline <= ${now})`)
    for (const d of due) {
      const action = d.status === 'PENDING' ? 'START' : 'TICK'
      const r = await fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/api/drafts/${d.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ysf-scheduler': process.env.NEXTAUTH_SECRET ?? '' }, body: JSON.stringify({ action }) }).catch(() => null)
      log(`draft ${d.id} ${action} → ${r?.status ?? 'unreachable'}`)
    }
  } },
  { name: 'nhl-live', every: 2 * MIN, run: () => script('nhl-sync.ts', '--live') },
  { name: 'scores', every: 15 * MIN, run: async () => { await script('nhl-sync.ts'); await script('fantrax-capture.ts'); await script('ysf-score.ts', '--write') } },
  { name: 'stats', every: 60 * MIN, run: () => script('ysf-sync.ts', '--stats') },
  { name: 'injuries', every: 6 * 60 * MIN, run: () => script('ysf-injuries.ts') },
  { name: 'eligibility', every: 24 * 60 * MIN, run: () => script('ysf-eligibility.ts') },
  // the ySF projection model (player projections, matchup odds, 10,000 seasons)
  { name: 'model', every: 60 * MIN, run: () => script('ysf-model.ts') },
  // ySF News: the daily wrap, the day's column and trade stories, as each comes due (needs ANTHROPIC_API_KEY)
  { name: 'news', every: 60 * MIN, run: () => process.env.ANTHROPIC_API_KEY ? script('ysf-news.ts') : Promise.resolve() },
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
