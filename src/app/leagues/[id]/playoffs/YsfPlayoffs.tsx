// ySF Site Redesign — Playoffs: each league's bracket (top 6; seeds 1–2 bye; semifinals reseeded;
// championship, 3rd and 5th place). This season's is projected from the current seeds, with the
// playoff picture below; past seasons show the bracket as it was played.
import Link from 'next/link'
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { YSF_LEAGUES, YSF_ART, U } from '@/lib/ysf'
import { loadClubs, loadStandings, leagueFeed, siteSeasons } from '@/lib/ysf-data'
import { trophyName, trophyArt } from '@/lib/ysf-trophies'
import { pct } from '@/lib/ysf-stories'
import { PageTitle, th, td, ClubCell, RecTh, RecTd } from '@/components/ysf/ui'

const KEY: Record<string, string> = { NFL: 'ysf_fl', NHL: 'ysf_hl', NBA: 'ysf_ba', MLB: 'ysf_lb' }
type M = { away_ysf_id: string | null; home_ysf_id: string | null; away_seed: number | null; home_seed: number | null; away_score: number; home_score: number; winner_ysf_id: string | null; complete: boolean; is_bye: boolean }
type Round = { name: string; period?: number; matchups: M[] }
const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })

export default async function YsfPlayoffs({ league, lg, season: sArg }: { league: any; lg?: string; season?: string }) {
  const C = await loadClubs(league.id)
  const L = YSF_LEAGUES.find(l => l.key === lg) ?? YSF_LEAGUES[0]
  // every finished season ysffantasy.com has archived, then this one
  const seasons = [...new Set([...(await siteSeasons()).complete, league.season])]
  const season = seasons.includes(sArg ?? '') ? sArg! : league.season
  const cur = season === league.season
  const feed = await leagueFeed<any>(KEY[L.sport], season)
  const bracket = feed?.playoff_bracket as { status: string; seeds: Record<string, number>; rounds: Round[] } | undefined
  // ysffantasy.com owner ids → our clubs (owners were imported as <ysf_id>@ysf.local)
  const own = new Map(db.all<{ id: string; email: string }>(sql`SELECT t.id, u.email FROM teams t JOIN users u ON u.id = t.user_id WHERE t.league_id = ${league.id}`).map(r => [r.email.replace('@ysf.local', ''), r.id]))
  const club = (y: string | null | undefined) => (y ? C[own.get(y) ?? ''] : undefined)
  const bySeed = new Map(Object.entries(bracket?.seeds ?? {}).map(([y, s]) => [s, y]))
  const started = bracket?.status && bracket.status !== 'not_started'
  // not started: Round 1 from the seeds (3 v 6, 4 v 5; 1 and 2 bye); later rounds wait on results
  const rounds: Round[] = started ? (bracket!.rounds ?? []) : [
    { name: 'Round 1', matchups: [[1, null], [4, 5], [2, null], [3, 6]].map(([h, a]) => ({ home_ysf_id: bySeed.get(h!) ?? null, home_seed: h, away_ysf_id: a ? bySeed.get(a) ?? null : null, away_seed: a, home_score: 0, away_score: 0, winner_ysf_id: null, complete: false, is_bye: !a })) },
    { name: 'Semifinals', matchups: [{} as M, {} as M] }, { name: 'Championship', matchups: [{} as M] },
  ]
  const main = rounds.filter(r => !/place/i.test(r.name)), extra = rounds.filter(r => /place/i.test(r.name))
  const champ = started && bracket!.status === 'complete' ? club(rounds.find(r => /champ/i.test(r.name))?.matchups[0]?.winner_ysf_id) : undefined
  const s = cur ? await loadStandings(league) : null
  const chip = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg font-display text-[12px] font-bold tracking-[.06em] leading-none border'
  const href = (k: string, sea: string) => `/leagues/${league.id}/playoffs?lg=${k}${sea !== league.season ? `&s=${sea}` : ''}`

  const Side = ({ y, seed, score, win, done }: { y: string | null; seed: number | null; score: number; win: boolean; done: boolean }) => {
    const c = club(y)
    return (
      <div className={`flex items-center gap-2 px-3 h-11 ${win ? 'font-extrabold' : done ? 'text-ink-500' : ''}`} style={{ borderLeft: `4px solid ${c?.color ?? '#E5E5E5'}` }}>
        <span className="w-5 text-[12px] tabular-nums text-ink-500 text-right flex-none">{seed ?? ''}</span>
        <span className="w-6 h-6 inline-flex items-center justify-center flex-none">{c?.logo && <img src={c.logo} alt="" className="w-6 h-6 object-contain" />}</span>
        <span className="flex-1 min-w-0 truncate text-[14px]">{c?.name ?? (seed ? 'TBD' : '—')}</span>
        <span className="tabular-nums text-[14px]">{done ? fmt(score) : ''}</span>
      </div>
    )
  }
  const Game = ({ m }: { m: M }) => (
    <div className="card overflow-hidden divide-y divide-ink-50">
      {m.is_bye ? (<><Side y={m.home_ysf_id} seed={m.home_seed} score={0} win={false} done={false} /><div className="px-3 h-11 flex items-center text-[13px] text-ink-500 ui tracking-[.1em]">BYE</div></>) : (<>
        <Side y={m.home_ysf_id ?? null} seed={m.home_seed ?? null} score={m.home_score} win={!!m.winner_ysf_id && m.winner_ysf_id === m.home_ysf_id} done={!!m.complete && !!m.home_ysf_id} />
        <Side y={m.away_ysf_id ?? null} seed={m.away_seed ?? null} score={m.away_score} win={!!m.winner_ysf_id && m.winner_ysf_id === m.away_ysf_id} done={!!m.complete && !!m.away_ysf_id} />
      </>)}
    </div>
  )

  return (
    <>
      <PageTitle eyebrow={`${L.code} · ${season.replace('-', '–')} · top 6 qualify`} title="PLAYOFFS" right={
        <span className="relative inline-flex"><span className="flex gap-1.5">{seasons.map(x => (
          <Link key={x} href={href(L.key, x)} className={chip} style={{ background: x === season ? '#000' : '#fff', color: x === season ? '#fff' : '#000', borderColor: x === season ? '#000' : '#C7C7C7' }}>{x.replace('-', '–')}</Link>))}</span></span>} />
      <div className="flex flex-wrap gap-2">
        {YSF_LEAGUES.map(l => { const on = l.key === L.key; return (
          <Link key={l.key} href={href(l.key, season)} className={chip} style={{ background: on ? l.color : '#fff', color: on ? '#fff' : '#000', borderColor: on ? l.color : '#C7C7C7' }}>
            <img src={YSF_ART.leagueSymbol(l.key, on ? 'color' : 'white')} alt="" className="w-5 h-5 object-contain" /><span className="ysf-case">{l.code}</span>
          </Link>) })}
      </div>

      {/* champion */}
      <section className="rounded overflow-hidden flex items-center gap-5 p-5 text-white" style={{ background: champ?.color ?? L.color }}>
        <span className="w-20 h-20 inline-flex items-center justify-center flex-none"><img src={trophyArt(L.sport, season)} alt="" className="w-full h-full object-contain" /></span>
        <div className="min-w-0">
          <div className="ui text-[12px] tracking-[.14em] opacity-90">{U(trophyName(L.sport, season))}</div>
          <div className="disp text-[28px] sm:text-[40px] font-extrabold leading-none mt-1">{champ ? champ.name : started ? 'IN PROGRESS' : 'TO BE DECIDED'}</div>
        </div>
        {champ?.altLogo && <span className="ml-auto w-16 h-16 hidden sm:inline-flex items-center justify-center"><img src={champ.altLogo} alt="" className="w-full h-full object-contain" /></span>}
      </section>

      {!bracket ? <div className="card p-8 text-center font-semibold text-ink-500">No bracket yet</div> : (
        <section className="grid gap-4 md:grid-cols-3 items-start">
          {main.map(r => (
            <div key={r.name} className="flex flex-col gap-3">
              <div className="ui text-[12px] tracking-[.14em] text-ink-500 border-b-2 border-black pb-1.5">{U(r.name === 'Round 1' ? 'Quarterfinals' : r.name)}{r.period ? ` · ${L.sport === 'NFL' ? 'Week' : 'Period'} ${r.period}` : ''}</div>
              {r.matchups.map((m, i) => <Game key={i} m={m} />)}
              {r.name === 'Championship' && extra.map(x => (
                <div key={x.name} className="flex flex-col gap-2 mt-2">
                  <div className="ui text-[11px] tracking-[.14em] text-ink-500">{U(x.name)}</div>
                  {x.matchups.map((m, i) => <Game key={i} m={m} />)}
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {s && (
        <section className="card">
          <div className="px-4 pt-3 pb-1 ui text-[12px] tracking-[.14em] text-ink-500">PLAYOFF PICTURE</div>
          <table className="w-full border-collapse">
            <thead><tr><th className={th}>SEED</th><th className={th}>CLUB</th><RecTh /><th className={`${th} text-right`}>GB</th><th className={`${th} text-right`}>PLAYOFFS</th><th className={`${th} text-right hidden sm:table-cell`}>TITLE</th></tr></thead>
            <tbody>{s.tables[L.sport].map(r => { const c = C[r.teamId], cc = ClubCell({ name: c?.name ?? '', logo: c?.logo, color: c?.color, href: `/leagues/${league.id}/teams/${r.teamId}` }); return (
              <tr key={r.teamId} className={r.rk === 6 ? '[&>td]:border-b-2 [&>td]:border-b-black' : ''}>
                <td className={`${td} w-12`}>{r.rk}</td><td className={td} style={cc.style}>{cc.inner}</td>
                <RecTd rec={r.rec} /><td className={`${td} text-right font-normal`}>{r.gb ? r.gb.toFixed(1) : '–'}</td>
                <td className={`${td} text-right`}>{pct(r.po)}</td><td className={`${td} text-right font-normal hidden sm:table-cell`}>{pct(r.title)}</td>
              </tr>) })}</tbody>
          </table>
        </section>
      )}
    </>
  )
}
