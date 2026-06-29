'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [resetUrl, setResetUrl] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/auth/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    setSent(true)
    setResetUrl(data.resetUrl ?? null)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-black text-sm">NF</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Reset your password</h1>
          <p className="text-slate-500 text-sm mt-1">We'll create a reset link for your account.</p>
        </div>

        <div className="card p-6">
          {sent ? (
            <div className="space-y-3 text-sm">
              <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2">
                If that email is registered, a reset link has been created.
              </div>
              {resetUrl && (
                <div className="text-slate-600">
                  <p className="mb-1 text-xs text-slate-400">No email service is configured in this demo, so here is your link:</p>
                  <Link href={resetUrl} className="text-blue-600 hover:underline font-medium break-all">Reset your password →</Link>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 text-base">
                {loading ? 'Creating link…' : 'Send reset link'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-slate-500 mt-4">
          <Link href="/auth/login" className="text-blue-600 hover:underline font-medium">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
