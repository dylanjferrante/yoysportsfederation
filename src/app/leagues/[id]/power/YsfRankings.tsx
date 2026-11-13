// ySF Site Redesign — Rankings: three views of who is best. This season (Federation Dominance),
// all-time (every team-season by ySFPR) and the decade race. Numbers come from ysffantasy.com's
// models so the app and the site agree.
import Link from 'next/link'
import { YSF_LEAGUES, YSF_ART } from '@/lib/ysf'
import { loadClubs, siteFeed, siteClubMap, leagueFeed, powerRankingsFeed, siteSeasons } from '@/lib/ysf-data'
import { PageTitle, th, td, ClubCell, RecTh, RecTd } from '@/components/ysf/ui'

const KEY: Record<string, string> = { ysf_fl: 'NFL', ysf_hl: 'NHL', ysf_ba: 'NBA', ysf_lb: 'MLB' }
const LG = (k: string) => YSF_LEAGUES.find(l => l.sport === KEY[k])!

function TabLinks({ base, items, on }: { base: string; items: [string, string][]; on: string }) {
  return (
    <div className="flex gap-1 p-1 bg-white border border-ink-100 rounded-xl overflow-x-auto max-w-full">
      {items.map(([id, label]) => (
        <Link key={id} href={`${base}?tab=${id}`} className={`inline-flex items-center justify-center min-h-[40px] px-4 rounded-lg font-display text-[13px] font-medium tracking-[.08em] leading-none whitespace-nowrap ${on === id ? 'bg-black text-white' : 'text-ink-500 hover:bg-ink-50'}`}>{label}</Link>
      ))}
    </div>
  )
}

