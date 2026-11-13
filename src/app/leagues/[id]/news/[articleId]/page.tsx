// One ySF News story.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getNews, listNews } from '@/lib/ysf-news'
import { loadClubs } from '@/lib/ysf-data'
import { Art, kicker, stamp, by, SECTIONS } from '../YsfNews'

export async function generateMetadata({ params }: { params: Promise<{ articleId: string }> }) {
  const a = getNews((await params).articleId)
  return { title: a ? `${a.headline} · ySF News` : 'ySF News' }
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string; articleId: string }> }) {
  const { id, articleId } = await params
  const a = getNews(articleId)
  if (!a) notFound()
  const clubs = await loadClubs(id)
  const C = new Map(Object.values(clubs).map(c => [c.abbreviation, c]))
  const sec = SECTIONS.find(s => s.id === a.sport)
  const all = listNews(200).filter(x => x.id !== a.id)
  const more = [...all.filter(x => x.sport === a.sport), ...all.filter(x => x.sport !== a.sport)].slice(0, 5)
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
      <article className="min-w-0 max-w-[740px]">
        <Link href={`/leagues/${id}/news${sec ? `?s=${sec.id}` : ''}`} className="ui text-[12px] font-bold tracking-[.12em] text-ink-500 hover:text-black">← <span className="ysf-case">{sec ? sec.label : 'NEWS'}</span></Link>
        <div className="ui text-[12px] font-bold tracking-[.14em] text-[#ba0c2f] mt-4"><span className="ysf-case">{kicker(a)}</span></div>
        <h1 className="disp text-[34px] sm:text-[52px] font-extrabold leading-[.95] mt-1.5 break-words">{a.headline}</h1>
        <p className="text-[18px] sm:text-[21px] text-ink-800 mt-3 leading-snug">{a.dek}</p>
        <div className="text-[13px] text-ink-500 mt-3 pb-4 border-b-2 border-black">{by(a)} · {stamp(a.published)}</div>
        <div className="mt-5"><Art a={a} C={C} big /></div>
        <div className="mt-6 flex flex-col gap-4 text-[17px] leading-relaxed text-ink-800">
          {a.body.map((p, i) => <p key={i}><span className="ysf-case">{p}</span></p>)}
        </div>
        {a.clubs.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-ink-100">{a.clubs.map(ab => C.get(ab)).filter(Boolean).map(c => (
            <Link key={c!.id} href={`/leagues/${id}/teams/${c!.id}`} className="inline-flex items-center gap-2 h-9 px-3 rounded border border-ink-100 font-display text-[12px] font-bold tracking-[.06em] hover:bg-ink-50">
              <img src={c!.logo ?? ''} alt="" className="w-5 h-5 object-contain" />{c!.abbreviation}</Link>))}</div>
        )}
      </article>
      {more.length > 0 && (
        <aside className="card overflow-hidden lg:sticky lg:top-24">
          <div className="ui px-4 py-2.5 bg-black text-white text-[12px] font-bold tracking-[.12em]">MORE <span className="ysf-case">{sec ? sec.label : 'NEWS'}</span></div>
          {more.map(m => (
            <Link key={m.id} href={`/leagues/${id}/news/${m.id}`} className="block px-4 py-3 border-t border-ink-50 hover:bg-ink-50">
              <div className="ui text-[10px] font-bold tracking-[.12em] text-ink-500"><span className="ysf-case">{kicker(m)}</span></div>
              <div className="font-bold leading-snug mt-0.5">{m.headline}</div>
            </Link>
          ))}
        </aside>
      )}
    </div>
  )
}
