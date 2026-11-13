'use client'

import { useCallback, useEffect, useState } from 'react'
import Markdown from '@/components/Markdown'
import { PageTitle } from '@/components/ysf/ui'

type Settings = { policy: 'ANY' | 'COMMISH'; threshold: number; quorum: number; durationDays: number }
type Proposal = {
  id: string; title: string; body: string | null; status: string; author: string
  threshold: number; quorum: number; closesAt: string | null; resolvedAt: string | null; createdAt: string
  yes: number; no: number; abstain: number; ballots: number; myVote: string | null
}
type Data = { settings: Settings; proposals: Proposal[]; memberCount: number; isCommissioner: boolean; canPropose: boolean; canVote: boolean }

const card = 'card p-4'
const btn = 'inline-flex items-center justify-center h-9 px-3.5 rounded-lg font-display text-[12px] font-bold tracking-[.08em] leading-none border border-black'

export default function ProposalsView({ leagueId }: { leagueId: string }) {
  const [data, setData] = useState<Data | null>(null)
  const base = `/api/leagues/${leagueId}/proposals`
  const load = useCallback(async () => { const r = await fetch(base); if (r.ok) setData(await r.json()) }, [base])
  useEffect(() => { load() }, [load])
  const post = useCallback(async (b: Record<string, unknown>) => {
    const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
    if (r.ok) await load()
    else { const j = await r.json().catch(() => ({})); alert(j.error ?? 'Error') }
    return r.ok
  }, [base, load])

  if (!data) return <div className="card p-8 text-center font-semibold text-ink-500">Loading votes…</div>
  const open = data.proposals.filter(p => p.status === 'OPEN')
  const closed = data.proposals.filter(p => p.status !== 'OPEN')

  return (
    <div className="flex flex-col gap-4">
      <PageTitle eyebrow={`Pass at ${data.settings.threshold}% yes${data.settings.quorum > 0 ? ` · quorum ${data.settings.quorum}` : ''} · ${data.settings.durationDays}-day window`} title="VOTES" />

      {data.isCommissioner && <VotingSettings settings={data.settings} post={post} />}
      {data.canPropose && <NewProposal post={post} />}

      {open.length > 0 && <div className="ui text-[12px] tracking-[.14em] text-ink-500 border-b-2 border-black pb-1.5">OPEN · {open.length}</div>}
      {open.map(p => <ProposalCard key={p.id} p={p} data={data} post={post} />)}
      {!open.length && <div className={`${card} text-ink-500 font-semibold`}>No open votes</div>}

      {closed.length > 0 && <div className="ui text-[12px] tracking-[.14em] text-ink-500 border-b-2 border-black pb-1.5 mt-2">RESOLVED</div>}
      {closed.map(p => <ProposalCard key={p.id} p={p} data={data} post={post} />)}
    </div>
  )
}

function VotingSettings({ settings, post }: { settings: Settings; post: any }) {
  const [open, setOpen] = useState(false)
  const [s, setS] = useState(settings)
  return (
    <div className={card}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-sm font-semibold text-black">
        <span>Voting rules (commissioner)</span><span className="text-ink-500">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">Who can propose
            <select className="select w-full mt-1" value={s.policy} onChange={e => setS({ ...s, policy: e.target.value as any })}>
              <option value="ANY">Any member</option>
              <option value="COMMISH">Commissioner only</option>
            </select>
          </label>
          <label className="text-sm">Pass threshold (% yes)
            <input type="number" min={1} max={100} className="input w-full mt-1" value={s.threshold} onChange={e => setS({ ...s, threshold: +e.target.value })} />
          </label>
          <label className="text-sm">Quorum (min votes, 0 = none)
            <input type="number" min={0} className="input w-full mt-1" value={s.quorum} onChange={e => setS({ ...s, quorum: +e.target.value })} />
          </label>
          <label className="text-sm">Voting window (days)
            <input type="number" min={1} className="input w-full mt-1" value={s.durationDays} onChange={e => setS({ ...s, durationDays: +e.target.value })} />
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <button onClick={() => post({ action: 'SETTINGS', ...s })} className={`${btn} bg-black text-white`}>Save voting rules</button>
          </div>
        </div>
      )}
    </div>
  )
}

