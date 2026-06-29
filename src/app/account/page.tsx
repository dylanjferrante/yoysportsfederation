'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'

export default function AccountPage() {
  const { data: session, status } = useSession()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/account').then(r => r.json()).then(u => { setName(u.name ?? ''); setEmail(u.email ?? '') })
  }, [])

  if (status === 'loading') return <div className="text-center py-20 text-slate-400">Loading…</div>
  if (!session) return <div className="max-w-md mx-auto px-4 py-16 text-center text-slate-500">Please <Link href="/auth/login" className="text-blue-600">sign in</Link>.</div>

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg(null)
    const res = await fetch('/api/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email }) })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return setMsg({ ok: false, text: typeof data.error === 'string' ? data.error : 'Could not save' })
    setMsg({ ok: true, text: data.emailChanged ? 'Saved. Sign in again with your new email.' : 'Profile updated.' })
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault(); setMsg(null)
    if (newPassword !== confirm) return setMsg({ ok: false, text: 'New passwords do not match' })
    setSaving(true)
    const res = await fetch('/api/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return setMsg({ ok: false, text: typeof data.error === 'string' ? data.error : 'Could not change password' })
    setCurrentPassword(''); setNewPassword(''); setConfirm('')
    setMsg({ ok: true, text: 'Password changed.' })
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Account Settings</h1>

      {msg && <div className={`mb-4 px-3 py-2 rounded-lg text-sm ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}

      <form onSubmit={saveProfile} className="card p-5 mb-5 space-y-4">
        <h2 className="font-semibold text-slate-900">Profile</h2>
        <div><label className="label">Display name</label><input className="input" value={name} onChange={e => setName(e.target.value)} /></div>
        <div><label className="label">Email</label><input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <button disabled={saving} className="btn-primary disabled:opacity-50">{saving ? 'Saving…' : 'Save profile'}</button>
      </form>

      <form onSubmit={savePassword} className="card p-5 mb-5 space-y-4">
        <h2 className="font-semibold text-slate-900">Change password</h2>
        <div><label className="label">Current password</label><input type="password" className="input" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} autoComplete="current-password" /></div>
        <div><label className="label">New password</label><input type="password" className="input" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" /></div>
        <div><label className="label">Confirm new password</label><input type="password" className="input" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" /></div>
        <button disabled={saving || !currentPassword || !newPassword} className="btn-primary disabled:opacity-50">{saving ? 'Saving…' : 'Change password'}</button>
      </form>

      <div className="text-center">
        <button onClick={() => signOut({ callbackUrl: '/' })} className="text-sm text-red-600 hover:underline">Sign out</button>
      </div>
    </div>
  )
}
