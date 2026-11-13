'use client'
// Top stories on the front page: 3–5 slides that swipe on phones, step with the arrows and dots,
// and advance on their own every few seconds until someone touches them.
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import StoryArt, { type ArtTile } from '@/components/ysf/StoryArt'

export type Slide = { id: string; href: string; kicker: string; headline: string; dek: string; by: string; tiles: ArtTile[] }

export default function NewsCarousel({ slides, more }: { slides: Slide[]; more: string }) {
  const track = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(0)
  const [held, setHeld] = useState(false)

  const go = (i: number) => {
    const el = track.current; if (!el) return
    const n = (i + slides.length) % slides.length
    el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' })
  }
  // the dot follows the slide in view, however it got there
  useEffect(() => {
    const el = track.current; if (!el) return
    const on = () => setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
    el.addEventListener('scroll', on, { passive: true })
    return () => el.removeEventListener('scroll', on)
  }, [])
  useEffect(() => {
    if (held || slides.length < 2) return
    const t = setTimeout(() => go(at + 1), 7000)
    return () => clearTimeout(t)
  }, [at, held, slides.length])

  if (!slides.length) return null
  return (
    <section className="flex flex-col gap-3" onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onTouchStart={() => setHeld(true)} onFocus={() => setHeld(true)}>
      <div className="flex items-center justify-between gap-3 border-b-2 border-black pb-2">
        <div className="ui text-[13px] tracking-[.18em] font-bold">TOP STORIES</div>
        <div className="flex items-center gap-2">
          <Link href={more} className="ui text-[12px] font-bold tracking-[.12em] text-ink-500 hover:text-black mr-1">ALL NEWS →</Link>
          <button aria-label="Previous story" onClick={() => go(at - 1)} className="w-8 h-8 rounded border border-ink-200 font-bold hover:bg-ink-50">‹</button>
          <button aria-label="Next story" onClick={() => go(at + 1)} className="w-8 h-8 rounded border border-ink-200 font-bold hover:bg-ink-50">›</button>
        </div>
      </div>
      <div ref={track} className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {slides.map(s => (
          <Link key={s.id} href={s.href} className="group flex-none w-full snap-start flex flex-col rounded overflow-hidden border border-ink-100">
            <StoryArt tiles={s.tiles} className="aspect-[2/1] flex-auto !rounded-none" />
            <div className="flex flex-col gap-1.5 p-4 sm:p-5 min-w-0">
              <div className="ui text-[12px] font-bold tracking-[.14em] text-[#ba0c2f]"><span className="ysf-case">{s.kicker}</span></div>
              <h2 className="disp text-[24px] sm:text-[30px] font-extrabold leading-[.95] group-hover:underline break-words line-clamp-2">{s.headline}</h2>
              <div className="text-[12px] text-ink-500 mt-0.5">{s.by}</div>
            </div>
          </Link>
        ))}
      </div>
      <div className="flex justify-center gap-2">
        {slides.map((s, i) => <button key={s.id} aria-label={`Story ${i + 1}`} onClick={() => go(i)} className="h-2 rounded-full transition-all" style={{ width: i === at ? 24 : 8, background: i === at ? '#000' : '#C9C9C9' }} />)}
      </div>
    </section>
  )
}
