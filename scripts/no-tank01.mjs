// Tank01 kill switch for every script the scheduler runs (loaded with node --import). While
// TANK01_ENABLED isn't "1", any request to Tank01 (RapidAPI) fails at once without leaving the machine.
const on = process.env.TANK01_ENABLED === '1'
if (!on && typeof globalThis.fetch === 'function' && !globalThis.__noTank01) {
  globalThis.__noTank01 = true
  const real = globalThis.fetch
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input)
    if (/rapidapi\.com/i.test(url)) return Promise.reject(new Error('Tank01 is switched off (set TANK01_ENABLED=1 to allow)'))
    return real(input, init)
  }
}
