'use client'

// Horizontal week picker: one chip per federation week (overall week # and its dates).
// Opens scrolled to the selected week; the current week carries a live dot.
import Link from 'next/link'
import { Fragment, useEffect, useRef } from 'react'

export type WeekChip = { week: number; dates: string; href: string; on: boolean; now: boolean; season?: string }

export default function WeekScroller({ weeks }: { weeks: WeekChip[] }) {
  const box = useRef<HTMLDivElement>(null)
  const sel = weeks.findIndex(w => w.on)
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('[data-on="true"]')
    if (el && box.current) box.current.scrollLeft = el.offsetLeft - (box.current.clientWidth - el.offsetWidth) / 2
  }, [sel])
  return (
    <div ref={box} className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {weeks.map((w, i) => (<Fragment key={(w.season ?? '') + w.week}>
        {w.season && w.season !== weeks[i - 1]?.season && (
          <span className="flex-none flex items-center justify-center h-[58px] px-2 font-display text-[13px] font-bold tracking-[.06em] text-ink-500 border-l-2 border-black first:border-l-0">{w.season.replace('-', '–')}</span>
        )}
        <Link href={w.href} scroll={false} data-on={w.on} aria-current={w.on ? 'true' : undefined}
          className={`flex-none flex flex-col items-center justify-center gap-1 min-w-[112px] h-[58px] px-3 rounded-lg border leading-none ${w.on ? 'bg-black text-white border-black' : 'bg-white text-black border-ink-100 hover:border-ink-400'}`}>
          <span className="inline-flex items-center gap-1.5 font-display text-[14px] font-bold tracking-[.06em]">
            {w.now && <span className={`w-1.5 h-1.5 rounded-full ${w.on ? 'bg-white' : 'bg-[#ba0c2f]'}`} />}WEEK {w.week}
          </span>
          <span className={`text-[11px] whitespace-nowrap ${w.on ? 'text-ink-200' : 'text-ink-500'}`}>{w.dates}</span>
        </Link>
      </Fragment>))}
    </div>
  )
}
