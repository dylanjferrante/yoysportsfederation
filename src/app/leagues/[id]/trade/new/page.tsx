'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import ProposeTradeForm from '@/components/ProposeTradeForm'

export default function LeagueProposeTradePage() {
  const { id } = useParams<{ id: string }>()
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/leagues/${id}/trade`} className="btn-ghost text-slate-500">← Trades</Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Propose Trade</h1>
          <p className="text-slate-500 text-sm">Route players and picks between two or more clubs across any sport</p>
        </div>
      </div>
      <ProposeTradeForm fixedLeagueId={id} doneHref={`/leagues/${id}/trade`} />
    </div>
  )
}
