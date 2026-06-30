'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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

export default function Ticker({ leagueId }: { leagueId: string }) {
  const [scores, setScores] = useState<Card[]>(() => tickerCache.get(leagueId)?.scores ?? [])
  const [news, setNews] = useState<News[]>(() => tickerCache.get(leagueId)?.news ?? [])
  const [cardIdx, setCardIdx] = useState(() => tickerCache.get(leagueId)?.cardIdx ?? 0)
  const [topicIdx, setTopicIdx] = useState(() => tickerCache.get(leagueId)?.topicIdx ?? 0)
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
    if (hidden || !topics.length) return
    const el = scrollerRef.current, vp = viewportRef.current
    if (!el || !vp) return
    const W = el.scrollWidth, V = vp.clientWidth
    const speed = 90
    const anim = el.animate(
      [{ transform: `translateX(${V}px)` }, { transform: `translateX(${-W}px)` }],
      { duration: Math.max(7000, ((V + W) / speed) * 1000), easing: 'linear' },
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
          .wirebar { position: sticky; top: 3.5rem; z-index: 40; width: 100%; display: flex; justify-content: center; background: #0f172a; }
          .show { color: #cbd5e1; font-size: .68rem; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; padding: .35rem .8rem; }
          .show:hover { color: #fff; }
        `}</style>
      </div>
    )
  }

  if (!scores.length && !topics.length) return null

  const card = scores.length ? scores[cardIdx % scores.length] : null
  const topic = topics.length ? topics[topicIdx % topics.length] : null
  const queue = topics.length > 1
    ? Array.from({ length: Math.min(5, topics.length - 1) }, (_, k) => topics[(topicIdx + 1 + k) % topics.length])
    : []

  const TopicTile = ({ t, main }: { t: Topic; main?: boolean }) => (
    <span className={`tile ${main ? 'tmain' : ''}`} style={{ background: t.sport ? sportMeta(t.sport).hex : (main ? '#334155' : '#1e293b') }}>
      {t.sport && <span className="tdot">{sportMeta(t.sport).emoji}</span>}
      {t.title}
    </span>
  )

  const Team = ({ s, pre }: { s: Side; pre?: boolean }) => (
    <div className={`team ${s.win ? 'win' : ''}`}>
      {s.logo ? <img src={s.logo} alt="" className="lg" /> : <span className="lg badge" style={{ background: s.primary, color: s.secondary }}>{s.abbr.slice(0, 3)}</span>}
      <span className="ab">{s.abbr}</span>
      <span className="sc">{pre ? '—' : s.score}</span>
    </div>
  )

  return (
    <div className="wrap">
      <span className="label">📡&nbsp;Wire</span>

      {card && (
        <Link href={`/leagues/${leagueId}/matchup/${card.id}`} className="scorecard" key={card.id}>
          <div className="schead">
            <span className="spchip" style={{ background: sportMeta(card.sport).hex }}>{card.sport}</span>
            <span className={`status ${card.status === 'LIVE' ? 'live' : ''}`}>{card.status === 'LIVE' ? '● LIVE' : card.status === 'PRE' ? 'Upcoming' : 'Final'}</span>
          </div>
          <Team s={card.away} pre={card.status === 'PRE'} />
          <Team s={card.home} pre={card.status === 'PRE'} />
        </Link>
      )}

      {topic && (
        <div className="main">
          <span className="mainpin" key={`pin-${topicIdx}`}><TopicTile t={topic} main /></span>
          <div className="viewport" ref={viewportRef}
            onMouseEnter={() => animRef.current?.pause()} onMouseLeave={() => animRef.current?.play()}>
            <div className="scroller" ref={scrollerRef} key={topicIdx}>
              {topic.items.map(h => (
                <Link key={h.id} href={h.href} className="item">
                  <span className="text">{h.text}</span>
                  <span className="dot">•</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {queue.length > 0 && (
        <div className="queue" key={`q-${topicIdx}`}>
          <span className="upnext">Up next</span>
          {queue.map((t, i) => <TopicTile key={`${t.key}-${i}`} t={t} />)}
        </div>
      )}

      <button onClick={() => setHiddenPersist(true)} className="hide" aria-label="Hide wire">✕</button>

      <style jsx>{`
        .wrap { position: sticky; top: 3.5rem; z-index: 40; width: 100%; display: flex; align-items: stretch; height: 66px; background: #0f172a; color: #e2e8f0; overflow: hidden; }
        .label { flex-shrink: 0; display: flex; align-items: center; padding: 0 1rem; font-size: .7rem; font-weight: 800; letter-spacing: .03em; text-transform: uppercase; background: #1e293b; color: #fff; }
        .scorecard { flex-shrink: 0; width: 190px; display: flex; flex-direction: column; justify-content: center; gap: 3px; padding: .3rem 1rem; border-right: 1px solid #1e293b; text-decoration: none; color: #cbd5e1; animation: fade .45s ease; }
        .schead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
        .spchip { font-size: .58rem; font-weight: 800; padding: .03rem .35rem; border-radius: .3rem; color: #fff; }
        .status { font-size: .58rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; }
        .status.live { color: #f87171; }
        .team { display: flex; align-items: center; font-size: .82rem; line-height: 1.4; }
        .team.win { font-weight: 800; color: #fff; }
        .lg { width: 18px; height: 18px; object-fit: contain; border-radius: 3px; flex-shrink: 0; background: rgba(255,255,255,.08); margin-right: .55rem; }
        .badge { display: inline-flex; align-items: center; justify-content: center; font-size: .5rem; font-weight: 800; }
        .ab { width: 3.4rem; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sc { width: 3.6ch; flex-shrink: 0; margin-left: 1.15rem; text-align: right; font-family: "punto", var(--font-score), ui-monospace, "SFMono-Regular", Menlo, monospace; font-variant-numeric: tabular-nums; font-weight: 700; font-size: 1.05rem; letter-spacing: .04em; color: #f1f5f9; }
        .main { flex: 1; min-width: 0; display: flex; align-items: center; border-right: 1px solid #1e293b; }
        .mainpin { flex-shrink: 0; display: inline-flex; align-items: center; padding: 0 1.4rem 0 1.5rem; animation: slidein .45s ease; }
        .viewport { position: relative; flex: 1; min-width: 0; overflow: hidden; display: flex; align-items: center; }
        .scroller { position: absolute; display: inline-flex; align-items: center; white-space: nowrap; will-change: transform; }
        .item { display: inline-flex; align-items: center; gap: 1.6rem; font-size: .84rem; color: #e2e8f0; text-decoration: none; }
        .item:hover .text { color: #fff; text-decoration: underline; }
        .text { white-space: nowrap; }
        .dot { color: #475569; margin: 0 1.6rem; font-size: .7rem; }
        .tile { display: inline-flex; align-items: center; gap: .4rem; height: 28px; padding: 0 .85rem; border-radius: 5px; font-size: .69rem; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: #fff; white-space: nowrap; }
        .tile.tmain { height: 30px; font-size: .74rem; box-shadow: 0 0 0 1px rgba(255,255,255,.12); }
        .tdot { font-size: .8rem; }
        .queue { flex-shrink: 0; display: flex; align-items: center; gap: .8rem; padding: 0 1.2rem; background: linear-gradient(90deg, transparent, #0b1322 22%); animation: slideleft .5s ease; }
        .upnext { font-size: .56rem; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #475569; white-space: nowrap; margin-right: .2rem; }
        .hide { flex-shrink: 0; padding: 0 .85rem; color: #475569; font-size: .8rem; }
        .hide:hover { color: #e2e8f0; }
        @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slidein { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideleft { from { opacity: .25; transform: translateX(34px); } to { opacity: 1; transform: translateX(0); } }
        @media (max-width: 900px) { .queue { display: none; } }
        @media (max-width: 640px) {
          .label { padding: 0 .6rem; font-size: .6rem; }
          .scorecard { width: 170px; padding: .3rem .65rem; }
          .mainpin { padding: 0 1rem; }
          .item { gap: 1.1rem; }
          .dot { margin: 0 1.1rem; }
        }
      `}</style>
    </div>
  )
}
