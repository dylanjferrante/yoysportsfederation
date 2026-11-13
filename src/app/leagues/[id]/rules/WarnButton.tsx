'use client'
// Commissioner-only: send a club a warning about a Compliance finding
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function WarnButton({ leagueId, teamId, sport, rule, detail }: { leagueId: string; teamId: string; sport: string; rule: string; detail: string }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'ask' | 'busy' | 'err'>('idle')
  const send = async () => {
    setState('busy')
    const r = await fetch(`/api/leagues/${leagueId}/compliance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId, sport, rule, detail }) })
    if (!r.ok) return setState('err')
    router.refresh()
  }
  const btn = 'ui inline-flex items-center justify-center h-[26px] px-2 rounded-[3px] text-[11px] font-bold leading-none border whitespace-nowrap'
  if (state === 'ask') return (
    <span className="inline-flex gap-1">
      <button onClick={send} className={`${btn} text-white border-[#ba0c2f]`} style={{ background: '#ba0c2f' }}>SEND</button>
      <button onClick={() => setState('idle')} className={`${btn} border-black bg-white`}>CANCEL</button>
    </span>
  )
  return <button disabled={state === 'busy'} onClick={() => setState('ask')} className={`${btn} border-black bg-white text-black`}>{state === 'err' ? 'RETRY' : 'WARN'}</button>
}
