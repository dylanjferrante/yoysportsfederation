'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

type SlideTeam = { name: string; abbr: string; logo: string | null; primary: string; secondary: string; record: string; score: number; win: boolean }
type GameSlide = { kind: 'game'; id: string; sport: string; sportName: string; sportLogo: string | null; status: 'Final' | 'LIVE' | 'PRE'; away: SlideTeam; home: SlideTeam; note: string; href: string }
type NewsSlide = { kind: 'news'; id: string; topic: string; sport?: string; text: string; href: string }
type Slide = GameSlide | NewsSlide

type Snapshot = { slides: Slide[]; idx: number }
const tickerCache = new Map<string, Snapshot>()

export default function Ticker({ leagueId, primary = '#0f172a', secondary = '#fbbf24' }: { leagueId: string; primary?: string; secondary?: string; sportAbbr?: Record<string, string> }) {
  const [slides, setSlides] = useState<Slide[]>(() => tickerCache.get(leagueId)?.slides ?? [])
  const [idx, setIdx] = useState(() => tickerCache.get(leagueId)?.idx ?? 0)
  const [hidden, setHidden] = useState(false)
  const [ready, setReady] = useState(false)
  const hoverRef = useRef(false)

  useEffect(() => {
    setHidden(typeof window !== 'undefined' && localStorage.getItem('nf_wire_hidden') === '1')
    setReady(true)
  }, [])

  // Poll the wire; keep the current slide index stable across refetches.
  useEffect(() => {
    let alive = true
    const load = () => fetch(`/api/leagues/${leagueId}/ticker`).then(r => r.json()).then(d => {
      if (!alive) return
      const sl: Slide[] = d.slides ?? []
      setSlides(sl)
      const c = tickerCache.get(leagueId)
      tickerCache.set(leagueId, { slides: sl, idx: c?.idx ?? 0 })
    }).catch(() => {})
    load()
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load() }, 45_000)
    return () => { alive = false; clearInterval(iv) }
  }, [leagueId])

  useEffect(() => { const c = tickerCache.get(leagueId); if (c) tickerCache.set(leagueId, { ...c, idx }) }, [leagueId, idx])

  // Auto-advance one slide at a time; pause on hover. Clamp the index if the
  // deck shrank on a refetch.
  useEffect(() => {
    if (hidden || slides.length <= 1) return
    setIdx(i => (i >= slides.length ? 0 : i))
    const iv = setInterval(() => { if (!hoverRef.current && document.visibilityState === 'visible') setIdx(i => (i + 1) % slides.length) }, 6000)
    return () => clearInterval(iv)
  }, [hidden, slides.length])

  const setHiddenPersist = (v: boolean) => { setHidden(v); try { localStorage.setItem('nf_wire_hidden', v ? '1' : '0') } catch {} }
  const go = (delta: number) => setIdx(i => (i + delta + slides.length) % slides.length)

  const slide = slides.length ? slides[idx % slides.length] : null
  const barHex = useMemo(() => {
    const s = slide && (slide.kind === 'game' ? slide.sport : slide.sport)
    return s ? sportMeta(s).hex : secondary
  }, [slide, secondary])

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

  if (!slide) return null

  return (
    <div className="wrap" style={{ '--lp': primary, '--ls': secondary } as React.CSSProperties}
      onMouseEnter={() => { hoverRef.current = true }}
      onMouseLeave={() => { hoverRef.current = false }}>
      <span className="label" style={{ background: barHex }}>Wire</span>

      <div className="stage">
        {slide.kind === 'game' ? (
          <Link href={slide.href} className="slide game" key={slide.id}>
            <div className="ghead">
              <span className="spchip" style={{ background: sportMeta(slide.sport).hex }}>
                {slide.sportLogo && <img src={slide.sportLogo} alt="" className="splogo" />}
                {slide.sportName}
              </span>
              <span className={`status ${slide.status === 'LIVE' ? 'live' : ''}`}>{slide.status === 'LIVE' ? 'LIVE' : slide.status === 'PRE' ? 'Upcoming' : 'Final'}</span>
            </div>
            <div className="gbody">
              <div className="teams">
                <div className={`trow ${slide.away.win ? 'win' : ''}`}>
                  {slide.away.logo
                    ? <img src={slide.away.logo} alt="" className="tlogo" style={{ background: slide.away.primary }} />
                    : <span className="tlogo tbadge" style={{ background: slide.away.primary, color: slide.away.secondary }}>{slide.away.abbr.slice(0, 3)}</span>}
                  <span className="tinfo"><span className="tname">{slide.away.name}</span><span className="trec">{slide.away.record}</span></span>
                  <span className="tscore">{slide.status === 'PRE' ? '—' : slide.away.score}</span>
                </div>
                <div className={`trow ${slide.home.win ? 'win' : ''}`}>
                  {slide.home.logo
                    ? <img src={slide.home.logo} alt="" className="tlogo" style={{ background: slide.home.primary }} />
                    : <span className="tlogo tbadge" style={{ background: slide.home.primary, color: slide.home.secondary }}>{slide.home.abbr.slice(0, 3)}</span>}
                  <span className="tinfo"><span className="tname">{slide.home.name}</span><span className="trec">{slide.home.record}</span></span>
                  <span className="tscore">{slide.status === 'PRE' ? '—' : slide.home.score}</span>
                </div>
              </div>
              {slide.note && <div className="note"><span className="notekick">{slide.status === 'Final' ? 'Recap' : slide.status === 'LIVE' ? 'Live' : 'Storyline'}</span><span className="notetext">{slide.note}</span></div>}
            </div>
          </Link>
        ) : (
          <Link href={slide.href} className="slide news" key={slide.id}>
            <span className="topicchip">
              <span className="tbar" style={{ background: slide.sport ? sportMeta(slide.sport).hex : secondary }} />
              {slide.topic}
            </span>
            <span className="headline">{slide.text}</span>
          </Link>
        )}
      </div>

      <div className="nav">
        <button onClick={() => go(-1)} className="arrow" aria-label="Previous">‹</button>
        <span className="count">{(idx % slides.length) + 1}<span className="of"> / {slides.length}</span></span>
        <button onClick={() => go(1)} className="arrow" aria-label="Next">›</button>
        <button onClick={() => setHiddenPersist(true)} className="hide" aria-label="Hide wire">✕</button>
      </div>

      <style jsx>{`
        .wrap { position: sticky; top: 3.5rem; z-index: 40; width: 100%; display: flex; align-items: stretch; height: 96px; color: #e2e8f0; overflow: hidden; background: linear-gradient(0deg, rgba(2,6,23,.5), rgba(2,6,23,.5)), var(--lp); font-family: "punto", var(--font-score), ui-monospace, "SFMono-Regular", Menlo, monospace; }
        .label { flex-shrink: 0; display: flex; align-items: center; padding: 0 1.05rem; font-size: .72rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--lp); }
        .stage { flex: 1; min-width: 0; position: relative; overflow: hidden; }
        .slide { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; gap: .3rem; padding: .5rem 1.4rem; text-decoration: none; color: #e2e8f0; animation: fade .45s ease; }
        .ghead { display: flex; align-items: center; gap: .6rem; }
        .spchip { display: inline-flex; align-items: center; gap: .3rem; font-size: .62rem; font-weight: 800; padding: .1rem .45rem; border-radius: .3rem; color: #fff; text-transform: uppercase; letter-spacing: .03em; }
        .splogo { width: .9rem; height: .9rem; object-fit: contain; border-radius: 2px; }
        .status { font-size: .6rem; font-weight: 800; color: #cbd5e1; opacity: .8; text-transform: uppercase; letter-spacing: .05em; }
        .status.live { color: #f87171; opacity: 1; }
        .gbody { display: flex; align-items: stretch; gap: 1.4rem; min-width: 0; }
        .teams { display: flex; flex-direction: column; gap: .25rem; flex-shrink: 0; min-width: 15rem; }
        .trow { display: flex; align-items: center; gap: .7rem; }
        .tlogo { width: 26px; height: 26px; object-fit: contain; border-radius: 4px; flex-shrink: 0; padding: 2px; }
        .tbadge { display: inline-flex; align-items: center; justify-content: center; font-size: .56rem; font-weight: 800; padding: 0; }
        .tinfo { display: flex; flex-direction: column; line-height: 1.05; min-width: 0; flex: 1; }
        .tname { font-size: .95rem; font-weight: 600; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .trow.win .tname { font-weight: 800; color: #fff; }
        .trec { font-size: .62rem; font-weight: 600; color: rgba(226,232,240,.5); letter-spacing: .02em; margin-top: 1px; }
        .tscore { margin-left: auto; padding-left: 1rem; font-variant-numeric: tabular-nums; font-size: 1.25rem; font-weight: 800; letter-spacing: .03em; color: rgba(226,232,240,.55); }
        .trow.win .tscore { color: var(--ls); }
        .note { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: .18rem; padding-left: 1.4rem; border-left: 1px solid rgba(255,255,255,.14); }
        .notekick { font-size: .58rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: var(--ls); opacity: .9; }
        .notetext { font-size: .95rem; font-weight: 500; color: #eef2f7; line-height: 1.25; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .news { flex-direction: row; align-items: center; gap: 1.2rem; }
        .topicchip { flex-shrink: 0; display: inline-flex; align-items: center; gap: .5rem; font-size: .78rem; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: var(--ls); }
        .tbar { width: 4px; height: 20px; border-radius: 2px; flex-shrink: 0; }
        .headline { font-size: 1.05rem; font-weight: 500; color: #eef2f7; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .news:hover .headline { color: #fff; }
        .nav { flex-shrink: 0; display: flex; align-items: center; gap: .35rem; padding: 0 .8rem; border-left: 1px solid rgba(255,255,255,.14); }
        .arrow { color: rgba(255,255,255,.55); font-size: 1.3rem; line-height: 1; padding: 0 .3rem; }
        .arrow:hover { color: #fff; }
        .count { font-size: .66rem; font-weight: 700; color: rgba(255,255,255,.6); font-variant-numeric: tabular-nums; min-width: 2.6rem; text-align: center; }
        .of { color: rgba(255,255,255,.35); }
        .hide { color: rgba(255,255,255,.35); font-size: .8rem; padding: 0 .3rem .1rem; margin-left: .3rem; }
        .hide:hover { color: #fff; }
        @keyframes fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 700px) {
          .note { display: none; }
          .teams { min-width: 0; flex: 1; }
          .headline { font-size: .92rem; }
        }
      `}</style>
    </div>
  )
}
