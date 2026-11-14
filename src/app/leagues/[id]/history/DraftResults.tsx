'use client'

import { useState } from 'react'
import { YSF_LEAGUES } from '@/lib/ysf'

type D = { sport: string; code: string; when: string; picks: { n: number; round: number; owner: string; via: string | null; player: string }[] }

export default function DraftResults({ drafts }: { drafts: D[] }) {
  const [sp, setSp] = useState(drafts[0].sport)
  const [round, setRound] = useState(1)
  const d = drafts.find(x => x.sport === sp)!
  const rounds = Math.max(...d.picks.map(p => p.round))
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="ui text-[12px] tracking-[.12em] text-ink-500"><span className="ysf-case">{d.code}</span> ROOKIE DRAFT · ROUND {round} · {d.when.toUpperCase()}</div>
        <div className="flex gap-1">
          {drafts.map(x => { const L = YSF_LEAGUES.find(l => l.sport === x.sport)!; const on = x.sport === sp; return (
            <button key={x.sport} onClick={() => { setSp(x.sport); setRound(1) }} className="inline-flex items-center justify-center h-7 px-2 rounded font-display text-[11px] font-bold leading-none border" style={{ background: on ? L.color : 'var(--surface)', color: on ? '#fff' : 'var(--fg)', borderColor: on ? L.color : 'var(--line-2)' }}><span className="ysf-case">{x.code}</span></button>) })}
        </div>
      </div>
      <div className="flex gap-1 mb-2">{Array.from({ length: rounds }, (_, i) => i + 1).map(r => (
        <button key={r} onClick={() => setRound(r)} className="inline-flex items-center justify-center h-7 w-9 rounded font-display text-[11px] font-bold leading-none border" style={{ background: r === round ? '#000' : 'var(--surface)', color: r === round ? '#fff' : 'var(--fg)', borderColor: r === round ? '#000' : 'var(--line-2)' }}>R{r}</button>))}</div>
      {d.picks.filter(p => p.round === round).map(p => (
        <div key={p.n} className="grid grid-cols-[44px_52px_minmax(0,1fr)] gap-2 py-1.5 border-t border-ink-50 text-[14px]">
          <span className="text-ink-500 tabular-nums">{p.round}.{String(((p.n - 1) % 12) + 1).padStart(2, '0')}</span>
          <span className="font-bold">{p.owner}</span>
          <span className="min-w-0"><span className="ysf-case">{p.player}</span>{p.via && <span className="text-ink-500"> · via {p.via}</span>}</span>
        </div>
      ))}
    </div>
  )
}