export default async function YsfRankings({ league, tab, lg }: { league: any; tab?: string; lg?: string }) {
  const C = await loadClubs(league.id)
  const map = await siteClubMap(C)
  const base = `/leagues/${league.id}/power`
  const t = tab === 'all' || tab === 'dyn' ? tab : 'now'
  const club = (k: string) => C[map[k]]
  const Row = ({ k, rk, children, right }: { k: string; rk: number; children: React.ReactNode; right: React.ReactNode }) => {
    const c = club(k)
    return (
      <div className="grid grid-cols-[22px_minmax(0,1fr)_auto] sm:grid-cols-[28px_minmax(160px,260px)_minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 items-center py-2.5 border-t border-ink-50">
        <span className="font-semibold tabular-nums">{rk}</span>
        <Link href={`/leagues/${league.id}/teams/${c?.id}`} className="flex items-center gap-2.5 min-w-0 pl-2" style={{ borderLeft: `4px solid ${c?.color ?? '#000'}` }}>
          <span className="w-[26px] h-[26px] inline-flex items-center justify-center flex-none"><img src={c?.logo ?? ''} alt="" className="w-[26px] h-[26px] object-contain" /></span>
          <span className="font-bold leading-tight">{c?.name}</span>
        </Link>
        <span className="col-start-2 col-span-2 sm:col-start-3 sm:col-span-1 sm:row-start-1">{children}</span>
        <span className="col-start-3 row-start-1 sm:col-start-4 text-right">{right}</span>
      </div>
    )
  }

  let body: React.ReactNode = null
  if (t === 'now') {
    const d = await siteFeed<any>('federation_dominance.json')
    const rows = (d?.federation ?? []) as any[]
    body = (
      <section className="card px-4 pt-2 pb-4">
        <div className="flex py-2 ui text-[10px] text-ink-500"><span className="flex-1">FEDERATION DOMINANCE</span><span>DOM</span></div>
        {rows.map((r, i) => {
          const c = club(r.team)
          return (
            <Row key={r.team} k={r.team} rk={i + 1} right={<span className="disp text-[24px] font-extrabold tabular-nums">{r.fed_dominance.toFixed(2)}</span>}>
              <span className="relative block h-3 bg-ink-50 rounded-sm">
                <span className="absolute left-0 inset-y-0 rounded-sm" style={{ width: `${Math.min(100, r.fed_dominance / 1.6 * 100)}%`, background: c?.color ?? '#000' }} />
                <span className="absolute -inset-y-1 w-0.5 bg-black" style={{ left: '62.5%' }} />
              </span>
              <span className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[12px] text-ink-500 tabular-nums">
                {Object.entries(r.by_league ?? {}).map(([k, v]: any) => <span key={k} className="inline-flex items-center gap-1"><img src={YSF_ART.leagueSymbol(LG(k).key, 'white')} alt={LG(k).code} className="w-4 h-4 object-contain" />{v.dominance.toFixed(2)}</span>)}
              </span>
            </Row>
          )
        })}
      </section>
    )
  } else if (t === 'all') {
    const keys = ['ysf_fl', 'ysf_hl', 'ysf_ba', 'ysf_lb']
    // every finished season's final standings (from its archive), then this season's live rankings
    const done = (await siteSeasons()).complete.filter(x => x !== league.season)
    const pairs = done.flatMap(sn => keys.map(k => ({ sn, k })))
    const [pr, ...arch] = await Promise.all([powerRankingsFeed<any>(league.season), ...pairs.map(x => leagueFeed<any>(x.k, x.sn))])
    type TS = { k: string; lg: string; season: string; live: boolean; pr: number; rec: string; ppg: number; fin: string }
    const ts: TS[] = []
    pairs.forEach(({ sn, k }, i) => (arch[i]?.standings ?? []).forEach((s: any) => ts.push({ k: s.ysf_id, lg: k, season: sn.replace('-', '–'), live: false, pr: s.display_pr ?? 0,
      rec: `${s.w}-${s.l}`, ppg: s.ppg ?? s.pf / Math.max(1, s.w + s.l), fin: s.playoff_result || `${s.final_rank}${['th', 'st', 'nd', 'rd'][s.final_rank] ?? 'th'}` })))
    for (const [k, rows] of Object.entries(pr?.power_rankings?.leagues ?? {}) as [string, any[]][])
      rows.forEach(s => ts.push({ k: s.team, lg: k, season: String(league.season).replace('-', '–'), live: true, pr: s.display_pr, rec: `${s.wins}-${s.losses}`, ppg: s.ppg, fin: `${s.standings_rank}${['th', 'st', 'nd', 'rd'][s.standings_rank] ?? 'th'} now` }))
    const f = keys.includes(lg ?? '') ? lg! : 'all'
    const list = ts.filter(x => f === 'all' || x.lg === f).sort((a, b) => b.pr - a.pr).slice(0, 25)
    body = (
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {['all', ...keys].map(k => { const on = f === k, L = k === 'all' ? null : LG(k); return (
            <Link key={k} href={`${base}?tab=all${k === 'all' ? '' : `&lg=${k}`}`} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg font-display text-[12px] font-bold tracking-[.06em] leading-none border" style={{ background: on ? (L?.color ?? '#000') : '#fff', color: on ? '#fff' : '#000', borderColor: on ? (L?.color ?? '#000') : '#C7C7C7' }}>
              {L && <img src={YSF_ART.leagueSymbol(L.key, on ? 'color' : 'white')} alt="" className="w-5 h-5 object-contain" />}<span className="ysf-case">{L ? L.code : 'ALL LEAGUES'}</span>
            </Link>) })}
        </div>
        <div className="card">
          <table className="w-full border-collapse">
            <thead><tr><th className={th}>RK</th><th className={th}>CLUB</th><th className={th}>SEASON</th><th className={`${th} text-right`}>ySFPR</th><RecTh /><th className={`${th} text-right hidden sm:table-cell`}>PPG</th><th className={`${th} hidden sm:table-cell`}>FINISH</th></tr></thead>
            <tbody>{list.map((x, i) => { const c = club(x.k), L = LG(x.lg), cc = ClubCell({ name: c?.abbreviation ?? '', logo: c?.logo, color: c?.color, href: `/leagues/${league.id}/teams/${c?.id}` }); return (
              <tr key={x.k + x.lg + x.season}>
                <td className={`${td} w-8`}>{i + 1}</td>
                <td className={td} style={cc.style}><span className="sm:hidden">{cc.inner}</span><span className="hidden sm:inline">{ClubCell({ name: c?.name ?? '', logo: c?.logo, color: c?.color, href: `/leagues/${league.id}/teams/${c?.id}` }).inner}</span></td>
                <td className={`${td} font-normal`}><span className="inline-flex items-center gap-1.5"><img src={YSF_ART.leagueSymbol(L.key, 'white')} alt={L.code} className="w-5 h-5 object-contain" /><span className="text-[13px] hidden sm:inline">{x.season}</span><span className="text-[13px] sm:hidden">{x.season.slice(2)}</span>{x.live && <><span className="ui hidden sm:inline-flex items-center justify-center text-[10px] font-bold leading-none px-1.5 h-[18px] rounded-sm bg-[#ba0c2f] text-white">LIVE</span><span className="sm:hidden w-2 h-2 rounded-full bg-[#ba0c2f]" aria-label="Live" /></>}</span></td>
                <td className={`${td} text-right disp text-[18px] sm:text-[22px] font-extrabold`}>{x.pr.toFixed(1)}</td>
                <RecTd rec={x.rec} />
                <td className={`${td} text-right font-normal hidden sm:table-cell`}>{x.ppg.toFixed(1)}</td>
                <td className={`${td} font-normal hidden sm:table-cell`}>{x.fin}</td>
              </tr>) })}</tbody>
          </table>
        </div>
      </section>
    )
  } else {
    const d = await siteFeed<any>('decade_race.json')
    const rows = (d?.teams ?? []) as any[]
    const span = 9 * 10
    body = (
      <section className="card px-4 pt-2 pb-4">
        <div className="flex py-2 ui text-[10px] text-ink-500"><span className="flex-1">DECADE RACE · YEAR {d?.year_in_decade ?? 2} OF {d?.decade_len ?? 10}</span><span>WON · PROJECTED</span></div>
        {rows.map(r => {
          const c = club(r.team)
          return (
            <Row key={r.team} k={r.team} rk={r.rank} right={<span className="tabular-nums whitespace-nowrap"><b>{r.confirmed_fed_pts}</b><span className="text-ink-500"> · {r.projected_total.toFixed(1)}</span></span>}>
              <span className="flex h-3 bg-ink-50 rounded-sm overflow-hidden">
                <span style={{ width: `${r.confirmed_fed_pts / span * 100}%`, background: c?.color ?? '#000' }} />
                <span style={{ width: `${r.projected_current_season / span * 100}%`, background: c?.color ?? '#000', opacity: 0.35 }} />
              </span>
            </Row>
          )
        })}
      </section>
    )
  }

  return (
    <>
      <PageTitle eyebrow="ySFPR V3 · cross-sport" title="RANKINGS" right={<TabLinks base={base} on={t} items={[['now', 'THIS SEASON'], ['all', 'ALL-TIME'], ['dyn', 'DYNASTY']]} />} />
      {body}
    </>
  )
}
