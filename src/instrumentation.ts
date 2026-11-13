// Runs once when the Next.js server starts.
// The imports sit inside the runtime check so the edge build leaves the Node-only code out.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Sign-in needs a secret: use NEXTAUTH_SECRET when it's set, otherwise make one and keep it on the
    // data volume (data/.auth-secret, readable only by the server) so sessions survive restarts and deploys.
    if (!process.env.NEXTAUTH_SECRET) {
      const fs = await import('fs'), path = await import('path'), crypto = await import('crypto')
      const f = path.join(process.cwd(), 'data', '.auth-secret')
      try {
        if (!fs.existsSync(f)) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, crypto.randomBytes(32).toString('base64url'), { mode: 0o600 }) }
        process.env.NEXTAUTH_SECRET = fs.readFileSync(f, 'utf8').trim()
      } catch { /* sign-in will report the missing secret */ }
    }
    // the ySF data scheduler (see src/lib/ysf-scheduler.ts)
    const { startYsfScheduler } = await import('./lib/ysf-scheduler')
    startYsfScheduler()
  }
}
