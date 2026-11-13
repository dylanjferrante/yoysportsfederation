'use client'

// Add a free agent or claim a waiver player (FAAB bid), optionally dropping someone from the
// same league. Submits through the existing waivers API.
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type P = { id: string; name: string; team: string | null; pos: string }
type R = { id: string; name: string; slot: string; team: string | null; position: string }

export default function ClaimButton({ leagueId, player, code, waivers, faab, roster }: { leagueId: string; player: P; code: string; waivers: boolean; faab: number; roster: R[] }) {
  const [open, setOpen] = useState(false)
  const [drop, setDrop] = useState('')
  const [bid, setBid] = useState(0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const router = useRouter()
  const submit = async () => {
    setBusy(true); setMsg(null)
    const r = await fetch(`/api/leagues/${leagueId}/waivers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'SUBMIT', addPlayerId: player.id, dropPlayerId: drop || undefined, bidAmount: bid }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg(d.error ?? 'Could not submit'); return }
    setMsg(waivers || bid > 0 ? 'Claim submitted' : 'Request submitted'); router.refresh()
  }
  const btn = 'inline-flex items-center justify-center h-8 px-3 rounded-lg font-display text-[12px] font-bold tracking-[.06em] leading-none'
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${btn} bg-black text-white`}>{waivers ? 'CLAIM' : 'ADD'}</button>
      {open && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 text-left" onClick={e => e.stopPropagation()}>
            <div className="ui text-[12px] tracking-[.14em] text-ink-500">{waivers ? 'WAIVER CLAIM' : 'ADD PLAYER'}</div>
            <div className="text-[18px] mt-1"><b>{player.name}</b> <span className="text-ink-500">| {player.team ? `${player.team}, ` : ''}{player.pos}</span></div>
            <label className="block mt-4">
              <span className="ui text-[11px] tracking-[.12em] text-ink-500">DROP ({code})</span>
              <select value={drop} onChange={e => setDrop(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-lg border border-ink-200 bg-white text-[14px]">
                <option value="">Nobody (open roster spot)</option>
                {roster.map(p => <option key={p.id} value={p.id}>{p.name} | {p.team ? `${p.team}, ` : ''}{p.position} · {p.slot}</option>)}
              </select>
            </label>
            <label className="block mt-3">
              <span className="ui text-[11px] tracking-[.12em] text-ink-500">FAAB BID · ${faab} LEFT</span>
              <input type="number" min={0} max={faab} value={bid} onChange={e => setBid(Math.max(0, Math.min(faab, Number(e.target.value) || 0)))} className="mt-1 w-full h-10 px-3 rounded-lg border border-ink-200 text-[14px] tabular-nums" />
            </label>
            {msg && <div className="mt-3 text-[13px] font-semibold">{msg}</div>}
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setOpen(false)} className={`${btn} border border-ink-200`}>CLOSE</button>
              <button type="button" disabled={busy} onClick={submit} className={`${btn} bg-black text-white disabled:opacity-50`}>{busy ? 'SUBMITTING…' : waivers ? 'SUBMIT CLAIM' : 'SUBMIT'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
