// Home page score strip, full width above the menu: one cell per club pairing, each league's
// score in its own column under that league's symbol, both clubs with crest and abbreviation.
import Link from 'next/link'
import { db } from '@/db'
import { leagues } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { YSF_LEAGUES, YSF_ART, YSF_LEAGUE_ID } from '@/lib/ysf'
import { loadClubs, loadWeek, seriesSummary } from '@/lib/ysf-data'

const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 })

export default async function ScoreStrip() {
  try {
    const [league] = await db.select().from(leagues).where(eq(leagues.id, YSF_LEAGUE_ID)).limit(1)
    if (!league) return null
    const [C, wk] = await Promise.all([loadClubs(league.id), loadWeek(league)])
    if (!wk.pairings.length) return null
    const ab = (id: string) => C[id]?.abbreviation ?? ''
    const anyLive = wk.pairings.some(p => p.lines.some(l => l.status === 'LIVE'))
    return (
      <section className="bg-black text-white flex overflow-x-auto border-b border-ink-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Scores">
        <Link href={`/leagues/${league.id}/scores`} className="flex-none flex flex-col items-center justify-center gap-1 px-4 font-display font-bold leading-none" style={{ background: anyLive ? '#ba0c2f' : '#000' }}>
          <span className="inline-flex items-center gap-1.5 text-[13px] tracking-[.1em]">{anyLive && <span className="w-2 h-2 rounded-full bg-white" />}{anyLive ? 'LIVE' : 'SCORES'}</span>
          <span className="text-[11px] tracking-[.08em] text-white/80">WEEK {wk.num(wk.week)}</span>
        </Link>
        {wk.pairings.map(p => {
          const lines = p.lines.filter(l => !l.season)
          return (
            <Link key={p.a + p.b} href={`/leagues/${league.id}/scores`} className="flex-none px-3.5 py-2 border-r border-ink-800 hover:bg-ink-800">
              <div className="grid items-center gap-x-2.5 gap-y-1" style={{ gridTemplateColumns: `22px 40px repeat(${lines.length}, minmax(40px, auto))` }}>
                <span /><span />
                {lines.map(l => { const L = YSF_LEAGUES.find(x => x.sport === l.sport)!; return (
                  <span key={l.sport} className="inline-flex items-center justify-end gap-1">
                    {l.status === 'LIVE' && <span className="w-1.5 h-1.5 rounded-full bg-[#ba0c2f]" />}
                    <img src={YSF_ART.leagueSymbol(L.key, 'black')} alt={L.code} title={`${L.code} · ${l.label}`} className="w-4 h-4 object-contain" />
                  </span>) })}
                {[p.a, p.b].map((id, side) => [
                  <span key={id + 'l'} className="w-[22px] h-[22px] inline-flex items-center justify-center"><img src={C[id]?.logo ?? ''} alt="" className="w-[22px] h-[22px] object-contain" /></span>,
                  <span key={id + 'a'} className="font-display text-[13px] font-bold leading-none">{ab(id)}</span>,
                  ...lines.map(l => { const v = side ? l.b : l.a, o = side ? l.a : l.b, win = v != null && o != null && v > o; return (
                    <span key={id + l.sport} className="font-display text-[13px] leading-none text-right tabular-nums" style={{ color: win ? '#fff' : '#C7C7C7', fontWeight: win ? 800 : 500 }}>{v == null ? '–' : fmt(v)}</span>) }),
                ])}
              </div>
              <div className="text-[11px] text-ink-200 mt-1.5 whitespace-nowrap">{seriesSummary(p, ab)}</div>
            </Link>
          )
        })}
      </section>
    )
  } catch { return null }
}
