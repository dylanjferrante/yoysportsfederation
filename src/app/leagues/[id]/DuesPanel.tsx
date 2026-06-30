'use client'

import { useEffect, useState, useCallback } from 'react'

type Member = { userId: string; userName: string | null; role: string; duesPaid: boolean; team: { id: string; name: string } | null }

export default function DuesPanel({ leagueId, isCommissioner }: { leagueId: string; isCommissioner: boolean }) {
  const [amount, setAmount] = useState(0)
  const [members, setMembers] = useState<Member[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch(`/api/leagues/${leagueId}/dues`).then(r => r.json()).then(d => { setAmount(d.amount ?? 0); setMembers(d.members ?? []) })
  }, [leagueId])
  useEffect(() => { load() }, [load])

  if (amount <= 0) return null

  async function toggle(userId: string, paid: boolean) {
    setBusy(userId)
    await fetch(`/api/leagues/${leagueId}/dues`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, paid }) })
    setBusy(null); load()
  }

  const paidCount = members.filter(m => m.duesPaid).length
  const collected = paidCount * amount
  const total = members.length * amount

  return (
    <div className="card mt-8">
      <div className="card-header flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">League Dues</h2>
        <span className="text-sm text-slate-500">${collected} / ${total} collected · ${amount} per club</span>
      </div>
      <ul className="divide-y divide-slate-50">
        {members.map(m => (
          <li key={m.userId} className="flex items-center gap-3 px-4 py-2.5">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${m.duesPaid ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>{m.duesPaid ? 'PAID' : 'DUE'}</span>
            <span className="flex-1 text-sm text-slate-700">{m.team?.name ?? m.userName}<span className="text-slate-400"> · {m.userName}</span></span>
            <span className="text-sm tabular-nums text-slate-500">${amount}</span>
            {isCommissioner && (
              <button onClick={() => toggle(m.userId, !m.duesPaid)} disabled={busy === m.userId}
                className={`text-xs px-2 py-1 rounded font-medium ${m.duesPaid ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-green-600 text-white hover:bg-green-500'}`}>
                {m.duesPaid ? 'Mark unpaid' : 'Mark paid'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
