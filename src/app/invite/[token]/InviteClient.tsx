'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'

const LABEL: Record<string, string> = { google: 'CONTINUE WITH GOOGLE', apple: 'CONTINUE WITH APPLE' }

export default function InviteClient({ token, providers, home }: { token: string; providers: string[]; home: string }) {
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const btn = 'inline-flex items-center justify-center w-full h-12 rounded-lg font-display text-[14px] font-bold tracking-[.08em] leading-none'

  const oauth = async (p: string) => {
    setBusy(true); setErr(null)
    const r = await fetch(`/api/invite/${token}`, { method: 'PUT' })
    if (!r.ok) { setBusy(false); return setErr((await r.json().catch(() => ({}))).error ?? 'This invite can’t be used') }
    await signIn(p, { callbackUrl: home })
  }
  const withPassword = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    const r = await fetch(`/api/invite/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setBusy(false); return setErr(j.error ?? 'Could not claim the club') }
    const s = await signIn('credentials', { email: j.email, password, redirect: false })
    if (s?.error) { setBusy(false); return setErr('Your club is claimed — sign in with your new email and password') }
    window.location.href = home
  }

  return (
    <div className="w-full flex flex-col gap-3">
      {providers.map(p => (
        <button key={p} disabled={busy} onClick={() => oauth(p)} className={`${btn} border-2 border-black bg-white text-black`}>{LABEL[p] ?? `CONTINUE WITH ${p.toUpperCase()}`}</button>
      ))}
      {providers.length > 0 && <div className="ui text-center text-[12px] text-ink-400 tracking-[.12em] my-1">OR</div>}
      <form onSubmit={withPassword} className="flex flex-col gap-2.5">
        <input className="input" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" required />
        <input className="input" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
        <input className="input" type="password" placeholder="Password (8+ characters)" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
        <button disabled={busy} className={`${btn} bg-black text-white`}>CLAIM YOUR CLUB</button>
      </form>
      {err && <div className="text-[14px] font-semibold text-center" style={{ color: '#ba0c2f' }}>{err}</div>}
    </div>
  )
}
