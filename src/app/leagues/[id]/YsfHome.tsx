// ySF Site Redesign — Home (front page), from the Nexus database.
import Link from 'next/link'
import { loadStandings, type ClubInfo } from '@/lib/ysf-data'
import { YSF_LEAGUES, YSF_ART, U } from '@/lib/ysf'
import HomeStandings from './HomeStandings'
import { writeStories, ord, pct } from '@/lib/ysf-stories'
import { listNews, topStories } from '@/lib/ysf-news'
import { kicker, by, SECTIONS } from './news/YsfNews'
import NewsCarousel, { type Slide } from './NewsCarousel'

export default async function YsfHome({ league }: { league: any }) {
  const s = await loadStandings(league)
  const C = s.clubs, ab = (id: string) => C[id]?.abbreviation ?? ''
  const live = s.live
  const lead = s.cup[0], second = s.cup[1]
  const L = (sport: string) => YSF_LEAGUES.find(l => l.sport === sport)!

  const { headline, dek, heads } = writeStories(s)

  const leader = C[lead.teamId] as ClubInfo
  const byAbbr = new Map(Object.values(C).map(c => [c.abbreviation, c]))
  const slides: Slide[] = topStories(listNews(80)).map(a => {
    const club = a.clubs.map(x => byAbbr.get(x)).find(Boolean)
    const sec = SECTIONS.find(x => x.id === a.sport)
    return {
      id: a.id, href: `/leagues/${league.id}/news/${a.id}`, kicker: kicker(a), headline: a.headline, dek: a.dek || a.body[0] || '', by: by(a),
      bg: club?.color ?? sec?.color ?? '#000',
      img: (club ? (club.altLogo || club.logo) : sec?.key ? YSF_ART.leagueSymbol(sec.key, 'color') : YSF_ART.primaryOnBlack) ?? '',
    }
  })

  return (
    <>
      {slides.length >= 3 && <NewsCarousel slides={slides} more={`/leagues/${league.id}/news`} />}
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <div className="rounded overflow-hidden flex" style={{ background: leader.color ?? '#000' }}>
            <div className="flex flex-col w-1.5">{YSF_LEAGUES.map(l => <span key={l.key} className="flex-1" style={{ background: l.color }} />)}</div>
            <div className="flex flex-wrap items-center gap-6 p-6 text-white">
              <span className="w-28 h-28 sm:w-36 sm:h-36 inline-flex items-center justify-center"><img src={(leader.altLogo || leader.logo)!} alt={leader.name} className="w-full h-full object-contain" /></span>
              <div className="min-w-0">
                <div className="disp text-[64px] sm:text-[96px] font-extrabold leading-[.85]">{pct(lead.cupPct)}</div>
                <div className="ui text-[13px] tracking-[.14em] mt-2">{U(`percent chance to win the 26-27 Fed Cup · ${leader.name}`)}</div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {live.map(sp => lead.ranks[sp] != null && (
                    <span key={sp} className="ui inline-flex items-center gap-1.5 bg-white text-black rounded px-2 h-7 text-[12px] font-bold leading-none">
                      <img src={YSF_ART.leagueSymbol(L(sp).key, 'white')} alt="" className="w-5 h-5 object-contain" />{ord(lead.ranks[sp]!).toUpperCase()} <span className="ysf-case">{L(sp).code}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <h1 className="disp text-[40px] sm:text-[64px] font-extrabold leading-[.9]"><span className="ysf-case">{U(headline)}</span></h1>
          <p className="text-[16px] leading-relaxed text-ink-800 max-w-[640px]">{dek}</p>
          <Link href={`/leagues/${league.id}/standings`} className="ui text-[13px] font-bold tracking-[.12em]">SEE THE FULL STANDINGS →</Link>
        </div>

        <aside>
          <div className="ui text-[13px] tracking-[.18em] pb-2 border-b-2 border-black">HEADLINES</div>
          {heads.slice(0, 4).map((h, i) => (
            <div key={i} className="flex gap-4 py-4 border-b border-ink-100">
              <div className="flex flex-col gap-1 flex-none">{h.clubs.map(id => <span key={id} className="w-9 h-9 inline-flex items-center justify-center"><img src={C[id]?.logo ?? ''} alt="" className="w-9 h-9 object-contain" /></span>)}</div>
              <div className="min-w-0">
                <div className="ui text-[11px] font-bold tracking-[.12em]" style={{ color: h.sport ? L(h.sport).color : '#000' }}><span className="ysf-case">{h.topic}</span></div>
                <div className="disp text-[22px] font-extrabold leading-[1.02] mt-1">{U(h.title)}</div>
                <p className="text-[13px] text-ink-500 mt-1.5 leading-snug">{h.dek}</p>
              </div>
            </div>
          ))}
        </aside>
      </section>

      <HomeStandings leagueId={league.id} cup={s.cup} live={live} clubs={Object.fromEntries(Object.values(C).map(c => [c.id, { name: c.name, abbreviation: c.abbreviation, logo: c.logo, color: c.color }]))} />
    </>
  )
}
