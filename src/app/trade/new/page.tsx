'use client'

import Link from 'next/link'
import ProposeTradeForm from '@/components/ProposeTradeForm'

export default function ProposeTradePage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/trade" className="btn-ghost text-slate-500">← Back</Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Propose Trade</h1>
          <p className="text-slate-500 text-sm">Route players and picks between two or more clubs across any sport</p>
        </div>
      </div>
      <ProposeTradeForm />
    </div>
  )
}
