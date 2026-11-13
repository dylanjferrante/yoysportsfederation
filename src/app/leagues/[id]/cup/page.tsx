// ySF Site Redesign — Cup Race: every club's path to the Federation Cup. Points banked, each
// league's place, and ysffantasy.com's 10,000-season projection (expected points, range, odds).
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { leagues } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { YSF_LEAGUE_ID, YSF_LEAGUES, YSF_ART } from '@/lib/ysf'
import { loadStandings, siteCupProjection } from '@/lib/ysf-data'
import { pct } from '@/lib/ysf-stories'
import { PageTitle, th, td, ClubCell } from '@/components/ysf/ui'
import { loadModel } from '@/lib/ysf-model'

export const metadata = { title: 'ySF · Cup Race' }
const KEY: Record<string, string> = { NFL: 'ysf_fl', NHL: 'ysf_hl', NBA: 'ysf_ba', MLB: 'ysf_lb' }

export default async function CupRacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (id !== YSF_LEAGUE_ID) redirect(`/leagues/${id}/odds`)
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  const s = await loadStandings(league)
  const site = await siteCupProjection()
  const C = s.clubs
  const byAbbr = new Map((site?.teams ?? []).map((t: any) => [t.abbr, t]))
  const rows = [...s.cup].sort((a, b) => b.cupPct - a.cupPct || b.exp - a.exp).map(r => ({ ...r, p: byAbbr.get(C[r.teamId]?.abbreviation) as any }))
  const max = 48
  const updated = site?.generated_at ? new Date(site.generated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET' : null
  const lead = rows[0], lc = C[lead.teamId]

  return (
    <>
      <PageTitle eyebrow={`${(site?.n_trials ?? 10000).toLocaleString()}-season model${updated ? ` · updated ${updated}` : ''}`} title="CUP RACE" />

      {/* favorite */}
      <section className="rounded overflow-hidden flex text-white" style={{ background: lc?.color ?? '#000' }}>
        <div className="flex flex-col w-1.5">{YSF_LEAGUES.map(l => <span key={l.key} className="flex-1" style={{ background: l.color }} />)}</div>
        <div className="flex flex-wrap items-center gap-5 p-5 sm:p-6">
          <span className="w-20 h-20 sm:w-28 sm:h-28 inline-flex items-center justify-center"><img src={(lc?.altLogo || lc?.logo) ?? ''} alt={lc?.name} className="w-full h-full object-contain" /></span>
          <div>
            <div className="disp text-[52px] sm:text-[80px] font-extrabold leading-[.85]">{pct(lead.cupPct)}</div>
            <div className="ui text-[12px] sm:text-[13px] tracking-[.14em] mt-2">{lc?.name?.toUpperCase()} · CUP FAVORITE · {lead.exp.toFixed(1)} PROJECTED POINTS</div>
          </div>
        </div>
      </section>

      {/* season progress per league */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {YSF_LEAGUES.map(l => {
          const m = site?.leagues?.[KEY[l.sport]]
          const done = m?.n_completed_reg ?? 0, total = done + (m?.n_upcoming_reg ?? 0)
          return (
            <div key={l.key} className="card p-3">
              <div className="flex items-center gap-2"><img src={YSF_ART.leagueSymbol(l.key, 'white')} alt="" className="w-6 h-6 object-contain" /><span className="ui text-[12px] font-bold ysf-case">{l.code}</span></div>
              <div className="h-2 bg-ink-50 rounded-sm mt-2.5 overflow-hidden"><span className="block h-full" style={{ width: `${total ? done / total * 100 : 0}%`, background: l.color }} /></div>
              <div className="text-[12px] text-ink-500 mt-1.5 tabular-nums">{total ? `${done} of ${total} games played` : 'Not started'}</div>
            </div>
          )
        })}
      </section>

      {/* phones: the App's compact rows */}
      <section className="card sm:hidden">
        <div className="flex px-3 py-2 ui text-[10px] text-ink-500"><span className="flex-1">CLUB</span><span>EXP. PTS · CUP %</span></div>
        {rows.map((r, i) => { const c = C[r.teamId]; return (
          <Link key={r.teamId} href={`/leagues/${id}/teams/${r.teamId}`} className="flex items-center gap-2.5 px-3 h-[52px] border-t border-ink-50">
            <span className="w-[14px] text-right text-[12px] font-semibold tabular-nums">{i + 1}</span>
            <span className="w-1 h-7 rounded-sm" style={{ background: c?.color ?? '#000' }} />
            <img src={c?.logo ?? ''} alt="" className="w-6 h-6 object-contain" />
            <span className="flex-1 min-w-0 font-bold text-[13px] leading-tight">{c?.name}</span>
            <span className="text-[12px] text-ink-500 tabular-nums w-9 text-right">{r.exp.toFixed(1)}</span>
            <span className="disp text-[19px] font-extrabold tabular-nums min-w-[52px] text-right">{pct(r.cupPct)}</span>
          </Link>) })}
      </section>

      {/* desktop: the full table */}
      <section className="card overflow-x-auto hidden sm:block">
        <table className="w-full border-collapse">
          <thead><tr>
            <th className={th}>RK</th><th className={th}>CLUB</th><th className={`${th} text-right`}>PTS</th>
            {YSF_LEAGUES.map(l => <th key={l.key} className={`${th} text-center`}><img src={YSF_ART.leagueSymbol(l.key, 'white')} alt={l.code} className="w-5 h-5 object-contain inline" /></th>)}
            <th className={th}>PROJECTED RANGE</th><th className={`${th} text-right`}>EXP.</th><th className={`${th} text-right`}>TOP 3</th><th className={`${th} text-right`}>LAST</th><th className={`${th} text-right`}>CUP</th>
          </tr></thead>
          <tbody>{rows.map((r, i) => { const c = C[r.teamId], cc = ClubCell({ name: c?.name ?? '', logo: c?.logo, color: c?.color, href: `/leagues/${id}/teams/${r.teamId}` }); const p = r.p; return (
            <tr key={r.teamId}>
              <td className={`${td} w-8`}>{i + 1}</td>
              <td className={td} style={cc.style}>{cc.inner}</td>
              <td className={`${td} text-right`}>{r.pts}</td>
              {YSF_LEAGUES.map(l => { const k = r.ranks[l.sport]; return <td key={l.key} className={`${td} text-center font-normal text-ink-800`}>{k ?? '–'}</td> })}
              <td className={`${td} min-w-[200px]`}>
                {p ? (
                  <span className="relative block h-3 bg-ink-50 rounded-sm" title={`${p.min_fed_pts}–${p.max_fed_pts}`}>
                    <span className="absolute inset-y-0 rounded-sm opacity-35" style={{ left: `${p.min_fed_pts / max * 100}%`, width: `${(p.max_fed_pts - p.min_fed_pts) / max * 100}%`, background: c?.color ?? '#000' }} />
                    <span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${r.pts / max * 100}%`, background: c?.color ?? '#000' }} />
                    <span className="absolute -inset-y-1 w-0.5 bg-black" style={{ left: `${r.exp / max * 100}%` }} />
                  </span>
                ) : '—'}
              </td>
              <td className={`${td} text-right`}>{r.exp.toFixed(1)}{p && <span className="text-ink-500 font-normal text-[13px]"> ± {p.sd_fed_pts.toFixed(1)}</span>}</td>
              <td className={`${td} text-right font-normal`}>{p ? pct(p.p_top_3) : '—'}</td>
              <td className={`${td} text-right font-normal`}>{p ? pct(p.p_last) : '—'}</td>
              <td className={`${td} text-right disp text-[22px] font-extrabold`}>{pct(r.cupPct)}</td>
            </tr>) })}</tbody>
        </table>
      </section>

      {/* the app's own model: player projections → club lineups → 10,000 seasons through the playoffs */}
      {(() => { const mdl = loadModel(); if (!mdl || mdl.season !== league.season) return null; const list = Object.entries(mdl.cup).sort((a, b) => b[1].win - a[1].win || b[1].exp - a[1].exp); return (
        <section className="card overflow-x-auto">
          <div className="ui px-4 pt-3 pb-1 text-[12px] font-bold tracking-[.12em]">ySF MODEL · {mdl.sims.toLocaleString()} SEASONS · {new Date(mdl.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }).toUpperCase()} ET</div>
          <table className="w-full border-collapse min-w-[640px]">
            <thead><tr><th className={th}>CLUB</th><th className={`${th} text-right`}>EXP PTS</th><th className={`${th} text-right`}>±</th>{YSF_LEAGUES.map(l => <th key={l.key} className={`${th} text-right`}><span className="ysf-case">{l.code}</span> TITLE</th>)}<th className={`${th} text-right`}>TOP 3</th><th className={`${th} text-right`}>WIN CUP</th></tr></thead>
            <tbody>{list.map(([tid, c]) => { const cc = ClubCell({ name: C[tid]?.name ?? '', logo: C[tid]?.logo, color: C[tid]?.color, href: `/leagues/${id}/teams/${tid}` }); return (
              <tr key={tid}>
                <td className={td} style={cc.style}>{cc.inner}</td>
                <td className={`${td} text-right`}>{c.exp.toFixed(1)}</td><td className={`${td} text-right font-normal`}>{c.sd.toFixed(1)}</td>
                {YSF_LEAGUES.map(l => <td key={l.key} className={`${td} text-right font-normal`}>{pct(mdl.leagues[l.sport]?.clubs[tid]?.title ?? 0)}</td>)}
                <td className={`${td} text-right font-normal`}>{pct(c.top3)}</td><td className={`${td} text-right disp text-[20px] font-extrabold`}>{pct(c.win)}</td>
              </tr>) })}</tbody>
          </table>
        </section>) })()}
    </>
  )
}
