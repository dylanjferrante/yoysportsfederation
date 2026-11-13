// ySF Site Redesign — Scores: one card per club pairing, every league's score stacked.
import Link from 'next/link'
import { loadClubs, loadWeek, seriesSummary } from '@/lib/ysf-data'
import { PageTitle } from '@/components/ysf/ui'
import { YSF_LEAGUES, YSF_ART } from '@/lib/ysf'
import { weekDateRange } from '@/lib/defaults'

const fmt = (v: number | null) => v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 1 })

export default async function YsfScores({ league, week }: { league: any; week?: number }) {
  const C = await loadClubs(league.id)
  const wk = await loadWeek(league, week)
  const ab = (id: string) => C[id]?.abbreviation ?? ''
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
      {!wk.pairings.length && <div className="card p-8 text-center font-semibold text-ink-500">No matchups this week</div>}
      <section className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {wk.pairings.map(p => (
          <div key={p.a + p.b} className="card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-ink-100">
              {[p.a, p.b].map((id, i) => (
                <div key={id} className={`flex items-center gap-2.5 flex-1 min-w-0 ${i ? 'flex-row-reverse text-right' : ''}`}>
                  <span className="w-10 h-10 inline-flex items-center justify-center flex-none"><img src={C[id]?.logo ?? ''} alt="" className="w-10 h-10 object-contain" /></span>
                  <div className="min-w-0"><div className="disp text-[22px] font-extrabold leading-none">{ab(id)}</div><div className="text-[11px] text-ink-500 truncate">{C[id]?.name}</div></div>
                </div>
              )).reduce((acc: any[], el, i) => i ? [...acc, <span key="vs" className="ui text-[12px] text-ink-500">VS</span>, el] : [el], [])}
            </div>
            {p.lines.map(l => {
              const lg = YSF_LEAGUES.find(x => x.sport === l.sport)!
              const aw = l.a != null && l.b != null && l.a > l.b, bw = l.a != null && l.b != null && l.b > l.a
              return (
                <Link key={l.sport} href={`/leagues/${league.id}/matchup/${l.matchupId}`} className="flex items-center gap-3 px-4 py-3 border-b border-ink-100 hover:bg-ink-50">
                  <span className="disp text-[26px] tabular-nums flex-1" style={{ fontWeight: aw ? 800 : 500 }}>{fmt(l.a)}</span>
                  <span className="flex items-center gap-1.5 text-[12px] text-ink-500 whitespace-nowrap">
                    <img src={YSF_ART.leagueSymbol(lg.key, 'white')} alt={lg.code} className="w-5 h-5 object-contain" />
                    {l.label} · {l.status === 'FINAL' ? 'Final' : l.status === 'LIVE' ? <span className="text-[#ba0c2f] font-bold">Live</span> : 'Upcoming'}
                  </span>
                  <span className="disp text-[26px] tabular-nums flex-1 text-right" style={{ fontWeight: bw ? 800 : 500 }}>{fmt(l.b)}</span>
                </Link>
              )
            })}
            <div className="ui px-4 py-2.5 bg-ink-50 text-[12px] font-bold tracking-[.08em]">{seriesSummary(p, ab)}</div>
          </div>
        ))}
      </section>
    </>
  )
}
