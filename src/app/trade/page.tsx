'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { sportMeta, tradeStatusClass } from '@/lib/utils'

type TradeItem = {
  id: string; direction: string
  player?: { name: string; sport: string; position: string; realTeam: string } | null
  pick?: { sport: string; round: number; year: number } | null
}
type Trade = {
  id: string; status: string; note: string | null; createdAt: string
  initiatorTeam?: { id: string; name: string }
  recipientTeam?: { id: string; name: string }
  items: TradeItem[]
}

export default function TradeCenterPage() {
  const { data: session } = useSession()
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/trades').then(r => r.json()).then(d => { setTrades(Array.isArray(d) ? d : []); setLoading(false) })
  }, [])

  async function respond(id: string, action: 'ACCEPT' | 'REJECT' | 'CANCEL') {
    await fetch(`/api/trades/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    setTrades(ts => ts.map(t => t.id === id ? { ...t, status: action === 'ACCEPT' ? 'ACCEPTED' : action === 'REJECT' ? 'REJECTED' : 'CANCELLED' } : t))
  }

  const pending   = trades.filter(t => t.status === 'PENDING')
  const completed = trades.filter(t => t.status !== 'PENDING')

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Trade Center</h1>
          <p className="text-slate-500 text-sm mt-0.5">Propose and manage cross-sport trades</p>
        </div>
        <Link href="/trade/new" className="btn-primary">+ Propose Trade</Link>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading trades…</div>
      ) : (
        <div className="space-y-6">
          {/* Pending */}
          <div>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Pending ({pending.length})</h2>
            {pending.length === 0 ? (
              <div className="card p-8 text-center text-slate-400">
                No pending trades.
                <br /><Link href="/trade/new" className="text-blue-600 hover:underline text-sm mt-2 inline-block">Propose one →</Link>
              </div>
            ) : pending.map(trade => (
              <TradeCard key={trade.id} trade={trade} onAction={respond} />
            ))}
          </div>

          {/* History */}
          {completed.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">History ({completed.length})</h2>
              {completed.map(trade => <TradeCard key={trade.id} trade={trade} onAction={respond} readonly />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TradeCard({ trade, onAction, readonly }: { trade: Trade; onAction: (id: string, action: 'ACCEPT'|'REJECT'|'CANCEL') => void; readonly?: boolean }) {
  const giving    = trade.items.filter(i => i.direction === 'GIVING')
  const receiving = trade.items.filter(i => i.direction === 'RECEIVING')

  function ItemPill({ item }: { item: TradeItem }) {
    if (item.player) {
      const meta = sportMeta(item.player.sport)
      return (
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${meta.light}`}>{item.player.sport}</span>
          <span className="font-medium text-slate-900">{item.player.name}</span>
          <span className="text-slate-400 text-xs">{item.player.position} · {item.player.realTeam}</span>
        </div>
      )
    }
    if (item.pick) {
      const meta = sportMeta(item.pick.sport)
      return (
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${meta.light}`}>{item.pick.sport}</span>
          <span className="font-medium text-slate-900">{item.pick.year} {item.pick.sport} Rd {item.pick.round}</span>
          <span className="text-slate-400 text-xs">Draft Pick</span>
        </div>
      )
    }
    return null
  }

  return (
    <div className="card mb-3">
      <div className="card-header flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-medium text-slate-900 truncate">
            {trade.initiatorTeam?.name} ↔ {trade.recipientTeam?.name}
          </span>
          <span className={`badge border ${tradeStatusClass(trade.status)} flex-shrink-0`}>
            {trade.status}
          </span>
        </div>
        <span className="text-xs text-slate-400 flex-shrink-0">
          {new Date(trade.createdAt ?? '').toLocaleDateString()}
        </span>
      </div>

      <div className="p-4 grid sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase mb-2">{trade.initiatorTeam?.name} gives</p>
          <div className="space-y-1.5">
            {giving.map(i => <ItemPill key={i.id} item={i} />)}
            {giving.length === 0 && <p className="text-sm text-slate-300">Nothing</p>}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase mb-2">{trade.recipientTeam?.name} gives</p>
          <div className="space-y-1.5">
            {receiving.map(i => <ItemPill key={i.id} item={i} />)}
            {receiving.length === 0 && <p className="text-sm text-slate-300">Nothing</p>}
          </div>
        </div>
      </div>

      {trade.note && (
        <div className="px-4 pb-3">
          <p className="text-xs text-slate-500 italic">"{trade.note}"</p>
        </div>
      )}

      {!readonly && trade.status === 'PENDING' && (
        <div className="px-4 pb-4 flex gap-2">
          <button onClick={() => onAction(trade.id, 'ACCEPT')} className="btn-primary bg-green-600 hover:bg-green-500 text-sm py-1.5">Accept</button>
          <button onClick={() => onAction(trade.id, 'REJECT')} className="btn-secondary text-red-600 border-red-200 text-sm py-1.5">Reject</button>
          <button onClick={() => onAction(trade.id, 'CANCEL')} className="btn-ghost text-sm">Cancel</button>
        </div>
      )}
    </div>
  )
}
