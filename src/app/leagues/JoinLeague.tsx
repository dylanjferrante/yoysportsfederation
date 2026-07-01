'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function JoinLeague() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [teamName, setTeamName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function join() {
    if (!code.trim()) return
    setBusy(true); setErr(null)
    const res = await fetch('/api/leagues/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim(), teamName: teamName.trim() || undefined }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setErr(typeof data.error === 'string' ? data.error : 'Could not join'); return }
    router.push(`/leagues/${data.leagueId}`)
  }

  if (!open) return <button onClick={() => setOpen(true)} className="btn-secondary">Join by code</button>

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="INVITE CODE"
        className="input w-36 text-sm py-1.5 tracking-wider font-mono" maxLength={12} />
      <input value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="Franchise name (optional)"
        className="input w-44 text-sm py-1.5" maxLength={40} />
      <button onClick={join} disabled={busy} className="btn-primary text-sm disabled:opacity-40">{busy ? 'Joining…' : 'Join'}</button>
      <button onClick={() => { setOpen(false); setErr(null) }} className="btn-ghost text-sm text-slate-400">Cancel</button>
      {err && <span className="text-xs text-red-500 w-full">{err}</span>}
    </div>
  )
}
