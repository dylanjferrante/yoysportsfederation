'use client'
// Sign in: Google or Apple (when configured) or email and password. New owners join through their club's
// invite link from the Commission.
import { useEffect, useState } from 'react'
import { signIn, getProviders } from 'next-auth/react'
import Link from 'next/link'
import { YSF_ART, YSF_LEAGUE_ID } from '@/lib/ysf'

const LABEL: Record<string, string> = { google: 'CONTINUE WITH GOOGLE', apple: 'CONTINUE WITH APPLE' }

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauth, setOauth] = useState<string[]>([])
  const home = `/leagues/${YSF_LEAGUE_ID}`
  useEffect(() => { getProviders().then(p => setOauth(Object.keys(p ?? {}).filter(k => k !== 'credentials'))).catch(() => {}) }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    const res = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (res?.error) return setError('Wrong email or password')
    const next = new URLSearchParams(window.location.search).get('callbackUrl')
    window.location.href = next && next.startsWith('/') ? next : home
  }
  const btn = 'inline-flex items-center justify-center w-full h-12 rounded-lg font-display text-[14px] font-bold tracking-[.08em] leading-none'

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px] flex flex-col items-center gap-6">
        <span className="inline-flex items-center justify-center h-20"><img src={YSF_ART.primaryOnWhite} alt="yoy Sports Federation" className="h-20 object-contain" /></span>
        <h1 className="disp text-[34px] font-extrabold leading-none">SIGN IN</h1>
        <div className="w-full flex flex-col gap-3">
          {oauth.map(p => <button key={p} onClick={() => signIn(p, { callbackUrl: home })} className={`${btn} border-2 border-black bg-white text-black`}>{LABEL[p] ?? `CONTINUE WITH ${p.toUpperCase()}`}</button>)}
          {oauth.length > 0 && <div className="ui text-center text-[12px] text-ink-400 tracking-[.12em] my-1">OR</div>}
          <form onSubmit={submit} className="flex flex-col gap-2.5">
            <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="Email" />
            <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" placeholder="Password" />
            <button type="submit" disabled={loading} className={`${btn} bg-black text-white`}>{loading ? 'SIGNING IN…' : 'SIGN IN'}</button>
          </form>
          {error && <div className="text-[14px] font-semibold text-center" style={{ color: '#ba0c2f' }}>{error}</div>}
          <Link href="/auth/forgot" className="text-center text-[14px] font-semibold text-ink-600 hover:text-black">Forgot your password?</Link>
        </div>
      </div>
    </div>
  )
}
