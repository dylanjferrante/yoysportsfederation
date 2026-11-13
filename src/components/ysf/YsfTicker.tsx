'use client'

// The ySF bottom crawl (from the redesign): black bar, ySF mark, then a continuous crawl of
// league tiles → section tags → items. The current league tile and section tag stay pinned at
// the left edge until the next one slides in over them. Hide/show tab at the top right.
import { Fragment, useEffect, useRef, useState } from 'react'
import { YSF_ART } from '@/lib/ysf'
import type { TickerBlock } from '@/lib/ysf-ticker'

const PX_PER_SEC = 70

function Tile({ b, idx, pinned }: { b: TickerBlock; idx?: number; pinned?: boolean }) {
  return (
    <span data-lg={pinned ? undefined : idx} className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 min-h-[40px] sm:min-h-[56px] whitespace-nowrap font-display text-[11px] sm:text-[13px] font-bold tracking-[.06em]" style={{ background: b.bg, color: b.fg }}>
      {b.logo && <span className="w-[22px] h-[22px] sm:w-[30px] sm:h-[30px] inline-flex items-center justify-center flex-none"><img src={b.logo} alt="" className="w-[20px] h-[20px] sm:w-[26px] sm:h-[26px] object-contain" /></span>}
      <span className={pinned && b.logo ? 'ysf-case hidden sm:inline' : 'ysf-case'}>{b.name}</span>
    </span>
  )
}
function Tag({ label, bd, gid }: { label: string; bd: string; gid?: number }) {
  return <span data-grp={gid} className="inline-flex items-center px-2 sm:px-3 min-h-[40px] sm:min-h-[56px] whitespace-nowrap bg-white text-black font-display text-[10px] sm:text-[12px] font-bold tracking-[.1em]" style={{ borderLeft: `3px solid ${bd}` }}>{label}</span>
}

