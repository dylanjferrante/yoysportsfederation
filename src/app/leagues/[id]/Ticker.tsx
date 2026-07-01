'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { sportMeta, sportAbbrLabel } from '@/lib/utils'

type Side = { name: string; abbr: string; logo: string | null; primary: string; secondary: string; score: number; win: boolean }
type Card = { id: string; sport: string; sportName?: string; sportLogo?: string | null; status: 'Final' | 'LIVE' | 'PRE'; home: Side; away: Side }
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

export default function Ticker({ leagueId, primary = '#0f172a', secondary = '#fbbf24', sportAbbr = {} }: { leagueId: string; primary?: string; secondary?: string; sportAbbr?: Record<string, string> }) {
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

  // Topics are per-sport: each sport bundles its scores, standings, news and
  // transactions; cross-sport headlines fall under a Federation topic.
  const topics = useMemo<Topic[]>(() => {
    const SPORT_ORDER = ['NFL', 'NBA', 'NHL', 'MLB', 'FED']
    const bySport = new Map<string, News[]>()
    for (const h of news) {
      const k = h.sport ?? 'FED'
      ;(bySport.get(k) ?? bySport.set(k, []).get(k)!).push(h)
    }
    const keys = [...bySport.keys()].sort((a, b) => {
      const ia = SPORT_ORDER.indexOf(a), ib = SPORT_ORDER.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
    return keys.map(k => ({
      key: k,
      title: k === 'FED' ? 'Federation' : sportAbbrLabel(k, sportAbbr),
      sport: k === 'FED' ? undefined : k,
      items: bySport.get(k)!.slice(0, 12),
    }))
  }, [news, sportAbbr])

  useEffect(() => { setTopicIdx(i => (topics.length && i >= topics.length ? 0 : i)) }, [topics.length])

  // One long train: for each topic, a sticky topic tile then its (de-duped) headlines.
  const [curIdx, setCurIdx] = useState(0)
  const streamRef = useRef<HTMLDivElement>(null)
  const trainRef = useRef<HTMLDivElement>(null)
  const pinRef = useRef<HTMLSpanElement>(null)
  const hoverRef = useRef(false)
  const train = useMemo(() => {
    const segs: Array<{ kind: 'topic'; idx: number; topic: Topic } | { kind: 'news'; h: News; key: string }> = []
    topics.forEach((t, ti) => {
      segs.push({ kind: 'topic', idx: ti, topic: t })
      const seen = new Set<string>()
      t.items.forEach((h, hi) => { const k = h.text.trim().toLowerCase(); if (seen.has(k)) return; seen.add(k); segs.push({ kind: 'news', h, key: `${ti}-${hi}` }) })
    })
    return segs
  }, [topics])

  // Drive the whole train at ONE constant velocity with a transform. A separate
  // label is locked over the stream's left edge (right of the scorebug) showing
  // the current topic; headlines and the next topic tile scroll behind it, and
  // the locked label switches to the next topic once its tile reaches the pin.
  useEffect(() => {
    if (hidden || topics.length === 0) return
    const trainEl = trainRef.current, pin = pinRef.current
    if (!trainEl || !pin) return
    const SPEED = 55 // px/sec, constant
    let halfW = 0, pinW = 0
    let offsets: { idx: number; off: number }[] = []
    const measure = () => {
      halfW = trainEl.scrollWidth / 2
      pinW = pin.getBoundingClientRect().width
      offsets = Array.from(trainEl.querySelectorAll<HTMLElement>('.tcard[data-copy="0"]')).map(el => ({ idx: +(el.dataset.idx ?? '0'), off: el.offsetLeft }))
    }
    measure()
    let offset = 0, last = 0, raf = 0
    const step = (t: number) => {
      if (!last) last = t
      const dt = Math.min(0.05, (t - last) / 1000); last = t
      if (!hoverRef.current && halfW > 0) {
        offset += SPEED * dt
        if (offset >= halfW) offset -= halfW
        trainEl.style.transform = `translateX(${-offset}px)`
      }
      // Current topic = the last tile whose left edge has reached the locked pin.
      let idx = 0
      for (const o of offsets) { if (o.off <= offset + pinW + 1) idx = o.idx; else break }
      setCurIdx(prev => (prev === idx ? prev : idx))
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    const ro = new ResizeObserver(() => measure())
    ro.observe(trainEl)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
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
  const current = topics[curIdx] ?? topics[0]
  const upNext = topics.length > 1
    ? Array.from({ length: Math.min(3, topics.length - 1) }, (_, k) => topics[(curIdx + 1 + k) % topics.length])
    : []

  const seg = (s: typeof train[number], copy: number) => s.kind === 'topic'
    ? <span className="tcard" data-copy={copy} data-idx={s.idx} key={`t${copy}-${s.idx}`}>
        {s.topic.sport && <span className="pbar" style={{ background: sportMeta(s.topic.sport).hex }} />}{s.topic.title}
      </span>
    : <Link className="item" href={s.h.href} key={`n${copy}-${s.key}`}><span className="text">{s.h.text}</span><span className="sep">•</span></Link>

  return (
    <div className="wrap" style={{ '--lp': primary, '--ls': secondary } as React.CSSProperties}>
      <span className="label">Wire</span>

      {card && (
        <Link href={`/leagues/${leagueId}/matchup/${card.id}`} className="scorecard" key={card.id}>
          <div className="schead">
            <span className="spchip" style={{ background: sportMeta(card.sport).hex }}>
              {card.sportLogo && <img src={card.sportLogo} alt="" className="splogo" />}
              {card.sportName || card.sport}
            </span>
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

      {topics.length > 0 && (
        <div className="stream" ref={streamRef}
          onMouseEnter={() => { hoverRef.current = true }}
          onMouseLeave={() => { hoverRef.current = false }}>
          <span className="pin" ref={pinRef}>
            {current?.sport && <span className="pbar" style={{ background: sportMeta(current.sport).hex }} />}
            {current?.title}
          </span>
          <div className="train" ref={trainRef}>
            {train.map(s => seg(s, 0))}
            {train.map(s => seg(s, 1))}
          </div>
        </div>
      )}

      {upNext.length > 0 && (
        <div className="queue">
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
        .wrap { position: sticky; top: 3.5rem; z-index: 40; width: 100%; display: flex; align-items: stretch; height: 66px; color: #e2e8f0; overflow: hidden; background: linear-gradient(0deg, rgba(2,6,23,.5), rgba(2,6,23,.5)), var(--lp); font-family: "punto", var(--font-score), ui-monospace, "SFMono-Regular", Menlo, monospace; }
        .label { flex-shrink: 0; display: flex; align-items: center; padding: 0 1.05rem; font-size: .72rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; background: var(--ls); color: var(--lp); }
        .scorecard { flex-shrink: 0; width: 196px; display: flex; flex-direction: column; justify-content: center; gap: 3px; padding: .3rem 1rem; border-right: 1px solid rgba(255,255,255,.14); text-decoration: none; color: #e2e8f0; }
        .schead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
        .spchip { display: inline-flex; align-items: center; gap: .22rem; font-size: .58rem; font-weight: 800; padding: .05rem .35rem; border-radius: .3rem; color: #fff; }
        .splogo { width: .8rem; height: .8rem; object-fit: contain; border-radius: 2px; }
        .status { font-size: .58rem; font-weight: 700; color: #cbd5e1; opacity: .75; text-transform: uppercase; }
        .status.live { color: #f87171; opacity: 1; }
        .team { display: flex; align-items: center; font-size: .82rem; line-height: 1.4; }
        .team.win { font-weight: 800; color: #fff; }
        .lg { width: 20px; height: 20px; object-fit: contain; border-radius: 3px; flex-shrink: 0; padding: 2px; margin-right: .55rem; }
        .badge { display: inline-flex; align-items: center; justify-content: center; font-size: .5rem; font-weight: 800; padding: 0; }
        .ab { width: 3.2rem; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sc { width: 5ch; flex-shrink: 0; margin-left: 1.1rem; text-align: right; font-family: "punto", var(--font-score), ui-monospace, "SFMono-Regular", Menlo, monospace; font-variant-numeric: tabular-nums; font-size: 1rem; letter-spacing: .06em; color: #fbbf24; }
        .pbar { width: 4px; height: 18px; border-radius: 2px; flex-shrink: 0; }
        .stream { position: relative; flex: 1; min-width: 0; height: 100%; overflow: hidden; border-right: 1px solid rgba(255,255,255,.14); }
        .pin { position: absolute; left: 0; top: 0; bottom: 0; z-index: 3; display: inline-flex; align-items: center; gap: .5rem; padding: 0 1.3rem; font-size: .82rem; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: var(--ls); background: linear-gradient(0deg, rgba(2,6,23,.5), rgba(2,6,23,.5)), var(--lp); box-shadow: 10px 0 14px -4px rgba(2,6,23,.75); white-space: nowrap; }
        .train { position: absolute; left: 0; top: 0; height: 100%; display: inline-flex; align-items: center; white-space: nowrap; will-change: transform; }
        .tcard { z-index: 1; flex-shrink: 0; display: inline-flex; align-items: center; gap: .5rem; height: 100%; padding: 0 1.25rem; font-size: .82rem; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: var(--ls); background: linear-gradient(0deg, rgba(2,6,23,.5), rgba(2,6,23,.5)), var(--lp); white-space: nowrap; }
        .item { display: inline-flex; align-items: center; flex-shrink: 0; font-size: .92rem; font-weight: 400; color: #eef2f7; text-decoration: none; font-family: "punto", var(--font-score), ui-monospace, "SFMono-Regular", Menlo, monospace; letter-spacing: .02em; }
        .item:hover .text { color: #fff; text-decoration: underline; }
        .text { white-space: nowrap; }
        .sep { display: inline-block; padding: 0 12px; color: rgba(255,255,255,.45); font-size: .7rem; }
        .queue { flex-shrink: 0; display: flex; align-items: center; gap: 1.4rem; padding: 0 1.5rem; border-left: 1px solid rgba(255,255,255,.14); }
        .queue > .qtile { animation: qslide .5s ease; }
        .upnext { font-size: .56rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: rgba(255,255,255,.45); white-space: nowrap; }
        .qtile { display: inline-flex; align-items: center; gap: .45rem; font-size: .8rem; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: rgba(238,242,247,.82); white-space: nowrap; }
        .qbar { width: 3px; height: 14px; border-radius: 2px; flex-shrink: 0; }
        .hide { flex-shrink: 0; padding: 0 .85rem; color: rgba(255,255,255,.35); font-size: .8rem; }
        .hide:hover { color: #fff; }
        @keyframes qslide { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: translateX(0); } }
        @media (max-width: 1024px) { .queue { display: none; } }
        @media (max-width: 640px) {
          .label { padding: 0 .6rem; font-size: .6rem; }
          .scorecard { width: 178px; padding: .3rem .65rem; }
          .tcard { padding: 0 .9rem; font-size: .76rem; }
          .sep { margin: 0 1.8rem; }
        }
      `}</style>
    </div>
  )
}
