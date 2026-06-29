'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

type Msg = { id: string; body: string; createdAt: string | null; userId: string | null; author: string | null; team: string | null; mine: boolean }

function initials(name: string | null) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}
function colorFor(id: string | null) {
  const palette = ['#2563eb', '#16a34a', '#db2777', '#ea580c', '#7c3aed', '#0891b2', '#ca8a04', '#dc2626']
  let h = 0; for (const c of id ?? '') h = (h * 31 + c.charCodeAt(0)) % palette.length
  return palette[h]
}

// Trash-talk thread scoped to a single matchup.
export default function MatchupChat({ leagueId, matchupId, accent }: { leagueId: string; matchupId: string; accent: string }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/leagues/${leagueId}/chat?matchupId=${matchupId}`)
      const d = await res.json()
      setMessages(prev => {
        const next = d.messages ?? []
        if (next.length !== prev.length) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        return next
      })
    } catch { /* ignore */ }
  }, [leagueId, matchupId])

  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t) }, [load])

  async function send() {
    const body = text.trim()
    if (!body) return
    setBusy(true); setText('')
    await fetch(`/api/leagues/${leagueId}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body, matchupId }) })
    setBusy(false); load()
  }

  return (
    <div className="card mt-6">
      <div className="px-4 py-3 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900">Trash Talk</h2>
        <p className="text-xs text-slate-400">Smack talk for this matchup — visible to the whole league.</p>
      </div>
      <div className="max-h-80 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-8">No trash talk yet. Get it started.</p>
        ) : messages.map((m, i) => {
          const showHead = i === 0 || messages[i - 1].userId !== m.userId
          return (
            <div key={m.id} className={`flex gap-2.5 ${m.mine ? 'flex-row-reverse' : ''}`}>
              {showHead
                ? <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style={{ background: colorFor(m.userId) }}>{initials(m.team ?? m.author)}</div>
                : <div className="w-8 flex-shrink-0" />}
              <div className={`max-w-[75%] ${m.mine ? 'text-right' : ''}`}>
                {showHead && <p className="text-[11px] text-slate-400 mb-0.5">{m.team ?? m.author}{m.team && m.author ? ` · ${m.author}` : ''}</p>}
                <div className="inline-block rounded-2xl px-3 py-1.5 text-sm text-white" style={{ background: m.mine ? accent : '#475569' }}>{m.body}</div>
                <p className="text-[10px] text-slate-300 mt-0.5">{m.createdAt ? new Date(m.createdAt + 'Z').toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-slate-100 p-3 flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Talk some trash…" maxLength={1000} className="input flex-1 text-sm" />
        <button onClick={send} disabled={busy || !text.trim()} className="btn-primary text-sm px-4 disabled:opacity-40">Send</button>
      </div>
    </div>
  )
}
