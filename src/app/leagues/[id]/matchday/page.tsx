// ySF Site Redesign — Matchday: this week's pairings live, the Cup table and the Report's headlines.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { leagues } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { YSF_LEAGUE_ID, YSF_LEAGUES, YSF_ART, U } from '@/lib/ysf'
import { loadStandings, loadWeek } from '@/lib/ysf-data'
import { writeStories } from '@/lib/ysf-stories'
import { PageTitle } from '@/components/ysf/ui'
import PairCards from '@/components/ysf/PairCards'
import HomeStandings from '../HomeStandings'

export const metadata = { title: 'ySF · Matchday' }

export default async function MatchdayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lg?: string }> }) {
  const { id } = await params
  if (id !== YSF_LEAGUE_ID) redirect(`/leagues/${id}/scores`)
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  const { lg } = await searchParams
  const s = await loadStandings(league)
  const wk = await loadWeek(league)
  const only = YSF_LEAGUES.find(l => l.key === lg)?.sport ?? null
  const sports = YSF_LEAGUES.filter(l => wk.pairings.some(p => p.lines.some(x => x.sport === l.sport)))
  const n = wk.pairings.reduce((t, p) => t + p.lines.filter(x => !only || x.sport === only).length, 0)
  const liveN = wk.pairings.reduce((t, p) => t + p.lines.filter(x => x.status === 'LIVE' && (!only || x.sport === only)).length, 0)
  const { heads } = writeStories(s)
  const C = s.clubs
  const chip = 'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg font-display text-[12px] font-bold tracking-[.06em] leading-none border'
  return (
    <>
      <PageTitle eyebrow={liveN ? `Live now · ${n} matchups` : `This week · ${n} matchups`} title="MATCHDAY" />
      <div className="flex flex-wrap gap-2">
        <Link href={`/leagues/${id}/matchday`} className={chip} style={{ background: only ? '#fff' : '#000', color: only ? '#000' : '#fff', borderColor: only ? '#C7C7C7' : '#000' }}>ALL</Link>
        {sports.map(l => { const on = only === l.sport; return (
          <Link key={l.key} href={`/leagues/${id}/matchday?lg=${l.key}`} className={chip} style={{ background: on ? l.color : '#fff', color: on ? '#fff' : '#000', borderColor: on ? l.color : '#C7C7C7' }}>
            <img src={YSF_ART.leagueSymbol(l.key, on ? 'color' : 'white')} alt="" className="w-5 h-5 object-contain" /><span className="ysf-case">{l.code}</span>
          </Link>) })}
      </div>
      <PairCards leagueId={id} pairings={wk.pairings} clubs={C} only={only} />
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] items-start">
        <HomeStandings leagueId={id} cup={s.cup} live={s.live} clubs={Object.fromEntries(Object.values(C).map(c => [c.id, { name: c.name, abbreviation: c.abbreviation, logo: c.logo, color: c.color }]))} />
        <aside>
          <div className="flex items-baseline justify-between pb-2 border-b-2 border-black">
            <span className="ui text-[13px] tracking-[.18em]">FEDERATION REPORT · HEADLINES</span>
            <Link href={`/leagues/${id}/report`} className="ui text-[12px] font-bold tracking-[.1em]">READ →</Link>
          </div>
          {heads.map((h, i) => (
            <div key={i} className="flex gap-3 py-3.5 border-b border-ink-100">
              <span className="disp text-[28px] font-extrabold leading-none w-7 text-ink-200 flex-none">{i + 1}</span>
              <div className="min-w-0">
                <div className="ui text-[11px] font-bold tracking-[.12em]" style={{ color: h.sport ? YSF_LEAGUES.find(l => l.sport === h.sport)!.color : '#000' }}><span className="ysf-case">{h.topic}</span></div>
                <div className="disp text-[20px] font-extrabold leading-[1.05] mt-0.5"><span className="ysf-case">{U(h.title)}</span></div>
                <p className="text-[13px] text-ink-500 mt-1 leading-snug">{h.dek}</p>
              </div>
            </div>
          ))}
        </aside>
      </section>
    </>
  )
}
