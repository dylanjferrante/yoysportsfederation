'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

type H = { id: string; category: string; sport?: string; text: string; href: string }

// ESPN BottomLine-style federation ticker: a continuous, pause-on-hover marquee
// of headlines (scores, streaks, standings, transactions, …). Each item is a
// deep link. Refreshes every 45s while the tab is visible (DB read, no API cost).
export default function Ticker({ leagueId }: { leagueId: string }) {
  const [items, setItems] = useState<H[]>([])

  useEffect(() => {
    let alive = true
    const load = () => fetch(`/api/leagues/${leagueId}/ticker`).then(r => r.json()).then(d => { if (alive) setItems(d.headlines ?? []) }).catch(() => {})
    load()
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load() }, 45_000)
    return () => { alive = false; clearInterval(iv) }
  }, [leagueId])

  if (!items.length) return null
  const duration = Math.max(40, items.length * 7) // slower with more items, so it stays readable

  const Row = ({ k }: { k: string }) => (
    <div className="row" aria-hidden={k === 'b'}>
      {items.map((h, i) => (
        <Link key={`${k}-${i}`} href={h.href} className="item">
          {h.sport && <span className="chip" style={{ background: sportMeta(h.sport).hex }}>{sportMeta(h.sport).emoji} {h.sport}</span>}
          <span className="text">{h.text}</span>
          <span className="sep">•</span>
        </Link>
      ))}
    </div>
  )

  return (
    <div className="wrap">
      <span className="label">📡 Federation&nbsp;Wire</span>
      <div className="viewport">
        <div className="track" style={{ animationDuration: `${duration}s` }}>
          <Row k="a" />
          <Row k="b" />
        </div>
      </div>
      <style jsx>{`
        .wrap { display: flex; align-items: stretch; background: #0f172a; color: #e2e8f0; border-radius: 0.75rem; overflow: hidden; margin-bottom: 1.25rem; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
        .label { flex-shrink: 0; display: flex; align-items: center; gap: .25rem; padding: 0 .9rem; font-size: .72rem; font-weight: 800; letter-spacing: .02em; text-transform: uppercase; background: #1e293b; color: #fff; white-space: nowrap; }
        .viewport { position: relative; overflow: hidden; flex: 1; }
        .track { display: inline-flex; white-space: nowrap; will-change: transform; animation-name: ticker; animation-timing-function: linear; animation-iteration-count: infinite; }
        .viewport:hover .track { animation-play-state: paused; }
        .row { display: inline-flex; align-items: center; }
        .item { display: inline-flex; align-items: center; gap: .5rem; padding: .55rem .25rem .55rem 0; font-size: .82rem; color: #e2e8f0; text-decoration: none; }
        .item:hover .text { color: #fff; text-decoration: underline; }
        .chip { display: inline-flex; align-items: center; gap: .15rem; padding: .05rem .4rem; border-radius: .35rem; font-size: .62rem; font-weight: 700; color: #fff; }
        .text { white-space: nowrap; }
        .sep { color: #475569; margin: 0 .6rem; }
        @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      `}</style>
    </div>
  )
}
