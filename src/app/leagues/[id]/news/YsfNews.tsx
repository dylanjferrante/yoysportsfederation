// ySF News, organised like a sports site: the lead story and top headlines, then a front for each
// section — ySFFL, ySFHL, ySFBA, ySFLB, the Cup race and moves. ?s=<section> opens one section in full.
import Link from 'next/link'
import { U, YSF_LEAGUES, YSF_ART } from '@/lib/ysf'
import { loadClubs, type ClubInfo } from '@/lib/ysf-data'
import { listNews, WRITERS, type Article } from '@/lib/ysf-news'

export const SECTIONS = [
  ...YSF_LEAGUES.map(l => ({ id: l.sport, label: l.code, color: l.color, key: l.key as string | null })),
  { id: 'CUP', label: 'CUP RACE', color: '#000', key: null },
  { id: 'MOVES', label: 'MOVES', color: '#2F5D8A', key: null },
]
export const kicker = (a: Article) => a.kind === 'daily' ? 'THE DAILY' : a.kind === 'notebook' ? `${SECTIONS.find(s => s.id === a.sport)?.label ?? ''} NOTEBOOK` : a.kind === 'analysis' ? 'CUP RACE' : a.kind === 'trade' ? 'TRADE' : a.kind === 'report' ? 'MOVES' : (a.kind ?? 'NEWS').toUpperCase()
const ago = (iso: string) => {
  const m = Math.max(0, (Date.now() - Date.parse(iso)) / 60000)
  if (m < 60) return `${Math.max(1, Math.round(m))}m ago`
  if (m < 24 * 60) return `${Math.round(m / 60)}h ago`
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso))
}
export const stamp = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) + ' ET'
export const by = (a: Article) => `By ${WRITERS[a.writer]?.name ?? 'ySF News'}`

// story art: the lead club's crest on its colour, or the league's symbol on the league colour
export function Art({ a, C, big = false }: { a: Article; C: Map<string, ClubInfo>; big?: boolean }) {
  const club = a.clubs.map(x => C.get(x)).find(Boolean)
  const sec = SECTIONS.find(s => s.id === a.sport)
  const bg = club?.color ?? sec?.color ?? '#000'
  const src = club ? (club.altLogo || club.logo) : sec?.key ? YSF_ART.leagueSymbol(sec.key, 'color') : YSF_ART.primaryOnBlack
  return (
    <div className={`flex items-center justify-center rounded ${big ? 'aspect-[16/9] lg:aspect-[21/9]' : 'aspect-[16/10]'}`} style={{ background: bg }}>
      <img src={src ?? ''} alt="" className={big ? 'h-[62%] w-auto max-w-[60%] object-contain' : 'w-[46%] max-h-[64%] object-contain'} />
    </div>
  )
}