function NewProposal({ post }: { post: any }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [show, setShow] = useState(false)
  if (!show) return <button onClick={() => setShow(true)} className={`${btn} bg-black text-white`}>+ New proposal</button>
  return (
    <div className={`${card} space-y-2`}>
      <input className="input w-full text-sm" value={title} onChange={e => setTitle(e.target.value)} placeholder="Proposal title (e.g. Move trade deadline to Week 10)" />
      <textarea className="input w-full text-sm" rows={4} value={body} onChange={e => setBody(e.target.value)} placeholder="Explain the change… (markdown supported)" />
      <div className="flex justify-end gap-2">
        <button onClick={() => setShow(false)} className={`${btn} bg-ink-50 text-slate-600`}>Cancel</button>
        <button disabled={!title.trim()} onClick={async () => { if (await post({ action: 'CREATE', title, body })) { setTitle(''); setBody(''); setShow(false) } }} className={`${btn} bg-black text-white disabled:opacity-40`}>Post for a vote</button>
      </div>
    </div>
  )
}

function ProposalCard({ p, data, post }: { p: Proposal; data: Data; post: any }) {
  const decisive = p.yes + p.no
  const pct = decisive ? Math.round((p.yes / decisive) * 100) : 0
  const passing = decisive > 0 && pct >= p.threshold && p.ballots >= p.quorum
  const badge = p.status === 'OPEN'
    ? <span className="ui inline-flex items-center justify-center h-[22px] px-2 rounded-[2px] text-[11px] font-bold leading-none bg-black text-white">OPEN</span>
    : p.status === 'PASSED'
      ? <span className="ui inline-flex items-center justify-center h-[22px] px-2 rounded-[2px] text-[11px] font-bold leading-none bg-[#177245] text-white">PASSED</span>
      : <span className="ui inline-flex items-center justify-center h-[22px] px-2 rounded-[2px] text-[11px] font-bold leading-none bg-[#ba0c2f] text-white">FAILED</span>
  const closesIn = p.closesAt ? Math.max(0, Math.ceil((new Date(p.closesAt).getTime() - Date.now()) / 86_400_000)) : null
  const voteBtn = (v: string, label: string, cls: string) => (
    <button
      disabled={!data.canVote || p.status !== 'OPEN'}
      onClick={() => post({ action: 'VOTE', proposalId: p.id, vote: v })}
      className={`${btn} ${p.myVote === v ? cls : 'bg-white text-black'} disabled:opacity-40`}>{label.toUpperCase()}</button>
  )

  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="disp text-[20px] font-extrabold leading-tight">{p.title}</div>
          <div className="text-[12px] text-ink-500 mt-0.5">by {p.author}{p.status === 'OPEN' && closesIn != null ? ` · ${closesIn === 0 ? 'closing today' : `${closesIn}d left`}` : p.resolvedAt ? ` · resolved` : ''}</div>
        </div>
        {badge}
      </div>
      {p.body ? <div className="mt-2"><Markdown text={p.body} /></div> : null}

      {/* Tally bar */}
      <div className="mt-3">
        <div className="h-2 w-full rounded-sm bg-ink-50 overflow-hidden flex">
          <div className="bg-[#177245]" style={{ width: `${decisive ? (p.yes / decisive) * 100 : 0}%` }} />
          <div className="bg-[#ba0c2f]" style={{ width: `${decisive ? (p.no / decisive) * 100 : 0}%` }} />
        </div>
        <div className="mt-1.5 text-[12px] text-ink-500 flex flex-wrap gap-3">
          <span className="text-[#177245] font-bold">{p.yes} yes</span>
          <span className="text-[#ba0c2f] font-bold">{p.no} no</span>
          <span>{p.abstain} abstain</span>
          <span className="ml-auto">{decisive ? `${pct}% yes` : 'no votes yet'} · needs {p.threshold}%{p.quorum ? ` · quorum ${p.ballots}/${p.quorum}` : ''}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {voteBtn('YES', 'Yes', 'bg-black text-white')}
        {voteBtn('NO', 'No', 'bg-black text-white')}
        {voteBtn('ABSTAIN', 'Abstain', 'bg-black text-white')}
        {p.status === 'OPEN' && (passing ? <span className="ui text-[11px] text-[#177245] ml-1">ON TRACK TO PASS</span> : decisive > 0 ? <span className="ui text-[11px] text-ink-500 ml-1">NOT PASSING YET</span> : null)}
        {data.isCommissioner && p.status === 'OPEN' && (
          <button onClick={() => post({ action: 'CLOSE', proposalId: p.id })} className={`${btn} bg-white text-black ml-auto`}>CLOSE &amp; RESOLVE NOW</button>
        )}
      </div>
    </div>
  )
}
