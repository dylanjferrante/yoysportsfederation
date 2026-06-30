'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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

export default function Ticker({ leagueId }: { leagueId: string }) {
  const [scores, setScores] = useState<Card[]>([])
  const [news, setNews] = useState<News[]>([])
  const [cardIdx, setCardIdx] = useState(0)
  const [topicIdx, setTopicIdx] = useState(0)
  const [hidden, setHidden] = useState(false)
  const [ready, setReady] = useState(false)

  const viewportRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<Animation | null>(null)

  useEffect(() => {
    setHidden(typeof window !== 'undefined' && localStorage.getItem('nf_wire_hidden') === '1')
    setReady(true)
  }, [])

  useEffect(() => {
    let alive = true
    const load = () => fetch(`/api/leagues/${leagueId}/ticker`).then(r => r.json()).then(d => { if (!alive) return; setScores(d.scores ?? []); setNews(d.news ?? []) }).catch(() => {})
    load()
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load() }, 45_000)
    return () => { alive = false; clearInterval(iv) }
  }, [leagueId])

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

  useEffect(() => { setTopicIdx(0) }, [topics.length])

  useEffect(() => {
    if (scores.length <= 1) return
    const iv = setInterval(() => setCardIdx(i => (i + 1) % scores.length), 4500)
    return () => clearInterval(iv)
  }, [scores.length])

  useEffect(() => {
    if (hidden || !topics.length) return
    const el = scrollerRef.current, vp = viewportRef.current
    if (!el || !vp) return
    const W = el.scrollWidth, V = vp.clientWidth
    const speed = 95
    const anim = el.animate(
      [{ transform: `translateX(${V}px)` }, { transform: `translateX(${-W}px)` }],
      { duration: Math.max(6000, ((V + W) / speed) * 1000), easing: 'linear' },
    )
    animRef.current = anim
    anim.onfinish = () => setTopicIdx(i => (topics.length ? (i + 1) % topics.length : 0))
    return () => { anim.cancel(); animRef.current = null }
  }, [topicIdx, topics, hidden])

  const setHiddenPersist = (v: boolean) => { setHidden(v); try { localStorage.setItem('nf_wire_hidden', v ? '1' : '0') } catch {} }

  if (!ready) return null

  if (hidden) {
    return (
      <div className="wirebar">
        <button onClick={() => setHiddenPersist(false)} className="show">📡 Show Wire</button>
        <style jsx>{`
          .wirebar { width: 100%; display: flex; justify-content: center; background: #0f172a; }
          .show { color: #cbd5e1; font-size: .68rem; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; padding: .3rem .8rem; }
          .show:hover { color: #fff; }
        `}</style>
      </div>
    )
  }

  if (!scores.length && !topics.length) return null

  const card = scores.length ? scores[cardIdx % scores.length] : null
  const topic = topics.length ? topics[topicIdx % topics.length] : null
  const queue = topics.length ? [1, 2, 3].map(o => topics[(topicIdx + o) % topics.length]).filter((t, i, a) => topics.length > i + 1 && a.indexOf(t) === i) : []

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

      {topic && (
        <div className="news">
          <div className="pin" key={topic.key}>
            {topic.sport && <span className="pdot" style={{ background: sportMeta(topic.sport).hex }}>{sportMeta(topic.sport).emoji}</span>}
            {topic.title}
          </div>
          <div className="viewport" ref={viewportRef}
            onMouseEnter={() => animRef.current?.pause()} onMouseLeave={() => animRef.current?.play()}>
            <div className="scroller" ref={scrollerRef} key={topicIdx}>
              {topic.items.map((h, i) => (
                <Link key={h.id} href={h.href} className="item">
                  <span className="text">{h.text}</span>
                  {i < topic.items.length - 1 && <span className="sep">•</span>}
                </Link>
              ))}
            </div>
          </div>
          {queue.length > 0 && (
            <div className="queue">
              <span className="next">Up next ▸</span>
              {queue.map(t => (
                <span key={t.key} className="qt">
                  {t.sport && <span className="qdot" style={{ background: sportMeta(t.sport).hex }} />}
                  {t.title}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <button onClick={() => setHiddenPersist(true)} className="hide" aria-label="Hide wire">✕</button>

      <style jsx>{`
        .wrap { width: 100%; display: flex; align-items: stretch; height: 64px; background: #0f172a; color: #e2e8f0; overflow: hidden; }
        .label { flex-shrink: 0; display: flex; align-items: center; padding: 0 .85rem; font-size: .7rem; font-weight: 800; letter-spacing: .02em; text-transform: uppercase; background: #1e293b; color: #fff; }
        .scorecard { flex-shrink: 0; width: 240px; display: flex; flex-direction: column; justify-content: center; gap: 1px; padding: .3rem .75rem; border-right: 1px solid #1e293b; text-decoration: none; color: #cbd5e1; animation: fade .45s ease; }
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
        .news { flex: 1; min-width: 0; display: flex; align-items: stretch; }
        .pin { flex-shrink: 0; display: flex; align-items: center; gap: .35rem; padding: 0 .9rem; font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: #fff; background: #172033; border-right: 1px solid #1e293b; animation: slidein .4s ease; white-space: nowrap; }
        .pdot { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 4px; font-size: .6rem; }
        .viewport { position: relative; flex: 1; min-width: 0; overflow: hidden; display: flex; align-items: center; }
        .scroller { position: absolute; display: inline-flex; align-items: center; white-space: nowrap; will-change: transform; }
        .item { display: inline-flex; align-items: center; gap: .5rem; font-size: .82rem; color: #e2e8f0; text-decoration: none; }
        .item:hover .text { color: #fff; text-decoration: underline; }
        .text { white-space: nowrap; }
        .sep { color: #475569; margin: 0 .7rem; }
        .queue { flex-shrink: 0; max-width: 38%; display: flex; align-items: center; gap: .6rem; padding: 0 .9rem; background: linear-gradient(90deg, transparent, #0b1322 18%); color: #64748b; overflow: hidden; }
        .next { font-size: .58rem; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: #475569; white-space: nowrap; }
        .qt { display: inline-flex; align-items: center; gap: .3rem; font-size: .72rem; font-weight: 700; color: #94a3b8; white-space: nowrap; }
        .qdot { width: 8px; height: 8px; border-radius: 2px; }
        .hide { flex-shrink: 0; padding: 0 .7rem; color: #475569; font-size: .8rem; }
        .hide:hover { color: #e2e8f0; }
        @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slidein { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
        @media (max-width: 640px) {
          .label { padding: 0 .55rem; font-size: .6rem; }
          .scorecard { width: 150px; padding: .3rem .5rem; }
          .pin { font-size: .64rem; padding: 0 .6rem; }
          .queue { display: none; }
          .item { font-size: .78rem; }
        }
      `}</style>
    </div>
  )
}
