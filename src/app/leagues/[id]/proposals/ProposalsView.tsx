'use client'

import { useCallback, useEffect, useState } from 'react'
import Markdown from '@/components/Markdown'

type Settings = { policy: 'ANY' | 'COMMISH'; threshold: number; quorum: number; durationDays: number }
type Proposal = {
  id: string; title: string; body: string | null; status: string; author: string
  threshold: number; quorum: number; closesAt: string | null; resolvedAt: string | null; createdAt: string
  yes: number; no: number; abstain: number; ballots: number; myVote: string | null
}
type Data = { settings: Settings; proposals: Proposal[]; memberCount: number; isCommissioner: boolean; canPropose: boolean; canVote: boolean }

const card = 'rounded-xl border border-slate-200 bg-white p-4'
const btn = 'px-3 py-1.5 rounded-lg text-sm font-medium transition'

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

  if (!data) return <div className="text-slate-500 py-12 text-center">Loading proposals…</div>
  const open = data.proposals.filter(p => p.status === 'OPEN')
  const closed = data.proposals.filter(p => p.status !== 'OPEN')

  return (
    <div className="max-w-3xl mx-auto pb-16 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Proposals & Voting</h1>
        <p className="text-sm text-slate-500">
          {data.settings.policy === 'COMMISH' ? 'Only the commissioner can post proposals.' : 'Any member can post a proposal.'}{' '}
          Pass needs <b>{data.settings.threshold}%</b> yes{data.settings.quorum > 0 ? <> · quorum <b>{data.settings.quorum}</b> votes</> : null} · {data.settings.durationDays}-day window.
        </p>
      </div>

      {data.isCommissioner && <VotingSettings settings={data.settings} post={post} />}
      {data.canPropose && <NewProposal post={post} />}

      {open.length > 0 && <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide pt-2">Open ({open.length})</div>}
      {open.map(p => <ProposalCard key={p.id} p={p} data={data} post={post} />)}
      {!open.length && <div className={`${card} text-slate-500 text-sm`}>No open proposals.</div>}

      {closed.length > 0 && <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide pt-3">Resolved</div>}
      {closed.map(p => <ProposalCard key={p.id} p={p} data={data} post={post} />)}
    </div>
  )
}

function VotingSettings({ settings, post }: { settings: Settings; post: any }) {
  const [open, setOpen] = useState(false)
  const [s, setS] = useState(settings)
  return (
    <div className={card}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-sm font-semibold text-slate-700">
        <span>Voting rules (commissioner)</span><span className="text-slate-400">{open ? '▲' : '▼'}</span>
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
            <button onClick={() => post({ action: 'SETTINGS', ...s })} className={`${btn} bg-slate-900 text-white`}>Save voting rules</button>
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
  if (!show) return <button onClick={() => setShow(true)} className={`${btn} bg-slate-900 text-white`}>+ New proposal</button>
  return (
    <div className={`${card} space-y-2`}>
      <input className="input w-full text-sm" value={title} onChange={e => setTitle(e.target.value)} placeholder="Proposal title (e.g. Move trade deadline to Week 10)" />
      <textarea className="input w-full text-sm" rows={4} value={body} onChange={e => setBody(e.target.value)} placeholder="Explain the change… (markdown supported)" />
      <div className="flex justify-end gap-2">
        <button onClick={() => setShow(false)} className={`${btn} bg-slate-100 text-slate-600`}>Cancel</button>
        <button disabled={!title.trim()} onClick={async () => { if (await post({ action: 'CREATE', title, body })) { setTitle(''); setBody(''); setShow(false) } }} className={`${btn} bg-slate-900 text-white disabled:opacity-40`}>Post for a vote</button>
      </div>
    </div>
  )
}

function ProposalCard({ p, data, post }: { p: Proposal; data: Data; post: any }) {
  const decisive = p.yes + p.no
  const pct = decisive ? Math.round((p.yes / decisive) * 100) : 0
  const passing = decisive > 0 && pct >= p.threshold && p.ballots >= p.quorum
  const badge = p.status === 'OPEN'
    ? <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Open</span>
    : p.status === 'PASSED'
      ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Passed ✓</span>
      : <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 font-medium">Failed ✕</span>
  const closesIn = p.closesAt ? Math.max(0, Math.ceil((new Date(p.closesAt).getTime() - Date.now()) / 86_400_000)) : null
  const voteBtn = (v: string, label: string, cls: string) => (
    <button
      disabled={!data.canVote || p.status !== 'OPEN'}
      onClick={() => post({ action: 'VOTE', proposalId: p.id, vote: v })}
      className={`${btn} ${p.myVote === v ? cls : 'bg-slate-100 text-slate-500'} disabled:opacity-40`}>{label}</button>
  )

  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-900">{p.title}</div>
          <div className="text-xs text-slate-400">by {p.author}{p.status === 'OPEN' && closesIn != null ? ` · ${closesIn === 0 ? 'closing today' : `${closesIn}d left`}` : p.resolvedAt ? ` · resolved` : ''}</div>
        </div>
        {badge}
      </div>
      {p.body ? <div className="mt-2"><Markdown text={p.body} /></div> : null}

      {/* Tally bar */}
      <div className="mt-3">
        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden flex">
          <div className="bg-emerald-500" style={{ width: `${decisive ? (p.yes / decisive) * 100 : 0}%` }} />
          <div className="bg-rose-400" style={{ width: `${decisive ? (p.no / decisive) * 100 : 0}%` }} />
        </div>
        <div className="mt-1 text-xs text-slate-500 flex gap-3">
          <span className="text-emerald-600 font-medium">{p.yes} yes</span>
          <span className="text-rose-500 font-medium">{p.no} no</span>
          <span>{p.abstain} abstain</span>
          <span className="ml-auto">{decisive ? `${pct}% yes` : 'no votes yet'} · needs {p.threshold}%{p.quorum ? ` · quorum ${p.ballots}/${p.quorum}` : ''}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {voteBtn('YES', 'Yes', 'bg-emerald-600 text-white')}
        {voteBtn('NO', 'No', 'bg-rose-500 text-white')}
        {voteBtn('ABSTAIN', 'Abstain', 'bg-slate-600 text-white')}
        {p.status === 'OPEN' && (passing ? <span className="text-xs text-emerald-600 ml-1">on track to pass</span> : decisive > 0 ? <span className="text-xs text-slate-400 ml-1">not passing yet</span> : null)}
        {data.isCommissioner && p.status === 'OPEN' && (
          <button onClick={() => post({ action: 'CLOSE', proposalId: p.id })} className={`${btn} bg-slate-100 text-slate-600 ml-auto`}>Close & resolve now</button>
        )}
      </div>
    </div>
  )
}
