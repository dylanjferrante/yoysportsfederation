'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

type Notif = { id: string; message: string; link: string | null; isRead: boolean; createdAt: string }

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const data = await res.json()
      setItems(data.items ?? [])
      setUnread(data.unread ?? 0)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  async function openMenu() {
    setOpen(true)
    if (unread > 0) {
      await fetch('/api/notifications', { method: 'POST' }).catch(() => {})
      setUnread(0)
      setItems(prev => prev.map(n => ({ ...n, isRead: true })))
    }
  }

  return (
    <div className="relative">
      <button onClick={() => (open ? setOpen(false) : openMenu())}
        className="relative w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors" aria-label="Notifications">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-white text-slate-900 rounded-xl shadow-lg border border-slate-100 py-1 z-20 max-h-96 overflow-y-auto">
            <p className="px-4 py-2 text-xs font-semibold text-slate-400 border-b border-slate-100 uppercase tracking-wide">Notifications</p>
            {items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-400 text-center">You're all caught up.</p>
            ) : items.map(n => {
              const body = (
                <div className={`px-4 py-2.5 hover:bg-slate-50 ${n.isRead ? '' : 'bg-blue-50/50'}`}>
                  <p className="text-sm text-slate-700">{n.message}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{new Date(n.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                </div>
              )
              return n.link
                ? <Link key={n.id} href={n.link} onClick={() => setOpen(false)} className="block">{body}</Link>
                : <div key={n.id}>{body}</div>
            })}
          </div>
        </>
      )}
    </div>
  )
}
