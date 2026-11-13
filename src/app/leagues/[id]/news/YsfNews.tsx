// ySF News: the latest stories from the Federation's writers, newest first — a lead story, then the rest
// — with the weekly Federation Report alongside. Stories are written by src/lib/ysf-news.ts.
import Link from 'next/link'
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { PageTitle } from '@/components/ysf/ui'
import { U } from '@/lib/ysf'
import { loadClubs } from '@/lib/ysf-data'
import { listNews, WRITERS, type Article } from '@/lib/ysf-news'

const KIND: Record<string, string> = { daily: 'THE DAILY', feature: 'FEATURE', column: 'COLUMN', analysis: 'ANALYSIS', preview: 'PREVIEW', report: 'REPORT', trade: 'TRADE' }
export const when = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) + ' ET'

export function Byline({ a }: { a: Article }) {
  const w = WRITERS[a.writer]
  return <div className="ui text-[11px] sm:text-[12px] tracking-[.1em] text-ink-500"><span className="text-black font-bold">{U(w?.name ?? '')}</span> · {U(w?.title ?? '')} · {when(a.published).toUpperCase()}</div>
}

export default async function YsfNews({ league }: { league: any }) {
  const C = await loadClubs(league.id)
  const byAbbr = new Map(Object.values(C).map(c => [c.abbreviation, c]))
  const items = listNews(40)
  const base = `/leagues/${league.id}`
  // the weekly Report's latest issue, alongside (and leading the page until the writers have filed)
  const issue = db.all<{ week: number; data: string }>(sql`SELECT week, data FROM ysf_report_issues WHERE season = ${league.season} ORDER BY week DESC LIMIT 1`)[0]
  const rep = issue ? JSON.parse(issue.data) as { headline: string; dek: string } : null
  const crests = (a: Article) => a.clubs.map(ab => byAbbr.get(ab)).filter(Boolean).slice(0, 4)
  const [lead, ...rest] = items

  return (
    <>
      <PageTitle eyebrow="The Federation's daily paper" title="NEWS" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        <div className="flex flex-col gap-6 min-w-0">
          {lead ? (
            <Link href={`${base}/news/${lead.id}`} className="card p-5 sm:p-7 hover:bg-ink-50 block">
              <div className="ui text-[12px] font-bold tracking-[.14em] text-[#ba0c2f]">{KIND[lead.kind] ?? 'NEWS'}</div>
              <h2 className="disp text-[30px] sm:text-[44px] font-extrabold leading-[.95] mt-2 break-words">{lead.headline}</h2>
              <p className="text-[17px] sm:text-[19px] text-ink-800 mt-3">{lead.dek}</p>
              <div className="flex flex-wrap items-center gap-3 mt-4">
                <Byline a={lead} />
                <span className="flex gap-1.5">{crests(lead).map(c => <img key={c!.id} src={c!.logo ?? ''} alt={c!.abbreviation} className="w-6 h-6 object-contain" />)}</span>
              </div>
              <p className="text-[15px] text-ink-800 mt-4 line-clamp-3">{lead.body[0]}</p>
            </Link>
          ) : rep && (
            <Link href={`${base}/report`} className="card p-5 sm:p-7 hover:bg-ink-50 block">
              <div className="ui text-[12px] font-bold tracking-[.14em] text-[#ba0c2f]">THE FEDERATION REPORT</div>
              <h2 className="disp text-[30px] sm:text-[44px] font-extrabold leading-[.95] mt-2 break-words">{rep.headline}</h2>
              <p className="text-[17px] text-ink-800 mt-3">{rep.dek}</p>
            </Link>
          )}
          {rest.length > 0 && (
            <section className="grid gap-4 sm:grid-cols-2">
              {rest.map(a => (
                <Link key={a.id} href={`${base}/news/${a.id}`} className="card p-4 sm:p-5 hover:bg-ink-50 flex flex-col gap-2">
                  <div className="ui text-[11px] font-bold tracking-[.14em] text-ink-500">{KIND[a.kind] ?? 'NEWS'}</div>
                  <h3 className="disp text-[22px] font-extrabold leading-tight break-words">{a.headline}</h3>
                  <p className="text-[14px] text-ink-800">{a.dek}</p>
                  <div className="mt-auto pt-1"><Byline a={a} /></div>
                </Link>
              ))}
            </section>
          )}
        </div>
        <aside className="flex flex-col gap-4">
          {rep && lead && (
            <Link href={`${base}/report`} className="card p-4 hover:bg-ink-50 block">
              <div className="ui text-[11px] font-bold tracking-[.14em] text-ink-500">THE FEDERATION REPORT · WEEK {issue!.week}</div>
              <div className="disp text-[20px] font-extrabold leading-tight mt-1.5">{rep.headline}</div>
            </Link>
          )}
          <div className="card overflow-hidden">
            <div className="ui px-4 py-2.5 bg-black text-white text-[12px] font-bold tracking-[.12em]">THE STAFF</div>
            {Object.values(WRITERS).map(w => (
              <div key={w.id} className="px-4 py-3 border-t border-ink-50">
                <div className="font-bold">{w.name}</div>
                <div className="ui text-[11px] tracking-[.1em] text-ink-500">{U(w.title)}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  )
}
