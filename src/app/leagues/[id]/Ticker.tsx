'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

type Side = { name: string; abbr: string; logo: string | null; primary: string; secondary: string; score: number; win: boolean }
type Card = { id: string; sport: string; status: 'Final' | 'LIVE' | 'PRE'; home: Side; away: Side }
type News = { id: string; category: string; sport?: string; text: string; href: string }
type Topic = { key: string; title: string; sport?: string; items: News[] }
type Seg = { type: 'title'; t: Topic } | { type: 'item'; h: News }

const CATEGORY_TITLE: Record<string, string> = {
  PERFORMANCE: 'Top Performers', MILESTONE: 'Milestones', SHOOTOUT: 'Shootouts', SUPERLATIVE: 'Leaders',
  TRANSACTION: 'Transactions', STREAK: 'Streaks', STANDINGS: 'Standings', POWER: 'Power Rankings',
  PLAYOFF: 'Playoffs', CHAMPION: 'Champions', DRAFT: 'Draft', PREVIEW: 'On Deck', RIVALRY: 'Rivalries',
  FORM: 'Form', PACE: 'Pace', FEDERATION: 'Federation', GOVERNANCE: 'League Office', SCHEDULE: 'Schedule',
}

type Snapshot = { scores: Card[]; news: News[]; cardIdx: number }
const tickerCache = new Map<string, Snapshot>()

