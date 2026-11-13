// Club-pairing cards (Scores, Matchday): both clubs, then every league's score for the pairing.
import Link from 'next/link'
import { YSF_LEAGUES, YSF_ART } from '@/lib/ysf'
import { seriesSummary, type Pairing, type ClubInfo } from '@/lib/ysf-data'

const fmt = (v: number | null) => v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 1 })

export default function PairCards({ leagueId, pairings, clubs, only }: { leagueId: string; pairings: Pairing[]; clubs: Record<string, ClubInfo>; only?: string | null }) {
  const ab = (id: string) => clubs[id]?.abbreviation ?? ''
  const shown = pairings.map(p => ({ ...p, lines: only ? p.lines.filter(l => l.sport === only) : p.lines })).filter(p => p.lines.length)
  if (!shown.length) return <div className="card p-8 text-center font-semibold text-ink-500">No matchups this week</div>
  return (
    <section className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
      {shown.map(p => (
        <div key={p.a + p.b} className="card overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-ink-100">
            {[p.a, p.b].map((id, i) => (
              <div key={id} className={`flex items-center gap-2.5 flex-1 min-w-0 ${i ? 'flex-row-reverse text-right' : ''}`} style={{ [i ? 'borderRight' : 'borderLeft']: `4px solid ${clubs[id]?.color ?? '#000'}`, [i ? 'paddingRight' : 'paddingLeft']: 8 } as any}>
                <span className="w-10 h-10 inline-flex items-center justify-center flex-none"><img src={clubs[id]?.logo ?? ''} alt="" className="w-10 h-10 object-contain" /></span>
                <div className="min-w-0"><div className="disp text-[22px] font-extrabold leading-none">{ab(id)}</div><div className="text-[11px] text-ink-500 truncate">{clubs[id]?.name}</div></div>
              </div>
            )).reduce((acc: any[], el, i) => i ? [...acc, <span key="vs" className="ui text-[12px] text-ink-500">VS</span>, el] : [el], [])}
          </div>
          {p.lines.map(l => {
            const lg = YSF_LEAGUES.find(x => x.sport === l.sport)!
            const aw = l.a != null && l.b != null && l.a > l.b, bw = l.a != null && l.b != null && l.b > l.a
            return (
              <Link key={l.sport} href={`/leagues/${leagueId}/matchup/${l.matchupId}`} className="flex items-center gap-3 px-4 py-3 border-b border-ink-100 hover:bg-ink-50">
                <span className="disp text-[26px] tabular-nums flex-1" style={{ fontWeight: aw ? 800 : 500 }}>{fmt(l.a)}</span>
                <span className="flex items-center gap-1.5 text-[12px] text-ink-500 whitespace-nowrap">
                  <img src={YSF_ART.leagueSymbol(lg.key, 'white')} alt={lg.code} className="w-5 h-5 object-contain" />
                  {l.label} · {l.status === 'FINAL' ? 'Final' : l.status === 'LIVE' ? <span className="text-[#ba0c2f] font-bold">Live</span> : 'Upcoming'}
                </span>
                <span className="disp text-[26px] tabular-nums flex-1 text-right" style={{ fontWeight: bw ? 800 : 500 }}>{fmt(l.b)}</span>
              </Link>
            )
          })}
          {!only && <div className="ui px-4 py-2.5 bg-ink-50 text-[12px] font-bold tracking-[.08em]">{seriesSummary(p, ab)}</div>}
        </div>
      ))}
    </section>
  )
}
