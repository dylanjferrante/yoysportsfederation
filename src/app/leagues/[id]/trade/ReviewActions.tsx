'use client'
// Buttons for a trade in its 48-hour review: flag it as bad faith, vote to veto, or vote to override a veto
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ReviewActions({ tradeId, can }: { tradeId: string; can: { complain: boolean; veto: boolean; override: boolean } }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const act = async (action: 'COMPLAIN' | 'VETO' | 'OVERRIDE') => {
    setBusy(true); setErr(null)
    const r = await fetch(`/api/trades/${tradeId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) setErr(d.error ?? 'Something went wrong')
    setBusy(false); router.refresh()
  }
  const btn = 'inline-flex items-center justify-center h-9 px-3 rounded-lg font-display text-[12px] font-bold tracking-[.08em] leading-none border disabled:opacity-50'
  if (!can.complain && !can.veto && !can.override) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {can.complain && <button disabled={busy} onClick={() => act('COMPLAIN')} className={`${btn} bg-white text-black border-black`}>FLAG AS BAD FAITH</button>}
      {can.veto && <button disabled={busy} onClick={() => act('VETO')} className={`${btn} text-white border-[#ba0c2f]`} style={{ background: '#ba0c2f' }}>VOTE TO VETO</button>}
      {can.override && <button disabled={busy} onClick={() => act('OVERRIDE')} className={`${btn} text-white border-[#177245]`} style={{ background: '#177245' }}>VOTE TO OVERRIDE</button>}
      {err && <span className="text-[13px] font-semibold" style={{ color: '#ba0c2f' }}>{err}</span>}
    </div>
  )
}