export default function Ticker({ leagueId, primary = '#0f172a', secondary = '#fbbf24' }: { leagueId: string; primary?: string; secondary?: string }) {
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
      tickerCache.set(leagueId, { scores: sc, news: nw, cardIdx: tickerCache.get(leagueId)?.cardIdx ?? 0 })
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

  const belt = useMemo<Seg[]>(() => topics.flatMap(t => [{ type: 'title', t } as Seg, ...t.items.map(h => ({ type: 'item', h } as Seg))]), [topics])
  const totalChars = useMemo(() => belt.reduce((n, s) => n + (s.type === 'title' ? s.t.title.length + 4 : s.h.text.length + 4), 0), [belt])
  const duration = Math.max(40, Math.round(totalChars * 0.2))

  const setHiddenPersist = (v: boolean) => { setHidden(v); try { localStorage.setItem('nf_wire_hidden', v ? '1' : '0') } catch {} }

  if (!ready) return null

  if (hidden) {
    return (
      <div className="wirebar" style={{ background: primary }}>
        <button onClick={() => setHiddenPersist(false)} className="show">📡 Show Wire</button>
        <style jsx>{`
          .wirebar { position: sticky; top: 3.5rem; z-index: 40; width: 100%; display: flex; justify-content: center; }
          .show { color: #fff; opacity: .85; font-size: .68rem; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; padding: .35rem .8rem; }
          .show:hover { opacity: 1; }
        `}</style>
      </div>
    )
  }

  if (!scores.length && !belt.length) return null

  const card = scores.length ? scores[cardIdx % scores.length] : null
  const sides = card ? [card.away, card.home] : []
  const pre = card?.status === 'PRE'

  return (
    <div className="wrap" style={{ '--lp': primary, '--ls': secondary } as React.CSSProperties}>
      <span className="label">📡&nbsp;Wire</span>

      {card && (
        <Link href={`/leagues/${leagueId}/matchup/${card.id}`} className="scorecard" key={card.id}>
          <div className="schead">
            <span className="spchip" style={{ background: sportMeta(card.sport).hex }}>{card.sport}</span>
            <span className={`status ${card.status === 'LIVE' ? 'live' : ''}`}>{card.status === 'LIVE' ? '● LIVE' : card.status === 'PRE' ? 'Upcoming' : 'Final'}</span>
          </div>
          {sides.map((s, i) => (
            <div className={`team ${s.win ? 'win' : ''}`} key={i}>
              {s.logo
                ? <img src={s.logo} alt="" className="lg" />
                : <span className="lg badge" style={{ background: s.primary, color: s.secondary }}>{s.abbr.slice(0, 3)}</span>}
              <span className="ab">{s.abbr}</span>
              <span className="sc">{pre ? '—' : s.score}</span>
            </div>
          ))}
        </Link>
      )}

      {belt.length > 0 && (
        <div className="viewport">
          <div className="track" style={{ animationDuration: `${duration}s` }}>
            <div className="strip">
              {belt.map((seg, i) => seg.type === 'title' ? (
                <span className="ttile" key={`a-t-${seg.t.key}-${i}`}>
                  {seg.t.sport && <span className="tbar" style={{ background: sportMeta(seg.t.sport).hex }} />}
                  {seg.t.title}
                </span>
              ) : (
                <Link className="item" href={seg.h.href} key={`a-h-${seg.h.id}-${i}`}>
                  <span className="text">{seg.h.text}</span>
                  <span className="sep">•</span>
                </Link>
              ))}
            </div>
            <div className="strip" aria-hidden>
              {belt.map((seg, i) => seg.type === 'title' ? (
                <span className="ttile" key={`b-t-${seg.t.key}-${i}`}>
                  {seg.t.sport && <span className="tbar" style={{ background: sportMeta(seg.t.sport).hex }} />}
                  {seg.t.title}
                </span>
              ) : (
                <span className="item" key={`b-h-${seg.h.id}-${i}`}>
                  <span className="text">{seg.h.text}</span>
                  <span className="sep">•</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <button onClick={() => setHiddenPersist(true)} className="hide" aria-label="Hide wire">✕</button>

      <style jsx>{`
        .wrap { position: sticky; top: 3.5rem; z-index: 40; width: 100%; display: flex; align-items: stretch; height: 66px; color: #e2e8f0; overflow: hidden; background: linear-gradient(90deg, rgba(2,6,23,.62), rgba(2,6,23,.42)), var(--lp); }
        .label { flex-shrink: 0; display: flex; align-items: center; padding: 0 1rem; font-size: .7rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; background: var(--ls); color: var(--lp); }
        .scorecard { flex-shrink: 0; width: 196px; display: flex; flex-direction: column; justify-content: center; gap: 3px; padding: .3rem 1rem; border-right: 1px solid rgba(255,255,255,.14); text-decoration: none; color: #e2e8f0; }
        .schead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
        .spchip { font-size: .58rem; font-weight: 800; padding: .03rem .35rem; border-radius: .3rem; color: #fff; }
        .status { font-size: .58rem; font-weight: 700; color: #cbd5e1; opacity: .75; text-transform: uppercase; }
        .status.live { color: #f87171; opacity: 1; }
        .team { display: flex; align-items: center; font-size: .82rem; line-height: 1.4; }
        .team.win { font-weight: 800; color: #fff; }
        .lg { width: 18px; height: 18px; object-fit: contain; border-radius: 3px; flex-shrink: 0; background: rgba(255,255,255,.1); margin-right: .55rem; }
        .badge { display: inline-flex; align-items: center; justify-content: center; font-size: .5rem; font-weight: 800; }
        .ab { width: 3.2rem; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sc { width: 4.4ch; flex-shrink: 0; margin-left: 1.3rem; text-align: right; font-family: "punto", var(--font-score), ui-monospace, "SFMono-Regular", Menlo, monospace; font-variant-numeric: tabular-nums; font-size: 1rem; letter-spacing: .06em; color: #fbbf24; text-shadow: 0 0 6px rgba(251,191,36,.4); }
        .viewport { position: relative; flex: 1; min-width: 0; overflow: hidden; display: flex; align-items: center; }
        .viewport:hover .track { animation-play-state: paused; }
        .track { display: inline-flex; white-space: nowrap; will-change: transform; animation-name: ticker; animation-timing-function: linear; animation-iteration-count: infinite; }
        .strip { display: inline-flex; align-items: center; }
        .ttile { display: inline-flex; align-items: center; gap: .55rem; flex-shrink: 0; margin: 0 1.9rem 0 2.4rem; font-size: .88rem; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: var(--ls); }
        .tbar { width: 4px; height: 18px; border-radius: 2px; flex-shrink: 0; }
        .item { display: inline-flex; align-items: center; flex-shrink: 0; font-size: .9rem; font-weight: 500; color: #eef2f7; text-decoration: none; }
        .item:hover .text { color: #fff; text-decoration: underline; }
        .text { white-space: nowrap; }
        .sep { color: rgba(255,255,255,.4); margin: 0 1.9rem; font-size: .72rem; }
        .hide { flex-shrink: 0; padding: 0 .85rem; color: rgba(255,255,255,.35); font-size: .8rem; }
        .hide:hover { color: #fff; }
        @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @media (max-width: 640px) {
          .label { padding: 0 .6rem; font-size: .6rem; }
          .scorecard { width: 178px; padding: .3rem .65rem; }
          .ttile { margin: 0 1.1rem 0 1.4rem; }
          .sep { margin: 0 1.2rem; }
        }
      `}</style>
    </div>
  )
}
