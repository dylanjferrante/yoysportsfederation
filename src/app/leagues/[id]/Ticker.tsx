'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

type Side = { name: string; abbr: string; logo: string | null; primary: string; secondary: string; score: number; win: boolean }
type Card = { id: string; sport: string; status: 'Final' | 'LIVE' | 'PRE'; home: Side; away: Side }
type News = { id: string; category: string; sport?: string; text: string; href: string }
type Topic = { key: string; title: string; sport?: string; items: News[] }

const CATEGORY_TITLE: Record<string, string> = {
  PERFORMANCE: 'Top Performers', MILESTONE: 'Milestones', SHOOTOUT: 'Shootouts', SUPERLATIVE: 'Leaders',
  TRANSACTION: 'Transactions', STREAK: 'Streaks', STANDINGS: 'Standings', POWER: 'Power Rankings',
  PLAYOFF: 'Playoffs', CHAMPION: 'Champions', DRAFT: 'Draft', PREVIEW: 'On Deck', RIVALRY: 'Rivalries',
  FORM: 'Form', PACE: 'Pace', FEDERATION: 'Federation', GOVERNANCE: 'League Office', SCHEDULE: 'Schedule',
}

type Snapshot = { scores: Card[]; news: News[]; cardIdx: number; topicIdx: number }
const tickerCache = new Map<string, Snapshot>()

