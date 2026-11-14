// ySF Site Redesign — Records: the record book from every completed matchup (2025-26 on) —
// highest and lowest scores, biggest wins, closest games, and each club's all-time record.
import Link from 'next/link'
import { db } from '@/db'
import { matchups } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { YSF_LEAGUES, YSF_ART } from '@/lib/ysf'
import { loadClubs } from '@/lib/ysf-data'
import { PageTitle, th, td, ClubCell, RecTh, RecTd } from '@/components/ysf/ui'

const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })

export default async function YsfRecords({ league, lg }: { league: any; lg?: string }) {
  const C = await loadClubs(league.id)
  const L = YSF_LEAGUES.find(l => l.key === lg) ?? YSF_LEAGUES[0]
  const sched = JSON.parse(league.sportSchedule ?? '[]') as { sport: string; startWeek: number }[]
  const ms = (await db.select().from(matchups).where(and(eq(matchups.leagueId, league.id), eq(matchups.sport, L.sport), eq(matchups.isComplete, true))))
    .filter(m => m.awayTeamId && (m.homeScore || m.awayScore))
  // ySF period for a matchup: 2026-27 rows are stored by federation week
  const per = (m: typeof ms[number]) => m.season === league.season ? m.week - (sched.find(s => s.sport === L.sport)?.startWeek ?? 1) + 1 : m.week
  const label = (m: typeof ms[number]) => `${(m.season ?? league.season).replace('-', '–')} · ${L.sport === 'NFL' ? 'Week' : 'Period'} ${per(m)}${m.isPlayoff ? ' · Playoffs' : ''}`
  const scores = ms.flatMap(m => [{ m, t: m.homeTeamId, o: m.awayTeamId!, v: m.homeScore ?? 0, ov: m.awayScore ?? 0 }, { m, t: m.awayTeamId!, o: m.homeTeamId, v: m.awayScore ?? 0, ov: m.homeScore ?? 0 }])
  const high = [...scores].sort((a, b) => b.v - a.v).slice(0, 10)
  const low = [...scores].sort((a, b) => a.v - b.v).slice(0, 10)
  const games = ms.map(m => { const hw = (m.homeScore ?? 0) >= (m.awayScore ?? 0); return { m, w: hw ? m.homeTeamId : m.awayTeamId!, l: hw ? m.awayTeamId! : m.homeTeamId, wv: Math.max(m.homeScore ?? 0, m.awayScore ?? 0), lv: Math.min(m.homeScore ?? 0, m.awayScore ?? 0) } })
  const blowouts = [...games].sort((a, b) => (b.wv - b.lv) - (a.wv - a.lv)).slice(0, 10)
  const close = [...games].filter(g => g.wv !== g.lv).sort((a, b) => (a.wv - a.lv) - (b.wv - b.lv)).slice(0, 10)
  const rec = new Map<string, { w: number; l: number; t: number; pf: number; g: number }>()
  for (const s of scores) { const r = rec.get(s.t) ?? { w: 0, l: 0, t: 0, pf: 0, g: 0 }; r.g++; r.pf += s.v; if (s.v > s.ov) r.w++; else if (s.v < s.ov) r.l++; else r.t++; rec.set(s.t, r) }
  const table = [...rec.entries()].sort((a, b) => (b[1].w / b[1].g) - (a[1].w / a[1].g) || b[1].pf - a[1].pf)
  const chip = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg font-display text-[12px] font-bold tracking-[.06em] leading-none border'
  const Club = ({ id }: { id: string }) => <Link href={`/leagues/${league.id}/teams/${id}`} className="inline-flex items-center gap-1.5 font-semibold"><img src={C[id]?.logo ?? ''} alt="" className="w-5 h-5 object-contain" />{C[id]?.abbreviation}</Link>

  const List = ({ title, rows }: { title: string; rows: { k: string; main: React.ReactNode; sub: string; val: string }[] }) => (
    <section className="card overflow-hidden">
      <div className="ui px-4 py-2.5 border-b-2 border-black text-[12px] font-bold tracking-[.12em]">{title}</div>
      {rows.map((r, i) => (
        <div key={r.k} className="grid grid-cols-[24px_minmax(0,1fr)_auto] gap-3 items-center px-4 py-2.5 border-t border-ink-50">
          <span className="text-ink-500 font-semibold tabular-nums">{i + 1}</span>
          <span className="min-w-0"><span className="block">{r.main}</span><span className="block text-[12px] text-ink-500">{r.sub}</span></span>
          <span className="disp text-[20px] font-extrabold tabular-nums">{r.val}</span>
        </div>
      ))}
      {!rows.length && <div className="p-4 text-ink-400 font-semibold">No games yet</div>}
    </section>
  )

  return (
    <>
      <PageTitle eyebrow={`${L.code} · ${ms.length.toLocaleString()} games on record`} title="RECORDS" />
      <div className="flex flex-wrap gap-2">
        {YSF_LEAGUES.map(l => { const o = l.key === L.key; return (
          <Link key={l.key} href={`/leagues/${league.id}/records?lg=${l.key}`} className={chip} style={{ background: o ? l.color : 'var(--surface)', color: o ? '#fff' : 'var(--fg)', borderColor: o ? l.color : 'var(--line-2)' }}>
            <img src={YSF_ART.leagueSymbol(l.key, o ? 'color' : 'white')} alt="" className="w-5 h-5 object-contain" /><span className="ysf-case">{l.code}</span>
          </Link>) })}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <List title="HIGHEST SCORES" rows={high.map(s => ({ k: s.m.id + s.t, main: <><Club id={s.t} /> <span className="text-ink-500 font-normal">vs {C[s.o]?.abbreviation}</span></>, sub: label(s.m), val: fmt(s.v) }))} />
        <List title="LOWEST SCORES" rows={low.map(s => ({ k: s.m.id + s.t, main: <><Club id={s.t} /> <span className="text-ink-500 font-normal">vs {C[s.o]?.abbreviation}</span></>, sub: label(s.m), val: fmt(s.v) }))} />
        <List title="BIGGEST WINS" rows={blowouts.map(g => ({ k: g.m.id, main: <><Club id={g.w} /> <span className="text-ink-500 font-normal">{fmt(g.wv)} – {fmt(g.lv)}</span> <Club id={g.l} /></>, sub: label(g.m), val: `+${fmt(g.wv - g.lv)}` }))} />
        <List title="CLOSEST GAMES" rows={close.map(g => ({ k: g.m.id, main: <><Club id={g.w} /> <span className="text-ink-500 font-normal">{fmt(g.wv)} – {fmt(g.lv)}</span> <Club id={g.l} /></>, sub: label(g.m), val: `+${fmt(g.wv - g.lv)}` }))} />
      </div>
      <section className="card">
        <div className="ui px-4 pt-3 pb-1 text-[12px] font-bold tracking-[.12em]">ALL-TIME · {L.code.replace('ySF', 'ySF')}</div>
        <table className="w-full border-collapse">
          <thead><tr><th className={th}>CLUB</th><RecTh ties={table.some(([, r]) => r.t)} /><th className={`${th} text-right`}>PCT</th><th className={`${th} text-right hidden sm:table-cell`}>PF</th><th className={`${th} text-right hidden sm:table-cell`}>PF/G</th></tr></thead>
          <tbody>{table.map(([id, r]) => { const cc = ClubCell({ name: C[id]?.name ?? '', logo: C[id]?.logo, color: C[id]?.color, href: `/leagues/${league.id}/teams/${id}` }); return (
            <tr key={id}><td className={td} style={cc.style}>{cc.inner}</td><RecTd rec={`${r.w}-${r.l}-${r.t ?? 0}`} ties={table.some(([, x]) => x.t)} /><td className={`${td} text-right font-normal`}>{(r.w / r.g).toFixed(3).replace(/^0/, '')}</td>
              <td className={`${td} text-right font-normal hidden sm:table-cell`}>{fmt(r.pf)}</td><td className={`${td} text-right font-normal hidden sm:table-cell`}>{fmt(r.pf / r.g)}</td></tr>) })}</tbody>
        </table>
      </section>
    </>
  )
}
