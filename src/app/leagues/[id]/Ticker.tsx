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

  // Each slide is its own item in wire order — game scores with a scorebug, and
  // league news as plain slides under their own topic (NFL/MLB/… or Federation/
  // Breaking/Trades), no scorebug.
  const deck = slides
  useEffect(() => { if (deck.length && idx >= deck.length) setIdx(0) }, [deck.length]) // eslint-disable-line

  // Timing per slide: it stays up at least MIN ms. If the copy fits, it just holds
  // (no scroll). If it overflows, it holds a beat, then scrolls right-to-left until
  // the last word clears the left edge before advancing. Pause on hover throughout.
  useEffect(() => {
    if (hidden || deck.length <= 1) return
    const MIN = 4500       // min ms a score/headline is shown
    const HOLD = 1500      // still beat before an overflowing line starts scrolling
    const SPEED = 70       // px/sec scroll speed
    const advance = () => setIdx(i => (i + 1) % deck.length)
    const txt0 = scrollTxtRef.current
    if (txt0) txt0.style.transform = 'translateX(0)'
    let raf = 0, timer = 0, measure = 0
    measure = requestAnimationFrame(() => {
      const wrap = scrollWrapRef.current, txt = scrollTxtRef.current
      const overflow = wrap && txt ? txt.scrollWidth - wrap.clientWidth : 0
      // Fits (or no copy): hold for the minimum, then advance — no scrolling.
      if (!wrap || !txt || overflow <= 4) {
        const tick = () => { if (hoverRef.current) { timer = window.setTimeout(tick, 700); return } advance() }
        timer = window.setTimeout(tick, MIN)
        return
      }
      // Overflows: scroll until the whole line (its last word included) clears the left edge.
      const rollOff = txt.scrollWidth + Math.max(0, txt.offsetLeft - wrap.offsetLeft)
      const scrollMs = (rollOff / SPEED) * 1000
      let last = 0, offset = 0, lead = Math.max(HOLD, MIN - scrollMs - 250), done = false
      const step = (t: number) => {
        if (!last) last = t
        const dt = t - last; last = t
        if (hoverRef.current) { raf = requestAnimationFrame(step); return }
        if (lead > 0) { lead -= dt; raf = requestAnimationFrame(step); return }   // initial still hold
        offset += SPEED * dt / 1000
        if (offset >= rollOff) { txt.style.transform = `translateX(${-rollOff}px)`; if (!done) { done = true; timer = window.setTimeout(advance, 250) } return }
        txt.style.transform = `translateX(${-offset}px)`
        raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    })
    return () => { cancelAnimationFrame(raf); cancelAnimationFrame(measure); clearTimeout(timer); const t = scrollTxtRef.current; if (t) t.style.transform = 'translateX(0)' }
  }, [idx, deck, hidden])

  // Each slide belongs to a topic (a sport, or a news category). "Up Next"
  // shows the next distinct topics coming down the deck.
  const topicMeta = (s: Slide) => s.kind === 'game'
    ? { label: s.sportName, hex: sportMeta(s.sport).hex }
    : { label: s.topic, hex: s.sport ? sportMeta(s.sport).hex : secondary }

  const upNext = useMemo(() => {
    if (deck.length <= 1) return [] as { label: string; hex: string }[]
    const cur = topicMeta(deck[idx % deck.length]).label
    const out: { label: string; hex: string }[] = []
    const seen = new Set([cur])
    for (let k = 1; k <= deck.length && out.length < 3; k++) {
      const m = topicMeta(deck[(idx + k) % deck.length])
      if (seen.has(m.label)) continue
      seen.add(m.label); out.push(m)
    }
    return out
  }, [deck, idx, secondary]) // eslint-disable-line

  const setHiddenPersist = (v: boolean) => { setHidden(v); try { localStorage.setItem('nf_wire_hidden', v ? '1' : '0') } catch {} }

  const slide = deck.length ? deck[idx % deck.length] : null

  if (!ready) return null

  if (hidden) {
    return (
      <div className="wirebar" style={{ background: primary }}>
        <button onClick={() => setHiddenPersist(false)} className="show">Show Wire</button>
        <style jsx>{`
          .wirebar { position: sticky; top: 3.5rem; z-index: 40; width: 100%; display: flex; justify-content: center; }
          .show { color: #fff; opacity: .85; font-size: .68rem; font-weight: 400; letter-spacing: .03em; text-transform: uppercase; padding: .35rem .8rem; }
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
          <Link href={slide.href} key={slide.id} style={{ display: 'flex', flex: 1, minWidth: 0, alignItems: 'stretch', textDecoration: 'none' }}>
          <div className="slide game">
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
                  <span className="nm">{slide.away.abbr}</span>
                  <span className="sub">{slide.away.record}{slide.away.standing > 0 ? ` | #${slide.away.standing}` : ''}</span>
                </span>
                <span className="sc">{slide.status === 'PRE' ? '—' : slide.away.score.toFixed(1)}</span>
              </span>
              <span className={`side ${slide.home.win ? 'win' : ''}`}>
                {slide.home.logo
                  ? <img src={slide.home.logo} alt="" className="tlogo" style={{ background: slide.home.primary }} />
                  : <span className="tlogo tbadge" style={{ background: slide.home.primary, color: slide.home.secondary }}>{slide.home.abbr.slice(0, 3)}</span>}
                <span className="tcol">
                  <span className="nm">{slide.home.abbr}</span>
                  <span className="sub">{slide.home.record}{slide.home.standing > 0 ? ` | #${slide.home.standing}` : ''}</span>
                </span>
                <span className="sc">{slide.status === 'PRE' ? '—' : slide.home.score.toFixed(1)}</span>
              </span>
            </div>
            {slide.note && <span className="divider" />}
            {slide.note && <span className="note" ref={scrollWrapRef}><span className="scroll" ref={scrollTxtRef}>{slide.note}</span></span>}
          </div>
          </Link>
        ) : (
          <Link href={slide.href} key={slide.id} style={{ display: 'flex', flex: 1, minWidth: 0, alignItems: 'stretch', textDecoration: 'none' }}>
          <div className="slide news">
            <div className="scoreline">
              <span className="topicchip"><span className="tbar" style={{ background: slide.sport ? sportMeta(slide.sport).hex : secondary }} />{slide.topic}</span>
            </div>
            <span className="divider" />
            <span className="note" ref={scrollWrapRef}><span className="scroll headline" ref={scrollTxtRef}>{slide.text}</span></span>
          </div>
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
        .wrap { position: sticky; top: 3.5rem; z-index: 40; width: 100%; display: flex; align-items: stretch; height: 50px; color: #e2e8f0; overflow: hidden; background: linear-gradient(0deg, rgba(2,6,23,.5), rgba(2,6,23,.5)), var(--lp); font-family: "Bitcount Single", var(--font-score), "punto", ui-monospace, "SFMono-Regular", Menlo, monospace; font-weight: 400; }
        .wlabel { flex-shrink: 0; display: flex; align-items: center; padding: 0 .95rem; margin-right: 1rem; font-size: .68rem; font-weight: 400; letter-spacing: .08em; text-transform: uppercase; background: var(--ls); color: var(--lp); }
        .stage { flex: 1; min-width: 0; position: relative; overflow: hidden; display: flex; align-items: stretch; }
        .slide { display: flex; flex-direction: row; align-items: center; gap: 1.3rem; width: 100%; min-width: 0; padding: 0 1.2rem; text-decoration: none; color: #e2e8f0; animation: ledOn .5s ease both; }
        .scoreline { flex-shrink: 0; display: flex; align-items: center; gap: 1.6rem; min-width: 0; white-space: nowrap; }
        .divider { flex-shrink: 0; width: 1px; height: 26px; background: rgba(255,255,255,.2); }
        .spchip { flex-shrink: 0; display: inline-flex; align-items: center; gap: .3rem; font-size: .58rem; font-weight: 400; padding: .1rem .42rem; border-radius: .28rem; color: #fff; text-transform: uppercase; letter-spacing: .03em; }
        .splogo { width: .82rem; height: .82rem; object-fit: contain; border-radius: 2px; }
        .status { flex-shrink: 0; font-size: .56rem; font-weight: 400; color: #cbd5e1; opacity: .8; text-transform: uppercase; letter-spacing: .05em; }
        .status.live { color: #f87171; opacity: 1; }
        .side { flex-shrink: 0; display: inline-flex; align-items: center; gap: .55rem; }
        .tlogo { width: 22px; height: 22px; object-fit: contain; border-radius: 3px; flex-shrink: 0; padding: 1.5px; }
        .tbadge { display: inline-flex; align-items: center; justify-content: center; font-size: .52rem; font-weight: 400; padding: 0; }
        .tcol { display: flex; flex-direction: column; line-height: 1; }
        .nm { display: inline-block; min-width: 3.2em; font-size: .86rem; font-weight: 400; color: #cbd5e1; white-space: nowrap; }
        .side.win .nm { font-weight: 400; color: #fff; }
        .sub { font-size: .56rem; font-weight: 400; color: rgba(226,232,240,.5); letter-spacing: .02em; white-space: nowrap; margin-top: 2px; }
        .sc { flex-shrink: 0; margin-left: .6rem; min-width: 3.6em; text-align: right; font-variant-numeric: tabular-nums; font-size: 1rem; font-weight: 400; letter-spacing: .03em; color: rgba(226,232,240,.55); }
        .side.win .sc { color: var(--ls); }
        .note { flex: 1; min-width: 0; overflow: hidden; display: flex; align-items: center; align-self: stretch; }
        .scroll { display: inline-block; white-space: nowrap; font-size: .82rem; font-weight: 400; color: rgba(238,242,247,.82); will-change: transform; }
        .slide:hover .scroll { color: #fff; }
        .hlink { color: inherit; text-decoration: none; }
        .hlink:hover { color: #fff; text-decoration: underline; }
        .hdivider { display: inline-block; margin: 0 14px; color: var(--ls); opacity: .8; }
        .headline { font-size: .9rem; color: #eef2f7; }
        .topicchip { flex-shrink: 0; display: inline-flex; align-items: center; gap: .45rem; font-size: .74rem; font-weight: 400; text-transform: uppercase; letter-spacing: .05em; color: var(--ls); }
        .tbar { width: 4px; height: 16px; border-radius: 2px; flex-shrink: 0; }
        .queue { flex-shrink: 0; display: flex; align-items: center; gap: 1.1rem; padding: 0 1.3rem; border-left: 1px solid rgba(255,255,255,.14); }
        .queue > .qtile { animation: qslide .5s ease; }
        .upnext { font-size: .55rem; font-weight: 400; text-transform: uppercase; letter-spacing: .08em; color: rgba(255,255,255,.42); white-space: nowrap; }
        .qtile { display: inline-flex; align-items: center; gap: .42rem; font-size: .76rem; font-weight: 400; text-transform: uppercase; letter-spacing: .04em; color: rgba(238,242,247,.8); white-space: nowrap; }
        .qbar { width: 3px; height: 13px; border-radius: 2px; flex-shrink: 0; }
        .hide { flex-shrink: 0; color: rgba(255,255,255,.35); font-size: .8rem; padding: 0 .85rem; border-left: 1px solid rgba(255,255,255,.14); }
        .hide:hover { color: #fff; }
        @keyframes ledOn {
          0% { opacity: .25; } 35% { opacity: .9; } 50% { opacity: .72; } 100% { opacity: 1; }
        }
        @keyframes qslide { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: translateX(0); } }
        @media (max-width: 1024px) { .queue { display: none; } }
        @media (max-width: 640px) {
          .wlabel { padding: 0 .7rem; font-size: .58rem; margin-right: .5rem; }
          .slide { gap: .7rem; padding: 0 .7rem; }
          .scoreline { gap: .7rem; }
          .spchip { font-size: .5rem; padding: .08rem .3rem; }
          .splogo { width: .72rem; height: .72rem; }
          .status { font-size: .48rem; }
          .side { gap: .32rem; }
          .nm { min-width: 2.8em; font-size: .8rem; }
          .sc { min-width: 3.2em; }
          .tlogo { width: 18px; height: 18px; }
          .sub { font-size: .5rem; }
          .sc { margin-left: .3rem; font-size: .84rem; }
          .divider { height: 20px; }
          .scroll { font-size: .76rem; }
          .headline { font-size: .82rem; }
          .hide { padding: 0 .5rem; }
          /* No room for scores + recap on a phone — show the scoreboard clean;
             news slides still scroll their headline. */
          .slide.game .divider, .slide.game .note { display: none; }
        }
      `}</style>
    </div>
  )
}