export default function YsfTicker({ blocks }: { blocks: TickerBlock[] }) {
  const [hidden, setHidden] = useState(false)
  const [pin, setPin] = useState<{ l: number; g: number }>({ l: 0, g: -1 })
  const track = useRef<HTMLDivElement>(null), lpin = useRef<HTMLSpanElement>(null), gpin = useRef<HTMLSpanElement>(null)
  const [dur, setDur] = useState(120)
  useEffect(() => { try { setHidden(localStorage.getItem('ysf_tk_hidden') === '1') } catch { /* private mode */ } }, [])
  const toggle = () => { const v = !hidden; setHidden(v); try { localStorage.setItem('ysf_tk_hidden', v ? '1' : '0') } catch { /* ignore */ } }

  // groups get a running id so the pinned tag can follow them
  let gid = 0
  const flat = blocks.map(b => ({ b, groups: b.groups.map(g => ({ ...g, gid: gid++ })) }))
  const groupsById = flat.flatMap(f => f.groups)

  useEffect(() => {
    if (hidden || !track.current) return
    setDur(Math.max(40, track.current.scrollWidth / 2 / PX_PER_SEC))
    let raf = 0
    const tick = () => {
      const el = track.current, lp = lpin.current, gp = gpin.current
      if (el && lp && gp) {
        const tf = getComputedStyle(el).transform
        const tx = tf && tf !== 'none' ? new DOMMatrixReadOnly(tf).m41 : 0
        const lw = lp.getBoundingClientRect().width
        gp.style.left = (lw - 1) + 'px'
        let cl = -1, nextL: number | null = null, cg = -1, nextG: number | null = null
        for (const l of el.querySelectorAll<HTMLElement>('[data-lg]')) { const x = l.offsetLeft + tx; if (x <= 0.5) cl = +l.dataset.lg!; else { nextL = x; break } }
        for (const g of el.querySelectorAll<HTMLElement>('[data-grp]')) { const x = g.offsetLeft + tx; if (x <= lw + 0.5) cg = +g.dataset.grp!; else { nextG = x; break } }
        if (cl < 0) cl = 0
        lp.style.clipPath = `inset(0 ${nextL == null ? 0 : Math.max(0, lw - nextL)}px 0 0)`
        const edge = Math.min(nextL ?? 1e9, nextG ?? 1e9)
        gp.style.clipPath = `inset(0 ${Math.max(0, lw + gp.offsetWidth - edge)}px 0 0)`
        setPin(p => (p.l === cl % blocks.length && p.g === cg % Math.max(1, groupsById.length) ? p : { l: cl % blocks.length, g: cg % Math.max(1, groupsById.length) }))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [hidden, blocks.length, groupsById.length])

  if (!blocks.length) return null
  const pinnedBlock = blocks[pin.l] ?? blocks[0]
  const pinnedGroup = pin.g >= 0 ? groupsById[pin.g] : null
  const run = (copy: number) => flat.map((f, i) => (
    <span key={`${copy}-${i}`} className="inline-flex items-stretch">
      <Tile b={f.b} idx={i + copy * blocks.length} />
      {f.groups.map(g => (
        <span key={g.gid} className="inline-flex items-stretch">
          <Tag label={g.label} bd={g.bd} gid={g.gid + copy * groupsById.length} />
          {g.items.map((it, k) => (
            <span key={k} className="inline-flex items-stretch">
            {k > 0 && <span className="w-px self-stretch bg-ink-400 flex-none" />}
            <span className="inline-flex items-stretch gap-2 sm:gap-2.5 px-3 sm:px-[22px]">
              {it.live && <span className="self-center w-2 h-2 rounded-full bg-[#ba0c2f] flex-none" />}
              {it.score ? it.score.map((sd, j) => (
                <span key={j} className={`self-center inline-flex items-center gap-2 whitespace-nowrap${j > 0 ? ' ml-2' : ''}`}>
                  <span className="w-6 h-6 sm:w-8 sm:h-8 inline-flex items-center justify-center rounded-[2px] flex-none" style={{ background: sd.mark.bg }}><img src={sd.mark.src} alt="" className="w-[18px] h-[18px] sm:w-6 sm:h-6 object-contain" /></span>
                  <span className="text-[13px] sm:text-[15px] font-semibold">{sd.ab}</span>
                  {sd.v != null && <span className={`text-[13px] sm:text-[15px] tabular-nums ${sd.win ? 'font-extrabold text-white' : 'font-medium text-ink-200'}`}>{sd.v}</span>}
                </span>
              )) : <>
                <span className="self-center inline-flex gap-[3px] flex-none">{it.marks.map((m, j) => (
                  <span key={j} className="w-6 h-6 sm:w-8 sm:h-8 inline-flex items-center justify-center rounded-[2px]" style={{ background: m.bg }}><img src={m.src} alt="" className="w-[18px] h-[18px] sm:w-6 sm:h-6 object-contain" /></span>
                ))}</span>
                <span className="self-center text-[13px] sm:text-[15px] font-semibold whitespace-nowrap ysf-case">{it.text}</span>
              </>}
              <span className="self-center text-[11px] sm:text-[12px] text-ink-400 whitespace-nowrap">{it.ago}</span>
            </span>
            </span>
          ))}
        </span>
      ))}
    </span>
  ))

  return (
    <div className="relative">
      <button type="button" onClick={toggle} aria-label={hidden ? 'Show ticker' : 'Hide ticker'}
        className="absolute right-4 bottom-full w-11 h-6 rounded-t-md bg-black text-white text-[13px] leading-none inline-flex items-center justify-center">{hidden ? '▴' : '▾'}</button>
      {!hidden && (
        <div className="bg-black text-white flex items-stretch min-h-[40px] sm:min-h-[56px] border-t border-ink-800">
          <div className="hidden sm:flex px-4 items-center flex-none border-r border-[#333]"><img src={YSF_ART.primaryOnBlack} alt="yoy Sports Federation" className="h-[34px] w-auto" /></div>
          <div className="flex-1 min-w-0 overflow-hidden flex items-center relative">
            <span ref={lpin} className="absolute left-0 top-0 bottom-0 z-[3] inline-flex"><Tile b={pinnedBlock} pinned /></span>
            <span ref={gpin} className="absolute top-0 bottom-0 z-[2] inline-flex" style={{ visibility: pinnedGroup ? 'visible' : 'hidden' }}>{pinnedGroup && <Tag label={pinnedGroup.label} bd={pinnedGroup.bd} />}</span>
            <div ref={track} className="ysf-marq flex items-center w-max whitespace-nowrap" style={{ animationDuration: `${dur}s` }}>
              <Fragment>{run(0)}</Fragment><Fragment>{run(1)}</Fragment>
            </div>
          </div>
        </div>
      )}
      <style>{`.ysf-marq{animation:ysf-marq linear infinite}.ysf-marq:hover{animation-play-state:paused}@keyframes ysf-marq{from{transform:translateX(0)}to{transform:translateX(-50%)}}@media (prefers-reduced-motion:reduce){.ysf-marq{animation:none}}`}</style>
    </div>
  )
}
