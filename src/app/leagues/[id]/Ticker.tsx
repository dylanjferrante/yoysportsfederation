'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

type SlideTeam = { name: string; abbr: string; logo: string | null; primary: string; secondary: string; record: string; standing: number; score: number; win: boolean }
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
  const scrollWrapRef = useRef<HTMLSpanElement>(null)
  const scrollTxtRef = useRef<HTMLSpanElement>(null)

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
  useEffect(() => { if (slides.length && idx >= slides.length) setIdx(0) }, [slides.length]) // eslint-disable-line

  // Advance one slide at a time. If the slide's copy is too long to fit, scroll
  // it like a ticker and only advance once it has read all the way through;
  // otherwise hold for a fixed beat. Pause on hover throughout.
  useEffect(() => {
    if (hidden || slides.length <= 1) return
    const advance = () => setIdx(i => (i + 1) % slides.length)
    const wrap = scrollWrapRef.current, txt = scrollTxtRef.current
    let raf = 0, timer = 0
    if (txt) txt.style.transform = 'translateX(0)'
    const overflow = wrap && txt ? txt.scrollWidth - wrap.clientWidth : 0
    if (wrap && txt && overflow > 8) {
      const SPEED = 60 // px/sec
      let last = 0, offset = 0, lead = 1000, done = false
      const step = (t: number) => {
        if (!last) last = t
        const dt = t - last; last = t
        if (hoverRef.current) { raf = requestAnimationFrame(step); return }
        if (lead > 0) { lead -= dt; raf = requestAnimationFrame(step); return }
        offset += SPEED * dt / 1000
        if (offset >= overflow) { txt.style.transform = `translateX(${-overflow}px)`; if (!done) { done = true; timer = window.setTimeout(advance, 1400) } return }
        txt.style.transform = `translateX(${-offset}px)`
        raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    } else {
      const tick = () => { if (hoverRef.current) { timer = window.setTimeout(tick, 700); return } advance() }
      timer = window.setTimeout(tick, 6000)
    }
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); if (txt) txt.style.transform = 'translateX(0)' }
  }, [idx, slides, hidden])

  // Each slide belongs to a topic (a sport, or a news category). "Up Next"
  // shows the next distinct topics coming down the deck.
  const topicMeta = (s: Slide) => s.kind === 'game'
    ? { label: s.sportName, hex: sportMeta(s.sport).hex }
    : { label: s.topic, hex: s.sport ? sportMeta(s.sport).hex : secondary }

  const upNext = useMemo(() => {
    if (slides.length <= 1) return [] as { label: string; hex: string }[]
    const cur = topicMeta(slides[idx % slides.length]).label
    const out: { label: string; hex: string }[] = []
    const seen = new Set([cur])
    for (let k = 1; k <= slides.length && out.length < 3; k++) {
      const m = topicMeta(slides[(idx + k) % slides.length])
      if (seen.has(m.label)) continue
      seen.add(m.label); out.push(m)
    }
    return out
  }, [slides, idx, secondary]) // eslint-disable-line

  const setHiddenPersist = (v: boolean) => { setHidden(v); try { localStorage.setItem('nf_wire_hidden', v ? '1' : '0') } catch {} }

  const slide = slides.length ? slides[idx % slides.length] : null

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
      <span className="wlabel">Wire</span>

      <div className="stage">
        {slide.kind === 'game' ? (
          <Link href={slide.href} className="slide game" key={slide.id}>
            <div className="scoreline">
              <span className="spchip" style={{ background: sportMeta(slide.sport).hex }}>
                {slide.sportLogo && <img src={slide.sportLogo} alt="" className="splogo" />}
                {slide.sportName}
              </span>
              <span className={`status ${slide.status === 'LIVE' ? 'live' : ''}`}>{slide.status === 'LIVE' ? 'LIVE' : slide.status === 'PRE' ? 'Upcoming' : 'Final'}</span>
              <span className={`side ${slide.away.win ? 'win' : ''}`}>
                {slide.away.logo
                  ? <img src={slide.away.logo} alt="" className="tlogo" style={{ background: slide.away.primary }} />
                  : <span className="tlogo tbadge" style={{ background: slide.away.primary, color: slide.away.secondary }}>{slide.away.abbr.slice(0, 3)}</span>}
                <span className="tcol">
                  <span className="nm">{slide.away.name}</span>
                  <span className="sub">{slide.away.record}{slide.away.standing > 0 ? ` | #${slide.away.standing}` : ''}</span>
                </span>
                <span className="sc">{slide.status === 'PRE' ? '—' : slide.away.score}</span>
              </span>
              <span className={`side ${slide.home.win ? 'win' : ''}`}>
                {slide.home.logo
                  ? <img src={slide.home.logo} alt="" className="tlogo" style={{ background: slide.home.primary }} />
                  : <span className="tlogo tbadge" style={{ background: slide.home.primary, color: slide.home.secondary }}>{slide.home.abbr.slice(0, 3)}</span>}
                <span className="tcol">
                  <span className="nm">{slide.home.name}</span>
                  <span className="sub">{slide.home.record}{slide.home.standing > 0 ? ` | #${slide.home.standing}` : ''}</span>
                </span>
                <span className="sc">{slide.status === 'PRE' ? '—' : slide.home.score}</span>
              </span>
            </div>
            {slide.note && <div className="recapline"><span className="note" ref={scrollWrapRef}><span className="scroll" ref={scrollTxtRef}>{slide.note}</span></span></div>}
          </Link>
        ) : (
          <Link href={slide.href} className="slide news" key={slide.id}>
            <div className="scoreline">
              <span className="topicchip">
                <span className="tbar" style={{ background: slide.sport ? sportMeta(slide.sport).hex : secondary }} />
                {slide.topic}
              </span>
            </div>
            <div className="recapline"><span className="note" ref={scrollWrapRef}><span className="scroll headline" ref={scrollTxtRef}>{slide.text}</span></span></div>
          </Link>
        )}
      </div>

      {upNext.length > 0 && (
        <div className="queue">
          <span className="upnext">Up Next</span>
          {upNext.map((t, i) => (
            <span className="qtile" key={`${t.label}-${i}`}>
              <span className="qbar" style={{ background: t.hex }} />
              {t.label}
            </span>
          ))}
        </div>
      )}

      <button onClick={() => setHiddenPersist(true)} className="hide" aria-label="Hide wire">✕</button>

      <style jsx>{`
        .wrap { position: sticky; top: 3.5rem; z-index: 40; width: 100%; display: flex; align-items: stretch; height: 58px; color: #e2e8f0; overflow: hidden; background: linear-gradient(0deg, rgba(2,6,23,.5), rgba(2,6,23,.5)), var(--lp); font-family: "punto", var(--font-score), ui-monospace, "SFMono-Regular", Menlo, monospace; }
        .wlabel { flex-shrink: 0; display: flex; align-items: center; padding: 0 .95rem; font-size: .68rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; background: var(--ls); color: var(--lp); }
        .stage { flex: 1; min-width: 0; position: relative; overflow: hidden; display: flex; align-items: stretch; }
        .slide { display: flex; flex-direction: column; justify-content: center; gap: .2rem; width: 100%; min-width: 0; padding: .3rem 1.2rem; text-decoration: none; color: #e2e8f0; animation: fade .4s ease; }
        .scoreline { display: flex; align-items: center; gap: 1.6rem; min-width: 0; white-space: nowrap; }
        .spchip { flex-shrink: 0; display: inline-flex; align-items: center; gap: .3rem; font-size: .58rem; font-weight: 800; padding: .1rem .42rem; border-radius: .28rem; color: #fff; text-transform: uppercase; letter-spacing: .03em; }
        .splogo { width: .82rem; height: .82rem; object-fit: contain; border-radius: 2px; }
        .status { flex-shrink: 0; font-size: .56rem; font-weight: 800; color: #cbd5e1; opacity: .8; text-transform: uppercase; letter-spacing: .05em; }
        .status.live { color: #f87171; opacity: 1; }
        .side { flex-shrink: 0; display: inline-flex; align-items: center; gap: .55rem; }
        .tlogo { width: 22px; height: 22px; object-fit: contain; border-radius: 3px; flex-shrink: 0; padding: 1.5px; }
        .tbadge { display: inline-flex; align-items: center; justify-content: center; font-size: .52rem; font-weight: 800; padding: 0; }
        .tcol { display: flex; flex-direction: column; line-height: 1; }
        .nm { font-size: .86rem; font-weight: 600; color: #cbd5e1; white-space: nowrap; }
        .side.win .nm { font-weight: 800; color: #fff; }
        .sub { font-size: .56rem; font-weight: 600; color: rgba(226,232,240,.5); letter-spacing: .02em; white-space: nowrap; margin-top: 2px; }
        .sc { flex-shrink: 0; margin-left: .6rem; font-variant-numeric: tabular-nums; font-size: 1rem; font-weight: 800; letter-spacing: .03em; color: rgba(226,232,240,.55); }
        .side.win .sc { color: var(--ls); }
        .recapline { min-width: 0; overflow: hidden; }
        .note { display: block; min-width: 0; overflow: hidden; }
        .scroll { display: inline-block; white-space: nowrap; font-size: .82rem; font-weight: 500; color: rgba(238,242,247,.82); will-change: transform; }
        .slide:hover .scroll { color: #fff; }
        .headline { font-size: .9rem; color: #eef2f7; }
        .topicchip { flex-shrink: 0; display: inline-flex; align-items: center; gap: .45rem; font-size: .74rem; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: var(--ls); }
        .tbar { width: 4px; height: 16px; border-radius: 2px; flex-shrink: 0; }
        .queue { flex-shrink: 0; display: flex; align-items: center; gap: 1.1rem; padding: 0 1.3rem; border-left: 1px solid rgba(255,255,255,.14); }
        .queue > .qtile { animation: qslide .5s ease; }
        .upnext { font-size: .55rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: rgba(255,255,255,.42); white-space: nowrap; }
        .qtile { display: inline-flex; align-items: center; gap: .42rem; font-size: .76rem; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: rgba(238,242,247,.8); white-space: nowrap; }
        .qbar { width: 3px; height: 13px; border-radius: 2px; flex-shrink: 0; }
        .hide { flex-shrink: 0; color: rgba(255,255,255,.35); font-size: .8rem; padding: 0 .85rem; border-left: 1px solid rgba(255,255,255,.14); }
        .hide:hover { color: #fff; }
        @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes qslide { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: translateX(0); } }
        @media (max-width: 1024px) { .queue { display: none; } }
        @media (max-width: 640px) {
          .wlabel { padding: 0 .6rem; font-size: .6rem; }
          .scoreline { gap: 1rem; }
          .nm { max-width: 6rem; overflow: hidden; text-overflow: ellipsis; }
        }
      `}</style>
    </div>
  )
}
