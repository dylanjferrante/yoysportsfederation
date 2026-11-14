// Tank01 kill switch for the web server (see scripts/no-tank01.mjs for the scripts). While
// TANK01_ENABLED isn't "1", any request to Tank01 (RapidAPI) fails at once without leaving the server.
export const tank01On = () => process.env.TANK01_ENABLED === '1'
export function blockTank01() {
  const g = globalThis as any
  if (tank01On() || g.__noTank01) return
  g.__noTank01 = true
  const real = g.fetch
  g.fetch = (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input)
    if (/rapidapi\.com/i.test(url)) return Promise.reject(new Error('Tank01 is switched off (set TANK01_ENABLED=1 to allow)'))
    return real(input, init)
  }
}
