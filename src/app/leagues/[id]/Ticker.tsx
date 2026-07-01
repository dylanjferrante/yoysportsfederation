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
      title: k === 'FED' ? 'Federation' : k,
      sport: k === 'FED' ? undefined : k,
      items: bySport.get(k)!.slice(0, 12),
    }))
  }, [news])

  useEffect(() => { setTopicIdx(i => (topics.length && i >= topics.length ? 0 : i)) }, [topics.length])

  // The wire is one continuous train: [topic card][its headlines][next topic card]…
  // A fixed label names the topic currently at the pin; as each topic card slides
  // left and reaches the pin it hands off (the label updates to it).
  const [curIdx, setCurIdx] = useState(0)
  const pinRef = useRef<HTMLSpanElement>(null)
  const streamRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (hidden || topics.length === 0) return
    let raf = 0
    const tick = () => {
      const pin = pinRef.current, stream = streamRef.current
      if (pin && stream) {
        const pinX = pin.getBoundingClientRect().right
        let best = -Infinity, bestIdx = 0
        stream.querySelectorAll<HTMLElement>('.tcard').forEach(n => {
          const l = n.getBoundingClientRect().left
          if (l <= pinX + 2 && l > best) { best = l; bestIdx = +(n.dataset.idx ?? '0') }
        })
        setCurIdx(prev => (prev === bestIdx ? prev : bestIdx))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
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
  // One long train: for each topic, a topic card then its (de-duped) headlines.
  const train = useMemo(() => {
    const segs: Array<{ kind: 'topic'; idx: number; topic: Topic } | { kind: 'news'; h: News; key: string }> = []
    topics.forEach((t, ti) => {
      segs.push({ kind: 'topic', idx: ti, topic: t })
      const seen = new Set<string>()
      t.items.forEach((h, hi) => { const k = h.text.trim().toLowerCase(); if (seen.has(k)) return; seen.add(k); segs.push({ kind: 'news', h, key: `${ti}-${hi}` }) })
    })
    return segs
  }, [topics])
  const trainChars = useMemo(() => topics.reduce((n, t) => n + t.title.length + 8 + t.items.reduce((m, h) => m + h.text.length + 4, 0), 0), [topics])
  const duration = Math.max(40, Math.round(trainChars / 6))
  const current = topics[curIdx] ?? topics[0]
  const upNext = topics.length > 1
    ? Array.from({ length: Math.min(3, topics.length - 1) }, (_, k) => topics[(curIdx + 1 + k) % topics.length])
    : []

  const seg = (s: typeof train[number], copy: number) => s.kind === 'topic'
    ? <span className="tcard" data-idx={s.idx} key={`t${copy}-${s.idx}`}>
        {s.topic.sport && <span className="pbar" style={{ background: sportMeta(s.topic.sport).hex }} />}{s.topic.title}
      </span>
    : <Link className="item" href={s.h.href} key={`n${copy}-${s.key}`}><span className="text">{s.h.text}</span><span className="sep">•</span></Link>

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

      {topics.length > 0 && (
        <>
          <span className="pin" ref={pinRef}>
            {current?.sport && <span className="pbar" style={{ background: sportMeta(current.sport).hex }} />}
            {current?.title}
          </span>
          <div className="stream" ref={streamRef}>
            <div className="train" style={{ animationDuration: `${duration}s` }}>
              {train.map(s => seg(s, 0))}
              {train.map(s => seg(s, 1))}
            </div>
          </div>
        </>
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
        .spchip { font-size: .58rem; font-weight: 800; padding: .03rem .35rem; border-radius: .3rem; color: #fff; }
        .status { font-size: .58rem; font-weight: 700; color: #cbd5e1; opacity: .75; text-transform: uppercase; }
        .status.live { color: #f87171; opacity: 1; }
        .team { display: flex; align-items: center; font-size: .82rem; line-height: 1.4; }
        .team.win { font-weight: 800; color: #fff; }
        .lg { width: 20px; height: 20px; object-fit: contain; border-radius: 3px; flex-shrink: 0; padding: 2px; margin-right: .55rem; }
        .badge { display: inline-flex; align-items: center; justify-content: center; font-size: .5rem; font-weight: 800; padding: 0; }
        .ab { width: 3.2rem; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sc { width: 5ch; flex-shrink: 0; margin-left: 1.1rem; text-align: right; font-family: "punto", var(--font-score), ui-monospace, "SFMono-Regular", Menlo, monospace; font-variant-numeric: tabular-nums; font-size: 1rem; letter-spacing: .06em; color: #fbbf24; }
        .pin { flex-shrink: 0; display: inline-flex; align-items: center; gap: .55rem; padding: 0 1.4rem; font-size: .86rem; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: var(--ls); background: rgba(2,6,23,.55); border-right: 1px solid rgba(255,255,255,.12); white-space: nowrap; z-index: 2; }
        .pbar { width: 4px; height: 18px; border-radius: 2px; flex-shrink: 0; }
        .stream { position: relative; flex: 1; min-width: 0; overflow: hidden; display: flex; align-items: center; border-right: 1px solid rgba(255,255,255,.14); }
        .stream:hover .train { animation-play-state: paused; }
        .train { display: inline-flex; align-items: center; white-space: nowrap; will-change: transform; animation-name: ticker; animation-timing-function: linear; animation-iteration-count: infinite; }
        .tcard { flex-shrink: 0; display: inline-flex; align-items: center; gap: .5rem; margin: 0 1.1rem 0 1.5rem; padding: .28rem .95rem; border-radius: .4rem; font-size: .8rem; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: var(--ls); background: rgba(2,6,23,.5); white-space: nowrap; }
        .item { display: inline-flex; align-items: center; flex-shrink: 0; font-size: .92rem; font-weight: 400; color: #eef2f7; text-decoration: none; font-family: "punto", var(--font-score), ui-monospace, "SFMono-Regular", Menlo, monospace; letter-spacing: .02em; }
        .item:hover .text { color: #fff; text-decoration: underline; }
        .text { white-space: nowrap; }
        .sep { color: rgba(255,255,255,.4); margin: 0 1.9rem; font-size: .72rem; }
        .queue { flex-shrink: 0; display: flex; align-items: center; gap: 1.4rem; padding: 0 1.5rem; border-left: 1px solid rgba(255,255,255,.14); }
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
