'use client'

// DEV ONLY: a window the Fantrax tab opens and postMessages pulled pages to; each one is saved
// through /api/dev/fantrax-dump (same origin). Only accepts messages from www.fantrax.com.
import { useEffect, useState } from 'react'

export default function FantraxReceiver() {
  const [n, setN] = useState(0)
  const [last, setLast] = useState('')
  useEffect(() => {
    const on = async (e: MessageEvent) => {
      if (e.origin !== 'https://www.fantrax.com' || !e.data?.leagueId) return
      const r = await fetch('/api/dev/fantrax-dump', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e.data) })
      ;(e.source as Window | null)?.postMessage({ ack: e.data.name, status: r.status }, e.origin)
      setN(x => x + 1); setLast(`${e.data.leagueId}/${e.data.name} → ${r.status}`)
    }
    window.addEventListener('message', on)
    window.opener?.postMessage({ ready: true }, 'https://www.fantrax.com')
    return () => window.removeEventListener('message', on)
  }, [])
  if (process.env.NODE_ENV !== 'development') return null
  return <main style={{ padding: 24, fontFamily: 'monospace' }}>Fantrax receiver · saved {n} · {last}</main>
}