export default function Ticker({ leagueId, primary = '#0f172a', secondary = '#fbbf24' }: { leagueId: string; primary?: string; secondary?: string }) {
  const [scores, setScores] = useState<Card[]>(() => tickerCache.get(leagueId)?.scores ?? [])
  const [news, setNews] = useState<News[]>(() => tickerCache.get(leagueId)?.news ?? [])
  const [cardIdx, setCardIdx] = useState(() => tickerCache.get(leagueId)?.cardIdx ?? 0)
  const [topicIdx, setTopicIdx] = useState(() => tickerCache.get(leagueId)?.topicIdx ?? 0)
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
      tickerCache.set(leagueId, { scores: sc, news: nw, cardIdx: c?.cardIdx ?? 0, topicIdx: c?.topicIdx ?? 0 })
    }).catch(() => {})
    load()
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load() }, 45_000)
    return () => { alive = false; clearInterval(iv) }
  }, [leagueId])

  useEffect(() => {
    const c = tickerCache.get(leagueId)
    if (c) tickerCache.set(leagueId, { ...c, cardIdx, topicIdx })
  }, [leagueId, cardIdx, topicIdx])

  useEffect(() => {
    if (scores.length <= 1) return
    const iv = setInterval(() => setCardIdx(i => (i + 1) % scores.length), 5000)
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

  useEffect(() => { setTopicIdx(i => (topics.length && i >= topics.length ? 0 : i)) }, [topics.length])

  useEffect(() => {
    if (hidden || topics.length <= 1) return
    const iv = setInterval(() => setTopicIdx(i => (i + 1) % topics.length), 13_000)
    return () => clearInterval(iv)
  }, [hidden, topics.length])

  const setHiddenPersist = (v: boolean) => { setHidden(v); try { localStorage.setItem('nf_wire_hidden', v ? '1' : '0') } catch {} }

  if (!ready) return null

  if (hidden) {
    return (
      <div className="wirebar" style={{ background: primary }}>
        <button onClick={() => setHiddenPersist(false)} className="show">Show Wire</button>
        <style jsx>{`
          .wirebar { position: sticky; top: 3.5rem; z-index: 40; width: 100%; display: flex; justify-content: center; }
          .show { color: #fff; opacity: .85; font-size: .68rem; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; padding: .35rem .8rem; }
          .show:hover { opacity: 1; }
        `}</style>
      </div>
    )
  }

  if (!scores.length && !topics.length) return null

  const card = scores.length ? scores[cardIdx % scores.length] : null
  const sides = card ? [card.away, card.home] : []
  const pre = card?.status === 'PRE'
  const topic = topics.length ? topics[topicIdx % topics.length] : null
  const items = topic?.items ?? []
  const reps = Math.max(1, Math.ceil(8 / Math.max(1, items.length)))
  const filled = Array.from({ length: reps }).flatMap(() => items)
  const itemChars = filled.reduce((n, h) => n + h.text.length + 6, 0)
  const duration = Math.max(16, Math.round(itemChars * 0.2))
  const upNext = topics.length > 1
    ? Array.from({ length: Math.min(3, topics.length - 1) }, (_, k) => topics[(topicIdx + 1 + k) % topics.length])
    : []

  return (
    <div className="wrap" style={{ '--lp': primary, '--ls': secondary } as React.CSSProperties}>
      <span className="label">Wire</span>

      {card && (
        <Link href={`/leagues/${leagueId}/matchup/${card.id}`} className="scorecard" key={card.id}>
          <div className="schead">
            <span className="spchip" style={{ background: sportMeta(card.sport).hex }}>{card.sport}</span>
            <span className={`status ${card.status === 'LIVE' ? 'live' : ''}`}>{card.status === 'LIVE' ? 'LIVE' : card.status === 'PRE' ? 'Upcoming' : 'Final'}</span>
          </div>
          {sides.map((s, i) => (
            <div className={`team ${s.win ? 'win' : ''}`} key={i}>
              {s.logo
                ? <img src={s.logo} alt="" className="lg" style={{ background: s.primary }} />
                : <span className="lg badge" style={{ background: s.primary, color: s.secondary }}>{s.abbr.slice(0, 3)}</span>}
              <span className="ab">{s.abbr}</span>
              <span className="sc">{pre ? '—' : s.score}</span>
            </div>
          ))}
        </Link>
      )}

      {topic && (
        <div className="main">
          <span className="pin" key={`pin-${topicIdx}`}>
            {topic.sport && <span className="pbar" style={{ background: sportMeta(topic.sport).hex }} />}
            {topic.title}
          </span>
          <div className="viewport">
            <div className="track" key={topicIdx} style={{ animationDuration: `${duration}s` }}>
              <div className="row">
                {filled.map((h, i) => (
                  <Link key={`a-${h.id}-${i}`} href={h.href} className="item">
                    <span className="text">{h.text}</span>
                    <span className="sep">•</span>
                  </Link>
                ))}
              </div>
              <div className="row" aria-hidden>
                {filled.map((h, i) => (
                  <span key={`b-${h.id}-${i}`} className="item">
                    <span className="text">{h.text}</span>
                    <span className="sep">•</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {upNext.length > 0 && (
        <div className="queue" key={topicIdx}>
          <span className="upnext">Up Next</span>
          {upNext.map((t, i) => (
            <span className="qtile" key={`${t.key}-${i}`}>
              {t.sport && <span className="qbar" style={{ background: sportMeta(t.sport).hex }} />}
              {t.title}
            </span>
          ))}
        </div>
      )}

      <button onClick={() => setHiddenPersist(true)} className="hide" aria-label="Hide wire">✕</button>

      <style jsx>{`
        .wrap { position: sticky; top: 3.5rem; z-index: 40; width: 100%; display: flex; align-items: stretch; height: 66px; color: #e2e8f0; overflow: hidden; background: linear-gradient(90deg, rgba(2,6,23,.62), rgba(2,6,23,.42)), var(--lp); }
        .label { flex-shrink: 0; display: flex; align-items: center; padding: 0 1.05rem; font-size: .72rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; background: var(--ls); color: var(--lp); }
        .scorecard { flex-shrink: 0; width: 196px; display: flex; flex-direction: column; justify-content: center; gap: 3px; padding: .3rem 1rem; border-right: 1px solid rgba(255,255,255,.14); text-decoration: none; color: #e2e8f0; }
        .schead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
        .spchip { font-size: .58rem; font-weight: 800; padding: .03rem .35rem; border-radius: .3rem; color: #fff; }
        .status { font-size: .58rem; font-weight: 700; color: #cbd5e1; opacity: .75; text-transform: uppercase; }
        .status.live { color: #f87171; opacity: 1; }
        .team { display: flex; align-items: center; font-size: .82rem; line-height: 1.4; }
        .team.win { font-weight: 800; color: #fff; }
        .lg { width: 20px; height: 20px; object-fit: contain; border-radius: 3px; flex-shrink: 0; padding: 2px; margin-right: .55rem; }
        .badge { display: inline-flex; align-items: center; justify-content: center; font-size: .5rem; font-weight: 800; padding: 0; }
        .ab { width: 3.2rem; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sc { width: 4.4ch; flex-shrink: 0; margin-left: 1.3rem; text-align: right; font-family: "punto", var(--font-score), ui-monospace, "SFMono-Regular", Menlo, monospace; font-variant-numeric: tabular-nums; font-size: 1rem; letter-spacing: .06em; color: #fbbf24; text-shadow: 0 0 6px rgba(251,191,36,.4); }
        .main { flex: 1; min-width: 0; display: flex; align-items: stretch; border-right: 1px solid rgba(255,255,255,.14); }
        .pin { flex-shrink: 0; display: inline-flex; align-items: center; gap: .55rem; padding: 0 1.4rem; font-size: .86rem; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: var(--ls); background: rgba(2,6,23,.4); border-right: 1px solid rgba(255,255,255,.1); white-space: nowrap; animation: slidein .4s ease; }
        .pbar { width: 4px; height: 18px; border-radius: 2px; flex-shrink: 0; }
        .viewport { position: relative; flex: 1; min-width: 0; overflow: hidden; display: flex; align-items: center; }
        .viewport:hover .track { animation-play-state: paused; }
        .track { display: inline-flex; white-space: nowrap; will-change: transform; padding-left: 1.6rem; animation-name: ticker; animation-timing-function: linear; animation-iteration-count: infinite; }
        .row { display: inline-flex; align-items: center; }
        .item { display: inline-flex; align-items: center; flex-shrink: 0; font-size: .9rem; font-weight: 500; color: #eef2f7; text-decoration: none; }
        .item:hover .text { color: #fff; text-decoration: underline; }
        .text { white-space: nowrap; }
        .sep { color: rgba(255,255,255,.4); margin: 0 1.9rem; font-size: .72rem; }
        .queue { flex-shrink: 0; display: flex; align-items: center; gap: 1.4rem; padding: 0 1.5rem; border-left: 1px solid rgba(255,255,255,.14); background: linear-gradient(90deg, transparent, rgba(2,6,23,.5) 30%); }
        .queue > .qtile { animation: qslide .5s ease; }
        .upnext { font-size: .56rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: rgba(255,255,255,.45); white-space: nowrap; }
        .qtile { display: inline-flex; align-items: center; gap: .45rem; font-size: .8rem; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: rgba(238,242,247,.82); white-space: nowrap; }
        .qbar { width: 3px; height: 14px; border-radius: 2px; flex-shrink: 0; }
        .hide { flex-shrink: 0; padding: 0 .85rem; color: rgba(255,255,255,.35); font-size: .8rem; }
        .hide:hover { color: #fff; }
        @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes slidein { from { opacity: 0; transform: translateX(-14px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes qslide { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: translateX(0); } }
        @media (max-width: 1024px) { .queue { display: none; } }
        @media (max-width: 640px) {
          .label { padding: 0 .6rem; font-size: .6rem; }
          .scorecard { width: 178px; padding: .3rem .65rem; }
          .pin { padding: 0 .9rem; font-size: .76rem; }
          .sep { margin: 0 1.3rem; }
        }
      `}</style>
    </div>
  )
}
