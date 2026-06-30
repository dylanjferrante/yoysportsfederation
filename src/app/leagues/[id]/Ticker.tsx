'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

type Side = { name: string; abbr: string; logo: string | null; primary: string; secondary: string; score: number; win: boolean }
type Card = { id: string; sport: string; status: 'Final' | 'LIVE'; home: Side; away: Side }
type News = { id: string; category: string; sport?: string; text: string; href: string }
type Topic = { key: string; title: string; sport?: string; items: News[] }

const CATEGORY_TITLE: Record<string, string> = {
  PERFORMANCE: 'Top Performers', MILESTONE: 'Milestones', SHOOTOUT: 'Shootouts', SUPERLATIVE: 'Leaders',
  TRANSACTION: 'Transactions', STREAK: 'Streaks', STANDINGS: 'Standings', POWER: 'Power Rankings',
  PLAYOFF: 'Playoffs', CHAMPION: 'Champions', DRAFT: 'Draft', PREVIEW: 'On Deck', RIVALRY: 'Rivalries',
  FORM: 'Form', PACE: 'Pace', FEDERATION: 'Federation', GOVERNANCE: 'League Office', SCHEDULE: 'Schedule',
}

type Snapshot = { scores: Card[]; news: News[]; cardIdx: number; startedAt?: number }
const tickerCache = new Map<string, Snapshot>()

