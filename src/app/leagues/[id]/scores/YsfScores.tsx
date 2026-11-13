// ySF Site Redesign — Scores (Matchday folded in): pick any federation week from the scroller,
// filter by league, one card per club pairing with every league's score stacked.
import Link from 'next/link'
import { loadClubs, loadWeek } from '@/lib/ysf-data'
import { PageTitle } from '@/components/ysf/ui'
import PairCards from '@/components/ysf/PairCards'
import WeekScroller from '@/components/ysf/WeekScroller'
import { YSF_LEAGUES, YSF_ART } from '@/lib/ysf'
import { weekDateRange } from '@/lib/defaults'

const M = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' })
function span(season: string, w: number) {
  const { start, end } = weekDateRange(season, w)
  return start.getMonth() === end.getMonth() ? `${M(start)} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}` : `${M(start)} ${start.getDate()} – ${M(end)} ${end.getDate()}, ${end.getFullYear()}`
}

export default async function YsfScores({ league, week, lg }: { league: any; week?: number; lg?: string }) {
  const C = await loadClubs(league.id)
  const wk = await loadWeek(league, week)
  const base = `/leagues/${league.id}/scores`
  const only = YSF_LEAGUES.find(l => l.key === lg)?.sport ?? null
  const q = (w: number | null, k?: string | null) => { const p = new URLSearchParams(); if (w != null && w !== wk.thisWeek) p.set('w', String(wk.num(w))); if (k) p.set('lg', k); const s = p.toString(); return s ? `${base}?${s}` : base }
  const lines = wk.pairings.flatMap(p => p.lines.filter(x => !only || x.sport === only))
  const live = lines.filter(x => x.status === 'LIVE').length
  const sports = YSF_LEAGUES.filter(l => wk.pairings.some(p => p.lines.some(x => x.sport === l.sport)))
  const chip = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg font-display text-[12px] font-bold tracking-[.06em] leading-none border'
  const eyebrow = wk.week === wk.thisWeek ? `${live ? 'Live now' : 'This week'} · ${lines.length} matchups` : `${span(league.season, wk.week)} · ${lines.length} matchups`
  return (
    <>
      <PageTitle eyebrow={eyebrow} title="SCORES" />
      <WeekScroller weeks={wk.weeks.map(w => ({ week: wk.num(w), dates: span(league.season, w), href: q(w, lg && only ? lg : null), on: w === wk.week, now: w === wk.thisWeek }))} />
      {sports.length > 1 && (
        <div className="flex flex-wrap gap-2 -mt-3 sm:-mt-4">
          <Link href={q(wk.week)} scroll={false} className={chip} style={{ background: only ? '#fff' : '#000', color: only ? '#000' : '#fff', borderColor: only ? '#C7C7C7' : '#000' }}>ALL</Link>
          {sports.map(l => { const on = only === l.sport; return (
            <Link key={l.key} href={q(wk.week, l.key)} scroll={false} className={chip} style={{ background: on ? l.color : '#fff', color: on ? '#fff' : '#000', borderColor: on ? l.color : '#C7C7C7' }}>
              <img src={YSF_ART.leagueSymbol(l.key, on ? 'color' : 'white')} alt="" className="w-5 h-5 object-contain" /><span className="ysf-case">{l.code}</span>
            </Link>) })}
        </div>
      )}
      <PairCards leagueId={league.id} pairings={wk.pairings} clubs={C} only={only} />
    </>
  )
}
