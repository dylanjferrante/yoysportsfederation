// Shared building blocks of the ySF Site Redesign (mirrors the canvas boards' CSS:
// display-face page titles over a 2px rule, black-pill tabs, display-caps table heads).
import Link from 'next/link'
import { YSF_ART, U } from '@/lib/ysf'

export function PageTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b-2 border-black pb-3.5">
      <div>
        {eyebrow && <div className="eyebrow">{U(eyebrow)}</div>}
        <h1 className={`disp text-[40px] sm:text-[64px] font-extrabold leading-[.85] ${eyebrow ? 'mt-1.5' : ''}`}>{title}</h1>
      </div>
      {right}
    </div>
  )
}

export function Tabs<T extends string>({ items, value, onChange }: { items: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 p-1 bg-white border border-ink-100 rounded-xl overflow-x-auto max-w-full">
      {items.map(t => (
        <button key={t.id} role="tab" type="button" onClick={() => onChange(t.id)}
          className={`flex-none inline-flex items-center justify-center min-h-[40px] px-4 rounded-lg font-display text-[13px] font-medium tracking-[.08em] leading-none whitespace-nowrap ${value === t.id ? 'bg-black text-white' : 'text-ink-500 hover:bg-ink-50'}`}>
          <span className="ysf-case">{t.label}</span>
        </button>
      ))}
    </div>
  )
}

// Table cells, sized and ruled like the canvas tables.
export const th = 'font-display text-[12px] font-medium tracking-[.12em] text-ink-500 text-left px-2 py-2.5 border-b-2 border-black whitespace-nowrap'
export const td = 'px-2 py-[9px] border-b border-ink-100 text-[15px] font-semibold whitespace-nowrap align-middle tabular-nums'

export function ClubCell({ name, logo, color, href }: { name: string; logo?: string | null; color?: string | null; href?: string }) {
  const inner = (
    <span className="flex items-center gap-2.5">
      <span className="w-[30px] h-[30px] inline-flex items-center justify-center flex-none">{logo && <img src={logo} alt="" className="w-[30px] h-[30px] object-contain" />}</span>
      <span className="font-bold whitespace-normal leading-tight">{name}</span>
    </span>
  )
  return { style: { borderLeft: `4px solid ${color ?? '#000'}` }, inner: href ? <Link href={href} className="hover:text-ink-500">{inner}</Link> : inner }
}

export function YsfFooter() {
  return (
    <footer className="bg-black text-ink-200">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-5 py-7 flex flex-wrap items-center gap-x-8 gap-y-4 text-[13px]">
        <img src={YSF_ART.primaryOnBlack} alt="yoy Sports Federation" className="h-[34px] w-auto" />
        <span className="ui text-[12px] flex flex-wrap gap-x-[18px] gap-y-1.5">
          <Link href="/leagues/ysf/history" className="hover:text-white">HISTORY</Link>
          <Link href="/leagues/ysf/rules" className="hover:text-white">LEAGUE OFFICE</Link>
          <Link href="/account" className="hover:text-white">MEMBER PORTAL</Link>
        </span>
      </div>
    </footer>
  )
}

// A win–loss record as its own columns: W, L, and T when the table has ties.
export const recOf = (rec: string) => { const [w = '', l = '', t = ''] = rec.split(/[–-]/).map(x => x.trim()); return { w, l, t } }
export function RecTh({ cls = '', ties = false }: { cls?: string; ties?: boolean }) {
  return <><th className={`${th} text-right ${cls}`}>W</th><th className={`${th} text-right ${cls}`}>L</th>{ties && <th className={`${th} text-right ${cls}`}>T</th>}</>
}
export function RecTd({ rec, cls = '', ties = false }: { rec: string; cls?: string; ties?: boolean }) {
  const r = recOf(rec)
  return <><td className={`${td} text-right ${cls}`}>{r.w}</td><td className={`${td} text-right ${cls}`}>{r.l}</td>{ties && <td className={`${td} text-right ${cls}`}>{r.t || '0'}</td>}</>
}
