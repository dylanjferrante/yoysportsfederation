// ySF Site Redesign — Home (front page), from the Nexus database: the top stories carousel beside the
// latest headlines from ySF News, then the standings.
import Link from 'next/link'
import { loadStandings } from '@/lib/ysf-data'
import HomeStandings from './HomeStandings'
import { listNews, topStories } from '@/lib/ysf-news'
import { kicker, by, ago, tilesOf } from './news/YsfNews'
import NewsCarousel, { type Slide } from './NewsCarousel'
import StoryArt from '@/components/ysf/StoryArt'

export default async function YsfHome({ league }: { league: any }) {
  const s = await loadStandings(league)
  const C = s.clubs
  const byAbbr = new Map(Object.values(C).map(c => [c.abbreviation, c]))
  const all = listNews(80)
  const top = topStories(all)
  const base = `/leagues/${league.id}/news`
  const slides: Slide[] = top.map(a => ({
    id: a.id, href: `${base}/${a.id}`, kicker: kicker(a), headline: a.headline, dek: a.dek || a.body[0] || '', by: by(a), tiles: tilesOf(a, byAbbr),
  }))
  // the headlines list: the newest stories not already in the carousel
  const heads = all.filter(a => !top.includes(a)).slice(0, 6)

  return (
    <>
      {slides.length > 0 && (
        <section className="grid gap-6 lg:gap-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] items-start">
          <NewsCarousel slides={slides} more={base} />
          <aside className="min-w-0">
            <div className="flex items-center justify-between gap-3 border-b-2 border-black pb-2 min-h-[42px]">
              <div className="ui text-[13px] tracking-[.18em] font-bold">HEADLINES</div>
              <Link href={base} className="ui text-[12px] font-bold tracking-[.12em] text-ink-500 hover:text-black">ALL NEWS →</Link>
            </div>
            {heads.map(a => (
              <Link key={a.id} href={`${base}/${a.id}`} className="group grid grid-cols-[64px_minmax(0,1fr)] gap-3 py-3 border-b border-ink-100">
                <StoryArt tiles={tilesOf(a, byAbbr)} className="aspect-square" />
                <div className="min-w-0">
                  <div className="ui text-[10px] font-bold tracking-[.12em] text-[#ba0c2f]"><span className="ysf-case">{kicker(a)}</span></div>
                  <div className="font-bold leading-snug mt-0.5 group-hover:underline break-words">{a.headline}</div>
                  <div className="text-[11px] text-ink-500 mt-0.5">{ago(a.published)}</div>
                </div>
              </Link>
            ))}
          </aside>
        </section>
      )}

      <HomeStandings leagueId={league.id} cup={s.cup} live={s.live} clubs={Object.fromEntries(Object.values(C).map(c => [c.id, { name: c.name, abbreviation: c.abbreviation, logo: c.logo, color: c.color }]))} />
    </>
  )
}
