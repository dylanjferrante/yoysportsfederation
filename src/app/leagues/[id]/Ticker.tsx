'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

type Side = { name: string; abbr: string; logo: string | null; primary: string; secondary: string; score: number; win: boolean }
type Card = { id: string; sport: string; status: 'Final' | 'LIVE'; home: Side; away: Side }
type News = { id: string; category: string; sport?: string; text: string; href: string }

// ESPN-TV-style ticker: a STATIC score panel (team abbr, logo, score, status)
// that flips between games, alongside a SCROLLING news feed. Refreshes every 45s
// while visible (DB read, no API cost).
export default function Ticker({ leagueId }: { leagueId: string }) {
  const [scores, setScores] = useState<Card[]>([])
  const [news, setNews] = useState<News[]>([])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    let alive = true
    const load = () => fetch(`/api/leagues/${leagueId}/ticker`).then(r => r.json()).then(d => { if (!alive) return; setScores(d.scores ?? []); setNews(d.news ?? []) }).catch(() => {})
    load()
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load() }, 45_000)
    return () => { alive = false; clearInterval(iv) }
  }, [leagueId])

  // Flip the static score card every few seconds.
  useEffect(() => {
    if (scores.length <= 1) return
    const iv = setInterval(() => setIdx(i => (i + 1) % scores.length), 4500)
    return () => clearInterval(iv)
  }, [scores.length])

  if (!scores.length && !news.length) return null
  const card = scores.length ? scores[idx % scores.length] : null
  const duration = Math.max(40, news.length * 7)

  const Row = ({ k }: { k: string }) => (
    <div className="row" aria-hidden={k === 'b'}>
      {news.map((h, i) => (
        <Link key={`${k}-${i}`} href={h.href} className="item">
          {h.sport && <span className="chip" style={{ background: sportMeta(h.sport).hex }}>{sportMeta(h.sport).emoji} {h.sport}</span>}
          <span className="text">{h.text}</span>
          <span className="sep">•</span>
        </Link>
      ))}
    </div>
  )

  const Team = ({ s }: { s: Side }) => (
    <div className={`team ${s.win ? 'win' : ''}`}>
      {s.logo ? <img src={s.logo} alt="" className="lg" /> : <span className="lg badge" style={{ background: s.primary, color: s.secondary }}>{s.abbr.slice(0, 3)}</span>}
      <span className="ab">{s.abbr}</span>
      <span className="sc">{s.score}</span>
    </div>
  )

  return (
    <div className="wrap">
      <span className="label">📡&nbsp;Wire</span>
      {card && (
        <Link href={`/leagues/${leagueId}/matchup/${card.id}`} className="scorecard" key={card.id}>
          <div className="schead">
            <span className="spchip" style={{ background: sportMeta(card.sport).hex }}>{card.sport}</span>
            <span className={`status ${card.status === 'LIVE' ? 'live' : ''}`}>{card.status === 'LIVE' ? '● LIVE' : 'Final'}</span>
          </div>
          <Team s={card.away} />
          <Team s={card.home} />
        </Link>
      )}
      {!!news.length && (
        <div className="viewport">
          <div className="track" style={{ animationDuration: `${duration}s` }}>
            <Row k="a" />
            <Row k="b" />
          </div>
        </div>
      )}
      <style jsx>{`
        .wrap { display: flex; align-items: stretch; height: 64px; background: #0f172a; color: #e2e8f0; border-radius: .75rem; overflow: hidden; margin-bottom: 1.25rem; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
        .label { flex-shrink: 0; display: flex; align-items: center; padding: 0 .85rem; font-size: .7rem; font-weight: 800; letter-spacing: .02em; text-transform: uppercase; background: #1e293b; color: #fff; }
        .scorecard { flex-shrink: 0; width: 250px; display: flex; flex-direction: column; justify-content: center; gap: 1px; padding: .3rem .75rem; border-right: 1px solid #1e293b; text-decoration: none; color: #cbd5e1; animation: fade .45s ease; }
        .schead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
        .spchip { font-size: .58rem; font-weight: 800; padding: .03rem .35rem; border-radius: .3rem; color: #fff; }
        .status { font-size: .58rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; }
        .status.live { color: #f87171; }
        .team { display: flex; align-items: center; gap: .4rem; font-size: .82rem; line-height: 1.3; }
        .team.win { font-weight: 800; color: #fff; }
        .lg { width: 17px; height: 17px; object-fit: contain; border-radius: 3px; flex-shrink: 0; background: rgba(255,255,255,.08); }
        .badge { display: inline-flex; align-items: center; justify-content: center; font-size: .5rem; font-weight: 800; }
        .ab { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sc { font-variant-numeric: tabular-nums; font-weight: 700; }
        .viewport { position: relative; display: flex; align-items: center; overflow: hidden; flex: 1; }
        .track { display: inline-flex; white-space: nowrap; will-change: transform; animation-name: ticker; animation-timing-function: linear; animation-iteration-count: infinite; }
        .viewport:hover .track { animation-play-state: paused; }
        .row { display: inline-flex; align-items: center; }
        .item { display: inline-flex; align-items: center; gap: .5rem; padding-right: .25rem; font-size: .82rem; color: #e2e8f0; text-decoration: none; }
        .item:hover .text { color: #fff; text-decoration: underline; }
        .chip { display: inline-flex; align-items: center; gap: .15rem; padding: .05rem .4rem; border-radius: .35rem; font-size: .62rem; font-weight: 700; color: #fff; }
        .text { white-space: nowrap; }
        .sep { color: #475569; margin: 0 .6rem; }
        @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  )
}
