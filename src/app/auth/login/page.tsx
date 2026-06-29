'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (res?.error) return setError('Invalid email or password')
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-black text-sm">NF</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
          <p className="text-slate-500 text-sm mt-1">Sign in to your Nexus Fantasy account</p>
        </div>

        <div className="card p-6">
          <form onSubmit={submit} className="space-y-4">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="label">Password</label>
                <Link href="/auth/forgot" className="text-xs text-blue-600 hover:underline">Forgot password?</Link>
              </div>
              <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" placeholder="••••••••" />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 text-base">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-4">
            Demo: <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">admin@nexusfantasy.com</span> / <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">password123</span>
          </p>
        </div>

        <p className="text-center text-sm text-slate-500 mt-4">
          Don't have an account?{' '}
          <Link href="/auth/register" className="text-blue-600 hover:underline font-medium">Create one</Link>
        </p>
      </div>
    </div>
  )
}