export default async function YsfNews({ league, section }: { league: any; section?: string }) {
  const clubs = await loadClubs(league.id)
  const C = new Map(Object.values(clubs).map(c => [c.abbreviation, c]))
  const all = listNews(400)
  const base = `/leagues/${league.id}/news`
  const sec = SECTIONS.find(s => s.id === section)
  const inSec = (s: string) => all.filter(a => a.sport === s)
  const href = (a: Article) => `${base}/${a.id}`
  const today = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())

  const Nav = (
    <nav className="flex gap-1 overflow-x-auto border-b-2 border-black -mt-2 sm:-mt-4 pb-0">
      {[{ id: '', label: 'TOP STORIES', color: '#000' }, ...SECTIONS].map(s => {
        const on = (section ?? '') === s.id
        return <Link key={s.id || 'top'} href={s.id ? `${base}?s=${s.id}` : base} className="flex-none px-3 py-2.5 font-display text-[13px] font-bold tracking-[.08em] leading-none border-b-4 -mb-[2px]" style={{ borderColor: on ? s.color : 'transparent', color: on ? '#000' : '#4A4A4A' }}><span className="ysf-case">{s.label}</span></Link>
      })}
    </nav>
  )

  const Row = ({ a, excerpt = false }: { a: Article; excerpt?: boolean }) => (
    <Link href={href(a)} className="grid grid-cols-[104px_minmax(0,1fr)] sm:grid-cols-[160px_minmax(0,1fr)] gap-3 sm:gap-4 py-4 border-t border-ink-100 first:border-t-0 group">
      <Art a={a} C={C} />
      <div className="min-w-0">
        <div className="ui text-[11px] font-bold tracking-[.12em] text-[#ba0c2f]"><span className="ysf-case">{kicker(a)}</span></div>
        <h3 className="disp text-[19px] sm:text-[22px] font-extrabold leading-tight mt-1 group-hover:underline break-words">{a.headline}</h3>
        {excerpt && <p className="text-[14px] text-ink-800 mt-1.5 line-clamp-3">{a.body[0]}</p>}
        <div className="text-[12px] text-ink-500 mt-1.5">{by(a)} · {ago(a.published)}</div>
      </div>
    </Link>
  )

  // one section in full
  if (sec) {
    const list = inSec(sec.id)
    return (
      <>
        <div className="border-b-2 border-black pb-3.5"><div className="eyebrow">ySF NEWS · {U(today)}</div><h1 className="disp text-[40px] sm:text-[64px] font-extrabold leading-[.85] mt-1.5"><span className="ysf-case">{sec.label}</span></h1></div>
        {Nav}
        <section className="max-w-[860px]">{list.length ? list.map(a => <Row key={a.id} a={a} excerpt />) : <p className="py-6 text-ink-500 font-semibold">No stories yet</p>}</section>
      </>
    )
  }

  // the lead is the newest real story (the daily wrap, a feature or column, a notebook), never a
  // transactions note or trade brief; the rest follow newest first
  const LEADS = ['daily', 'feature', 'column', 'preview', 'analysis', 'notebook']
  const today0 = all[0]?.published.slice(0, 10)
  const lead = all.find(a => a.published.slice(0, 10) === today0 && a.kind === 'daily') ?? all.find(a => LEADS.includes(a.kind)) ?? all[0]
  const rest = all.filter(a => a !== lead)
  const headlines = rest.slice(0, 7)
  return (
    <>
      <div className="border-b-2 border-black pb-3.5"><div className="eyebrow">{U(today)}</div><h1 className="disp text-[40px] sm:text-[64px] font-extrabold leading-[.85] mt-1.5">ySF NEWS</h1></div>
      {Nav}
      {lead ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
          <Link href={href(lead)} className="block group min-w-0">
            <Art a={lead} C={C} big />
            <div className="ui text-[12px] font-bold tracking-[.14em] text-[#ba0c2f] mt-4"><span className="ysf-case">{kicker(lead)}</span></div>
            <h2 className="disp text-[32px] sm:text-[48px] font-extrabold leading-[.95] mt-1.5 group-hover:underline break-words">{lead.headline}</h2>
            <p className="text-[17px] sm:text-[19px] text-ink-800 mt-3 leading-snug">{lead.dek}</p>
            <div className="text-[13px] text-ink-500 mt-3">{by(lead)} · {stamp(lead.published)}</div>
            <div className="mt-4 flex flex-col gap-3 text-[16px] leading-relaxed text-ink-800">{lead.body.slice(0, 2).map((p, i) => <p key={i}><span className="ysf-case">{p}</span></p>)}</div>
            <div className="ui text-[12px] font-bold tracking-[.12em] mt-3">READ MORE →</div>
          </Link>
          <aside className="card overflow-hidden">
            <div className="ui px-4 py-2.5 bg-black text-white text-[12px] font-bold tracking-[.12em]">TOP HEADLINES</div>
            {headlines.map(a => (
              <Link key={a.id} href={href(a)} className="block px-4 py-3 border-t border-ink-50 hover:bg-ink-50">
                <div className="ui text-[10px] font-bold tracking-[.12em] text-ink-500"><span className="ysf-case">{kicker(a)}</span> · {ago(a.published).toUpperCase()}</div>
                <div className="font-bold leading-snug mt-0.5">{a.headline}</div>
              </Link>
            ))}
          </aside>
        </div>
      ) : <p className="text-ink-500 font-semibold">No stories yet</p>}

      {SECTIONS.map(s => {
        const list = inSec(s.id).filter(a => a.id !== lead?.id).slice(0, 4)
        if (!list.length) return null
        const [first, ...more] = list
        return (
          <section key={s.id} className="flex flex-col">
            <div className="flex items-center justify-between gap-3 border-b-4 pb-2" style={{ borderColor: s.color }}>
              <h2 className="flex items-center gap-2 disp text-[24px] sm:text-[28px] font-extrabold leading-none">
                {s.key && <img src={YSF_ART.leagueSymbol(s.key, 'white')} alt="" className="w-7 h-7 object-contain" />}<span className="ysf-case">{s.label}</span>
              </h2>
              <Link href={`${base}?s=${s.id}`} className="ui text-[12px] font-bold tracking-[.12em] text-ink-500 hover:text-black">MORE →</Link>
            </div>
            <div className="grid gap-x-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <Link href={href(first)} className="block group py-4 min-w-0">
                <Art a={first} C={C} />
                <div className="ui text-[11px] font-bold tracking-[.12em] text-[#ba0c2f] mt-3"><span className="ysf-case">{kicker(first)}</span></div>
                <h3 className="disp text-[24px] sm:text-[28px] font-extrabold leading-tight mt-1 group-hover:underline break-words">{first.headline}</h3>
                <p className="text-[15px] text-ink-800 mt-2 line-clamp-3">{first.body[0]}</p>
                <div className="text-[12px] text-ink-500 mt-2">{by(first)} · {ago(first.published)}</div>
              </Link>
              <div className="min-w-0">{more.map(a => <Row key={a.id} a={a} />)}</div>
            </div>
          </section>
        )
      })}
    </>
  )
}
