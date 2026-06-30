'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { sportMeta, tradeStatusClass } from '@/lib/utils'

type TeamRef = { id: string; name: string; abbreviation: string }
type TradeItem = {
  id: string; direction: string | null
  fromTeam?: TeamRef | null; toTeam?: TeamRef | null
  player?: { name: string; sport: string; position: string; realTeam: string } | null
  pick?: { sport: string | null; round: number; year: number } | null
}
type Trade = {
  id: string; status: string; note: string | null; createdAt: string; leagueId?: string | null
  initiatorTeam?: { id: string; name: string; abbreviation?: string }
  recipientTeam?: { id: string; name: string; abbreviation?: string }
  items: TradeItem[]
}

export default function LeagueTradeCenter() {
  const { id } = useParams<{ id: string }>()
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/trades').then(r => r.json()).then(d => { setTrades(Array.isArray(d) ? d.filter((t: Trade) => t.leagueId === id) : []); setLoading(false) })
  }, [id])

  async function respond(tid: string, action: 'ACCEPT' | 'REJECT' | 'CANCEL') {
    await fetch(`/api/trades/${tid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    setTrades(ts => ts.map(t => t.id === tid ? { ...t, status: action === 'ACCEPT' ? 'ACCEPTED' : action === 'REJECT' ? 'REJECTED' : 'CANCELLED' } : t))
  }

  const pending = trades.filter(t => t.status === 'PENDING')
  const completed = trades.filter(t => t.status !== 'PENDING')

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">Trade Center</h1>
          <p className="text-slate-500 text-sm">Propose and manage trades in this league</p>
        </div>
        <Link href={`/trade/new?league=${id}`} className="btn-primary">+ Propose Trade</Link>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading trades…</div>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Pending ({pending.length})</h2>
            {pending.length === 0 ? (
              <div className="card p-8 text-center text-slate-400">
                No pending trades.
                <br /><Link href={`/trade/new?league=${id}`} className="text-blue-600 hover:underline text-sm mt-2 inline-block">Propose one →</Link>
              </div>
            ) : pending.map(trade => <TradeCard key={trade.id} trade={trade} onAction={respond} />)}
          </div>
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

function TradeCard({ trade, onAction, readonly }: { trade: Trade; onAction: (id: string, action: 'ACCEPT' | 'REJECT' | 'CANCEL') => void; readonly?: boolean }) {
  const partAbbr = new Set<string>()
  trade.items.forEach(i => { if (i.fromTeam) partAbbr.add(i.fromTeam.abbreviation); if (i.toTeam) partAbbr.add(i.toTeam.abbreviation) })
  if (partAbbr.size === 0) { if (trade.initiatorTeam?.abbreviation) partAbbr.add(trade.initiatorTeam.abbreviation); if (trade.recipientTeam?.abbreviation) partAbbr.add(trade.recipientTeam.abbreviation) }
  const header = partAbbr.size ? [...partAbbr].join(' ↔ ') : `${trade.initiatorTeam?.name} ↔ ${trade.recipientTeam?.name}`
  const multi = partAbbr.size > 2

  function assetLabel(item: TradeItem) {
    if (item.player) return { sport: item.player.sport, label: item.player.name, sub: `${item.player.position} · ${item.player.realTeam}` }
    if (item.pick) return { sport: item.pick.sport ?? 'OVERALL', label: `${item.pick.year} ${item.pick.sport ?? ''} Rd ${item.pick.round}`, sub: 'Draft Pick' }
    return null
  }

  return (
    <div className="card mb-3">
      <div className="card-header flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-medium text-slate-900 truncate">{header}</span>
          {multi && <span className="badge bg-purple-100 text-purple-700">{partAbbr.size}-team</span>}
          <span className={`badge border ${tradeStatusClass(trade.status)} flex-shrink-0`}>{trade.status}</span>
        </div>
        <span className="text-xs text-slate-400 flex-shrink-0">{new Date(trade.createdAt ?? '').toLocaleDateString()}</span>
      </div>

      <div className="p-4 space-y-1.5">
        {trade.items.map(item => {
          const a = assetLabel(item)
          if (!a) return null
          const meta = sportMeta(a.sport)
          const from = item.fromTeam?.abbreviation ?? trade.initiatorTeam?.abbreviation
          const to = item.toTeam?.abbreviation ?? trade.recipientTeam?.abbreviation
          return (
            <div key={item.id} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${meta.light}`}>{a.sport}</span>
              <span className="font-medium text-slate-900">{a.label}</span>
              <span className="text-slate-400 text-xs hidden sm:inline">{a.sub}</span>
              <span className="ml-auto text-xs text-slate-500 font-medium whitespace-nowrap">{from} → {to}</span>
            </div>
          )
        })}
      </div>

      {trade.note && <div className="px-4 pb-3"><p className="text-xs text-slate-500 italic">&quot;{trade.note}&quot;</p></div>}

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
