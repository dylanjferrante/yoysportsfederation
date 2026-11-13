// ySF Site Redesign — Scores (Matchday folded in): pick any federation week from the scroller,
// filter by league, one card per club pairing with every league's score stacked.
import Link from 'next/link'
import { loadClubs, loadWeek, pastSeasonWeeks } from '@/lib/ysf-data'
import { db } from '@/db'
import { matchups } from '@/db/schema'
import { eq } from 'drizzle-orm'
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

export default async function YsfScores({ league, week, lg, season: sArg }: { league: any; week?: number; lg?: string; season?: string }) {
  const C = await loadClubs(league.id)
  const allSeasons = [...new Set((await db.selectDistinct({ s: matchups.season }).from(matchups).where(eq(matchups.leagueId, league.id))).map(r => r.s!).filter(Boolean))].sort()
  const season = sArg && allSeasons.includes(sArg) ? sArg : league.season
  const past = season !== league.season
  const wk = await loadWeek(league, week, season)
  const base = `/leagues/${league.id}/scores`
  const only = YSF_LEAGUES.find(l => l.key === lg)?.sport ?? null
  const link = (sea: string, n: number | null, k?: string | null) => { const p = new URLSearchParams(); if (sea !== league.season) p.set('s', sea); if (n != null) p.set('w', String(n)); if (k) p.set('lg', k); const s = p.toString(); return s ? `${base}?${s}` : base }
  const q = (w: number | null, k?: string | null) => link(season, w != null && (past || w !== wk.thisWeek) ? wk.num(w) : null, k)
  // every season's weeks in one scroller: past seasons first, then this one
  const chips: { week: number; dates: string; href: string; on: boolean; now: boolean; season?: string }[] = []
  for (const sea of allSeasons.filter(x => x < league.season)) {
    const pw = sea === season ? { weeks: wk.weeks, num: wk.num } : await pastSeasonWeeks(sea)
    for (const w of pw.weeks) chips.push({ season: sea, week: pw.num(w), dates: span(sea, w), href: link(sea, pw.num(w), lg && only ? lg : null), on: sea === season && w === wk.week, now: false })
  }
  const lines = wk.pairings.flatMap(p => p.lines.filter(x => !only || x.sport === only))
  const live = lines.filter(x => x.status === 'LIVE').length
  const sports = YSF_LEAGUES.filter(l => wk.pairings.some(p => p.lines.some(x => x.sport === l.sport)))
  const chip = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg font-display text-[12px] font-bold tracking-[.06em] leading-none border'
  const eyebrow = !past && wk.week === wk.thisWeek ? `${live ? 'Live now' : 'This week'} · ${lines.length} matchups` : `${past ? season.replace('-', '–') + ' · ' : ''}${span(season, wk.week)} · ${lines.length} matchups`
  if (!past) for (const w of wk.weeks) chips.push({ season: allSeasons.length > 1 ? league.season : undefined, week: wk.num(w), dates: span(league.season, w), href: q(w, lg && only ? lg : null), on: w === wk.week, now: w === wk.thisWeek })
  else { const cur = await loadWeek(league); for (const w of cur.weeks) chips.push({ season: league.season, week: cur.num(w), dates: span(league.season, w), href: link(league.season, w === cur.thisWeek ? null : cur.num(w), lg && only ? lg : null), on: false, now: w === cur.thisWeek }) }
  return (
    <>
      <PageTitle eyebrow={eyebrow} title="SCORES" />
      <WeekScroller weeks={chips} />
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
