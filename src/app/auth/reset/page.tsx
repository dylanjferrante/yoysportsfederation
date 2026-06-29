'use client'

import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

function ResetForm() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) return setError('Passwords do not match')
    if (password.length < 6) return setError('Password must be at least 6 characters')
    setLoading(true)
    const res = await fetch('/api/auth/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) })
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) return setError(typeof data.error === 'string' ? data.error : 'Could not reset password')
    setDone(true)
    setTimeout(() => router.push('/auth/login'), 1500)
  }

  return (
    <div className="card p-6">
      {!token ? (
        <p className="text-sm text-slate-500">Missing reset token. Please request a new link.</p>
      ) : done ? (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-3 py-2">
          Password updated — redirecting to sign in…
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="label">New password</label>
            <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" placeholder="••••••••" />
          </div>
          <div>
            <label className="label">Confirm password</label>
            <input type="password" className="input" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" placeholder="••••••••" />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 text-base">
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      )}
    </div>
  )
}

export default function ResetPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-black text-sm">NF</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Set a new password</h1>
        </div>
        <Suspense fallback={<div className="card p-6 text-sm text-slate-400">Loading…</div>}>
          <ResetForm />
        </Suspense>
        <p className="text-center text-sm text-slate-500 mt-4">
          <Link href="/auth/login" className="text-blue-600 hover:underline font-medium">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
