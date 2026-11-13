// One ySF News story.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getNews, listNews } from '@/lib/ysf-news'
import { loadClubs } from '@/lib/ysf-data'
import { Byline } from '../YsfNews'

export async function generateMetadata({ params }: { params: Promise<{ articleId: string }> }) {
  const a = getNews((await params).articleId)
  return { title: a ? `${a.headline} · ySF News` : 'ySF News' }
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string; articleId: string }> }) {
  const { id, articleId } = await params
  const a = getNews(articleId)
  if (!a) notFound()
  const C = await loadClubs(id)
  const byAbbr = new Map(Object.values(C).map(c => [c.abbreviation, c]))
  const more = listNews(6).filter(x => x.id !== a.id).slice(0, 4)
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
      <article className="min-w-0 max-w-[720px]">
        <Link href={`/leagues/${id}/news`} className="ui text-[12px] font-bold tracking-[.12em] text-ink-500 hover:text-black">← NEWS</Link>
        <h1 className="disp text-[34px] sm:text-[52px] font-extrabold leading-[.95] mt-3 break-words">{a.headline}</h1>
        <p className="text-[18px] sm:text-[21px] text-ink-800 mt-3 leading-snug">{a.dek}</p>
        <div className="flex flex-wrap items-center gap-3 mt-4 pb-4 border-b-2 border-black">
          <Byline a={a} />
          <span className="flex gap-1.5">{a.clubs.map(ab => byAbbr.get(ab)).filter(Boolean).map(c => (
            <Link key={c!.id} href={`/leagues/${id}/teams/${c!.id}`} title={c!.name}><img src={c!.logo ?? ''} alt={c!.abbreviation} className="w-7 h-7 object-contain" /></Link>))}</span>
        </div>
        <div className="mt-5 flex flex-col gap-4 text-[17px] leading-relaxed text-ink-800">
          {a.body.map((p, i) => <p key={i}><span className="ysf-case">{p}</span></p>)}
        </div>
      </article>
      {more.length > 0 && (
        <aside className="card overflow-hidden lg:sticky lg:top-24">
          <div className="ui px-4 py-2.5 bg-black text-white text-[12px] font-bold tracking-[.12em]">MORE NEWS</div>
          {more.map(m => (
            <Link key={m.id} href={`/leagues/${id}/news/${m.id}`} className="block px-4 py-3 border-t border-ink-50 hover:bg-ink-50">
              <div className="font-bold leading-tight">{m.headline}</div>
              <div className="mt-1"><Byline a={m} /></div>
            </Link>
          ))}
        </aside>
      )}
    </div>
  )
}
