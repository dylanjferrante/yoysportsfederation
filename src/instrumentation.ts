// Runs once when the Next.js server starts: the ySF data scheduler (see src/lib/ysf-scheduler.ts).
// The import sits inside the runtime check so the edge build leaves the Node-only code out.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startYsfScheduler } = await import('./lib/ysf-scheduler')
    startYsfScheduler()
  }
}