export default function Ticker({ leagueId }: { leagueId: string }) {
  const [scores, setScores] = useState<Card[]>(() => tickerCache.get(leagueId)?.scores ?? [])
  const [news, setNews] = useState<News[]>(() => tickerCache.get(leagueId)?.news ?? [])
  const [cardIdx, setCardIdx] = useState(() => tickerCache.get(leagueId)?.cardIdx ?? 0)
  const [hidden, setHidden] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setHidden(typeof window !== 'undefined' && localStorage.getItem('nf_wire_hidden') === '1')
    setReady(true)
  }, [])

  useEffect(() => {
    let alive = true
    const load = () => fetch(`/api/leagues/${leagueId}/ticker`).then(r => r.json()).then(d => {
      if (!alive) return
      const sc = d.scores ?? [], nw = d.news ?? []
      setScores(sc); setNews(nw)
      const c = tickerCache.get(leagueId)
      tickerCache.set(leagueId, { scores: sc, news: nw, cardIdx: c?.cardIdx ?? 0, startedAt: c?.startedAt })
    }).catch(() => {})
    load()
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load() }, 45_000)
    return () => { alive = false; clearInterval(iv) }
  }, [leagueId])

  useEffect(() => {
    const c = tickerCache.get(leagueId)
    if (c) tickerCache.set(leagueId, { ...c, cardIdx })
  }, [leagueId, cardIdx])

  useEffect(() => {
    if (scores.length <= 1) return
    const iv = setInterval(() => setCardIdx(i => (i + 1) % scores.length), 4500)
    return () => clearInterval(iv)
  }, [scores.length])

  const topics = useMemo<Topic[]>(() => {
    const order: string[] = []
    const byCat = new Map<string, News[]>()
    for (const h of news) {
      if (!byCat.has(h.category)) { byCat.set(h.category, []); order.push(h.category) }
      byCat.get(h.category)!.push(h)
    }
    return order.map(cat => {
      const items = byCat.get(cat)!.slice(0, 8)
      const sport = items.every(i => i.sport && i.sport === items[0].sport) ? items[0].sport : undefined
      return { key: cat, title: CATEGORY_TITLE[cat] ?? cat, sport, items }
    })
  }, [news])

  const setHiddenPersist = (v: boolean) => { setHidden(v); try { localStorage.setItem('nf_wire_hidden', v ? '1' : '0') } catch {} }

  if (!ready) return null

  if (hidden) {
    return (
      <div className="wirebar">
        <button onClick={() => setHiddenPersist(false)} className="show">📡 Show Wire</button>
        <style jsx>{`
          .wirebar { position: sticky; top: 3.5rem; z-index: 40; width: 100%; display: flex; justify-content: center; background: #0f172a; }
          .show { color: #cbd5e1; font-size: .68rem; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; padding: .3rem .8rem; }
          .show:hover { color: #fff; }
        `}</style>
      </div>
    )
  }

  if (!scores.length && !topics.length) return null

  const card = scores.length ? scores[cardIdx % scores.length] : null

  const totalChars = topics.reduce((n, t) => n + t.title.length + 6 + t.items.reduce((m, h) => m + h.text.length + 4, 0), 0)
  const duration = Math.max(28, Math.round(totalChars * 0.16))
  const startedAt = (() => {
    const c = tickerCache.get(leagueId)
    if (c?.startedAt) return c.startedAt
    const now = Date.now()
    tickerCache.set(leagueId, { scores, news, cardIdx, startedAt: now })
    return now
  })()
  const delay = -(((Date.now() - startedAt) / 1000) % duration)

  const Strip = ({ k }: { k: string }) => (
    <div className="strip" aria-hidden={k === 'b'}>
      {topics.map(t => (
        <span className="seg" key={`${k}-${t.key}`}>
          <span className="ttile" style={{ background: t.sport ? sportMeta(t.sport).hex : '#1e293b' }}>
            {t.sport && <span className="tdot">{sportMeta(t.sport).emoji}</span>}
            {t.title}
          </span>
          {t.items.map(h => (
            <Link key={`${k}-${h.id}`} href={h.href} className="item">
              <span className="text">{h.text}</span>
              <span className="dot">•</span>
            </Link>
          ))}
        </span>
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

      {topics.length > 0 && (
        <div className="viewport">
          <div className="track" style={{ animationDuration: `${duration}s`, animationDelay: `${delay}s` }}>
            <Strip k="a" />
            <Strip k="b" />
          </div>
        </div>
      )}

      <button onClick={() => setHiddenPersist(true)} className="hide" aria-label="Hide wire">✕</button>

      <style jsx>{`
        .wrap { position: sticky; top: 3.5rem; z-index: 40; width: 100%; display: flex; align-items: stretch; height: 64px; background: #0f172a; color: #e2e8f0; overflow: hidden; }
        .label { flex-shrink: 0; display: flex; align-items: center; padding: 0 .85rem; font-size: .7rem; font-weight: 800; letter-spacing: .02em; text-transform: uppercase; background: #1e293b; color: #fff; }
        .scorecard { flex-shrink: 0; width: 224px; display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: .3rem .85rem; border-right: 1px solid #1e293b; text-decoration: none; color: #cbd5e1; animation: fade .45s ease; }
        .schead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
        .spchip { font-size: .58rem; font-weight: 800; padding: .03rem .35rem; border-radius: .3rem; color: #fff; }
        .status { font-size: .58rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; }
        .status.live { color: #f87171; }
        .team { display: grid; grid-template-columns: 18px 1fr auto; align-items: center; column-gap: .45rem; font-size: .82rem; line-height: 1.35; }
        .team.win { font-weight: 800; color: #fff; }
        .lg { width: 18px; height: 18px; object-fit: contain; border-radius: 3px; flex-shrink: 0; background: rgba(255,255,255,.08); }
        .badge { display: inline-flex; align-items: center; justify-content: center; font-size: .5rem; font-weight: 800; }
        .ab { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sc { font-family: "punto", ui-monospace, "SFMono-Regular", Menlo, monospace; font-variant-numeric: tabular-nums; font-weight: 700; font-size: .95rem; letter-spacing: .03em; text-align: right; min-width: 3.2ch; margin-left: .65rem; color: #f1f5f9; }
        .viewport { position: relative; display: flex; align-items: center; overflow: hidden; flex: 1; }
        .viewport:hover .track { animation-play-state: paused; }
        .track { display: inline-flex; white-space: nowrap; will-change: transform; animation-name: ticker; animation-timing-function: linear; animation-iteration-count: infinite; }
        .strip { display: inline-flex; align-items: center; }
        .seg { display: inline-flex; align-items: center; }
        .ttile { display: inline-flex; align-items: center; gap: .3rem; height: 26px; margin: 0 .55rem 0 .9rem; padding: 0 .7rem; border-radius: 4px; font-size: .68rem; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: #fff; }
        .tdot { font-size: .72rem; }
        .item { display: inline-flex; align-items: center; gap: .55rem; font-size: .82rem; color: #e2e8f0; text-decoration: none; }
        .item:hover .text { color: #fff; text-decoration: underline; }
        .text { white-space: nowrap; }
        .dot { color: #475569; margin: 0 .35rem; }
        .hide { flex-shrink: 0; padding: 0 .7rem; color: #475569; font-size: .8rem; }
        .hide:hover { color: #e2e8f0; }
        @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
        @media (max-width: 640px) {
          .label { padding: 0 .55rem; font-size: .6rem; }
          .scorecard { width: 168px; padding: .3rem .6rem; }
          .item { font-size: .78rem; }
        }
      `}</style>
    </div>
  )
}
