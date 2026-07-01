'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'

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

export default function ChatView({ leagueId, leagueName }: { leagueId: string; leagueName: string }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const firstLoad = useRef(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/leagues/${leagueId}/chat`)
      const d = await res.json()
      setMessages(prev => {
        const next = d.messages ?? []
        if (next.length !== prev.length) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: firstLoad.current ? 'auto' : 'smooth' }), 50)
        return next
      })
      firstLoad.current = false
    } catch { /* ignore */ }
  }, [leagueId])

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [load])

  async function send() {
    const body = text.trim()
    if (!body) return
    setBusy(true); setText('')
    await fetch(`/api/leagues/${leagueId}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) })
    setBusy(false); load()
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col" style={{ minHeight: 'calc(100vh - 3.5rem)' }}>
      <div className="flex items-center gap-3 mb-4">
        <Link href={`/leagues/${leagueId}`} className="btn-ghost text-slate-500">← League</Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">League Chat</h1>
          <p className="text-sm text-slate-500">{leagueName}</p>
        </div>
      </div>

      <div className="card flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-10">No messages yet — say hello to the league.</p>
          ) : messages.map((m, i) => {
            const showHead = i === 0 || messages[i - 1].userId !== m.userId
            return (
              <div key={m.id} className={`flex gap-2.5 ${m.mine ? 'flex-row-reverse' : ''}`}>
                {showHead
                  ? <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style={{ background: colorFor(m.userId) }}>{initials(m.team ?? m.author)}</div>
                  : <div className="w-8 flex-shrink-0" />}
                <div className={`max-w-[75%] ${m.mine ? 'text-right' : ''}`}>
                  {showHead && <p className="text-[11px] text-slate-400 mb-0.5">{m.team ?? m.author}{m.team && m.author ? ` · ${m.author}` : ''}</p>}
                  <div className={`inline-block rounded-2xl px-3 py-1.5 text-sm ${m.mine ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'}`}>{m.body}</div>
                  <p className="text-[10px] text-slate-300 mt-0.5">{m.createdAt ? new Date(m.createdAt + 'Z').toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</p>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-slate-100 p-3 flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Message the league…" maxLength={1000} className="input flex-1 text-sm" />
          <button onClick={send} disabled={busy || !text.trim()} className="btn-primary text-sm px-4 disabled:opacity-40">Send</button>
        </div>
      </div>
    </div>
  )
}
