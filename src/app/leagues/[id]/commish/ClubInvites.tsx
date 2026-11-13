'use client'
// Commissioner: which clubs their owners have claimed, and a one-time invite link for each that hasn't
import { useCallback, useEffect, useState } from 'react'

type Row = { id: string; name: string; abbreviation: string; logo: string | null; owner: string | null; email: string | null; claimed: boolean; url: string | null; expires: string | null }

export default function ClubInvites({ leagueId }: { leagueId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const load = useCallback(async () => { const r = await fetch(`/api/leagues/${leagueId}/invites`); setRows(r.ok ? await r.json() : []) }, [leagueId])
  useEffect(() => { load() }, [load])
  const create = async (teamId: string) => { await fetch(`/api/leagues/${leagueId}/invites`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId }) }); await load() }
  const copy = async (r: Row) => { if (!r.url) return; try { await navigator.clipboard.writeText(r.url) } catch { /* shown below */ } setCopied(r.id) }
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const btn = 'ui inline-flex items-center justify-center h-8 px-3 rounded-[3px] text-[11px] font-bold leading-none border whitespace-nowrap'
  return (
    <div className="card overflow-hidden mb-4">
      <div className="ui px-4 py-2.5 border-b-2 border-black text-[12px] font-bold tracking-[.12em]">CLUB ACCOUNTS</div>
      {rows === null && <div className="p-4 text-ink-400">Loading…</div>}
      {rows?.map(r => (
        <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-t border-ink-50">
          <span className="w-7 h-7 inline-flex items-center justify-center flex-none">{r.logo && <img src={r.logo} alt="" className="w-7 h-7 object-contain" />}</span>
          <span className="flex-1 min-w-[180px]"><span className="font-bold block">{r.name}</span>
            <span className="text-[13px] text-ink-500">{r.claimed ? `${r.owner ?? ''} · ${r.email}` : r.url ? `Invite open until ${fmt(r.expires!)}` : 'Not claimed'}</span>
            {copied === r.id && r.url && <span className="block text-[12px] text-ink-600 break-all mt-0.5">{r.url}</span>}</span>
          {r.claimed
            ? <span className="ui inline-flex items-center justify-center h-[22px] px-2 rounded-[2px] text-[11px] font-bold leading-none text-white bg-[#177245]">CLAIMED</span>
            : <span className="flex gap-1.5">
                {r.url && <button onClick={() => copy(r)} className={`${btn} border-black bg-black text-white`}>{copied === r.id ? 'COPIED' : 'COPY LINK'}</button>}
                <button onClick={() => create(r.id)} className={`${btn} border-black bg-white text-black`}>{r.url ? 'NEW LINK' : 'CREATE LINK'}</button>
              </span>}
        </div>
      ))}
    </div>
  )
}
