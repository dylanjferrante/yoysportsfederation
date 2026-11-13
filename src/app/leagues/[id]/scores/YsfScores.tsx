// ySF Site Redesign — Scores: one card per club pairing, every league's score stacked.
import Link from 'next/link'
import { loadClubs, loadWeek } from '@/lib/ysf-data'
import { PageTitle } from '@/components/ysf/ui'
import PairCards from '@/components/ysf/PairCards'
import { weekDateRange } from '@/lib/defaults'


export default async function YsfScores({ league, week }: { league: any; week?: number }) {
  const C = await loadClubs(league.id)
  const wk = await loadWeek(league, week)
  const { start, end } = weekDateRange(league.season, wk.week)
  const m = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' })
  const span = start.getMonth() === end.getMonth() ? `${m(start)} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}` : `${m(start)} ${start.getDate()} – ${m(end)} ${end.getDate()}, ${end.getFullYear()}`
  const base = `/leagues/${league.id}/scores`
  const btn = 'inline-flex items-center justify-center h-10 px-4 rounded-lg font-display text-[13px] font-medium tracking-[.08em] leading-none border'
  return (
    <>
      <PageTitle eyebrow={`${wk.week === wk.thisWeek ? 'This week' : 'Week of'} · ${span} · all leagues`} title="SCORES" />
      <div className="flex gap-2">
        {wk.prev != null ? <Link href={`${base}?w=${wk.prev}`} className={`${btn} border-ink-100 text-black`}>‹ PREV</Link> : <span className={`${btn} border-ink-100 text-ink-200`}>‹ PREV</span>}
        <Link href={base} className={`${btn} ${wk.week === wk.thisWeek ? 'bg-black text-white border-black' : 'border-ink-100 text-black'}`}>THIS WEEK</Link>
        {wk.next != null ? <Link href={`${base}?w=${wk.next}`} className={`${btn} border-ink-100 text-black`}>NEXT ›</Link> : <span className={`${btn} border-ink-100 text-ink-200`}>NEXT ›</span>}
      </div>
      <PairCards leagueId={league.id} pairings={wk.pairings} clubs={C} />
    </>
  )
}
