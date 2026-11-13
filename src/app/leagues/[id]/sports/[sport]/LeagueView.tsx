'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Tabs, th, td, RecTh, RecTd } from '@/components/ysf/ui'
import MovesTable, { type MoveRowT } from '@/components/ysf/MovesTable'
import { YSF_LEAGUES, YSF_ART } from '@/lib/ysf'

type Club = { name: string; abbreviation: string; logo: string | null; altLogo: string | null; color: string | null }
type Row = { teamId: string; rk: number; rec: string; gb: number; pf: number; faab: number; fed: number; po: number; title: number }
type Game = { id: string; home: string; away: string | null; hs: number; as: number; done: boolean }
export type LeagueViewData = {
  leagueId: string; sport: string; code: string; name: string; live: boolean; codes: Record<string, string>; clubs: Record<string, Club>
  table: Row[]; weeks: { week: number; label: string; playoff: boolean; games: Game[] }[]; cur: number; curLabel: string
  champ: string; playoffTeams: number
  rosters: Record<string, { label: string; rows: { slot: string; name: string; meta: string }[] }[]>
  moves: MoveRowT[]
}
const pct = (x: number) => (x >= 0.9995 ? '>99%' : x > 0 && x < 0.005 ? '<1%' : Math.round(x * 100) + '%')
const num = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 })

function ClubLine({ d, id, score, win, right }: { d: LeagueViewData; id: string | null; score?: string; win?: boolean; right?: boolean }) {
  const c = id ? d.clubs[id] : null
  return (
    <span className={`flex items-center gap-2 flex-1 min-w-0 ${right ? 'flex-row-reverse text-right' : ''}`}>
      <span className="w-7 h-7 inline-flex items-center justify-center flex-none">{c?.logo && <img src={c.logo} alt="" className="w-7 h-7 object-contain" />}</span>
      <span className="font-bold truncate">{c?.abbreviation ?? 'TBD'}</span>
      {score != null && <span className={`disp text-[20px] tabular-nums ${right ? 'mr-auto' : 'ml-auto'}`} style={{ fontWeight: win ? 800 : 500 }}>{score}</span>}
    </span>
  )
}

export default function LeagueView({ data: d }: { data: LeagueViewData }) {
  const L = YSF_LEAGUES.find(l => l.sport === d.sport)!
  const [tab, setTab] = useState<'st' | 'mu' | 'po' | 'ro' | 'mv'>('st')
  const [wk, setWk] = useState(d.cur)
  const [rc, setRc] = useState(d.table[0]?.teamId ?? Object.keys(d.clubs)[0])
  const week = d.weeks.find(w => w.week === wk)
  const curWeek = d.weeks.find(w => w.week === d.cur)
  const seeds = d.table.slice(0, d.playoffTeams)
  const Seed = ({ i }: { i: number }) => { const r = seeds[i]; const c = r ? d.clubs[r.teamId] : null; return (
    <div className="flex items-center gap-2 h-12 px-2.5 border border-ink-100 rounded" style={{ borderLeft: `4px solid ${c?.color ?? '#C7C7C7'}` }}>
      <b className="w-4">{r ? i + 1 : '–'}</b><span className="w-6 h-6 inline-flex items-center justify-center">{c?.logo && <img src={c.logo} alt="" className="w-6 h-6 object-contain" />}</span>
      <span className="font-semibold truncate">{c?.name ?? 'TBD'}</span></div>) }
  const Tbd = ({ label }: { label: string }) => <div className="flex items-center h-12 px-2.5 border border-ink-100 rounded text-ink-500 font-semibold" style={{ borderLeft: '4px solid #C7C7C7' }}>{label}</div>

  return (
    <>
      <section className="rounded p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4" style={{ background: L.color }}>
        <img src={YSF_ART.leagueLockup(L.key, 'color')} alt={d.name} className="h-16 sm:h-20 w-auto" />
        <div className="flex flex-wrap gap-2">
          {YSF_LEAGUES.map(l => (
            <Link key={l.sport} href={`/leagues/${d.leagueId}/sports/${l.sport}`} className="inline-flex items-center justify-center h-10 px-4 rounded font-display text-[13px] font-bold tracking-[.06em] leading-none"
              style={{ background: l.sport === d.sport ? '#fff' : 'rgba(255,255,255,.18)', color: l.sport === d.sport ? '#000' : '#fff' }}><span className="ysf-case">{d.codes[l.sport]}</span></Link>
          ))}
        </div>
      </section>

      <Tabs value={tab} onChange={setTab} items={[{ id: 'st', label: 'STANDINGS' }, { id: 'mu', label: 'MATCHUPS' }, { id: 'po', label: 'PLAYOFFS' }, { id: 'ro', label: 'ROSTERS' }, { id: 'mv', label: 'MOVES' }]} />

      {tab === 'st' && (!d.live ? (
        <section className="card p-8"><div className="disp text-[28px] font-extrabold"><span className="ysf-case">{d.code}</span> HASN’T STARTED</div><div className="text-ink-500 mt-1">Standings appear after the first period.</div></section>
      ) : (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] items-start">
          <div className="card overflow-x-auto">
            <table className="w-full border-collapse sm:min-w-[640px]">
              <thead><tr>
                <th className={th}>RK</th><th className={th}>CLUB</th><RecTh /><th className={`${th} text-right hidden sm:table-cell`}>GB</th>
                <th className={`${th} text-right`}>PF</th><th className={`${th} text-right hidden sm:table-cell`}>FAAB</th><th className={`${th} text-right`}>P%</th>
                <th className={`${th} text-right hidden sm:table-cell`}>TITLE %</th><th className={`${th} text-right hidden sm:table-cell`}>FED</th>
              </tr></thead>
              <tbody>{d.table.map(r => { const c = d.clubs[r.teamId]; return (
                <tr key={r.teamId} style={{ boxShadow: r.rk === d.playoffTeams ? 'inset 0 -2px 0 #000' : 'none' }}>
                  <td className={`${td} w-9`}>{r.rk}</td>
                  <td className={`${td} whitespace-normal`} style={{ borderLeft: `4px solid ${c?.color ?? '#000'}` }}>
                    <Link href={`/leagues/${d.leagueId}/teams/${r.teamId}`} className="flex items-center gap-2.5"><span className="w-7 h-7 inline-flex items-center justify-center flex-none">{c?.logo && <img src={c.logo} alt="" className="w-7 h-7 object-contain" />}</span>
                      <span className="font-bold leading-tight"><span className="hidden sm:inline">{c?.name}</span><span className="sm:hidden">{c?.abbreviation}</span></span></Link></td>
                  <RecTd rec={r.rec} /><td className={`${td} text-right font-normal hidden sm:table-cell`}>{r.gb ? r.gb.toFixed(1) : '–'}</td>
                  <td className={`${td} text-right`}>{num(r.pf)}</td><td className={`${td} text-right font-normal hidden sm:table-cell`}>${r.faab}</td>
                  <td className={`${td} text-right`}>{pct(r.po)}</td><td className={`${td} text-right font-normal hidden sm:table-cell`}>{pct(r.title)}</td><td className={`${td} text-right hidden sm:table-cell`}>{r.fed}</td>
                </tr>) })}</tbody>
            </table>
          </div>
          {curWeek && (
            <div className="card p-4">
              <div className="ui text-[12px] tracking-[.12em] text-ink-500 mb-2">{d.curLabel.toUpperCase()} · THIS WEEK</div>
              {curWeek.games.map(g => (
                <Link key={g.id} href={`/leagues/${d.leagueId}/matchup/${g.id}`} className="flex items-center gap-3 py-2 border-t border-ink-50 hover:bg-ink-50">
                  <ClubLine d={d} id={g.home} score={g.hs || g.as ? num(g.hs) : undefined} win={g.hs > g.as} />
                  <ClubLine d={d} id={g.away} score={g.hs || g.as ? num(g.as) : undefined} win={g.as > g.hs} right />
                </Link>
              ))}
            </div>
          )}
        </section>
      ))}

      {tab === 'mu' && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {d.weeks.map(w => (
              <button key={w.week} onClick={() => setWk(w.week)} className="inline-flex items-center justify-center h-9 px-3 rounded border font-display text-[12px] font-bold tracking-[.06em] leading-none"
                style={{ background: w.week === wk ? L.color : '#fff', color: w.week === wk ? '#fff' : '#000', borderColor: w.week === wk ? L.color : '#E5E5E5' }}>
                {w.label.replace('Week ', 'WK ').replace('Period ', 'P')}{w.playoff ? ' · PO' : ''}</button>
            ))}
          </div>
          <section className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {week?.games.map(g => (
              <Link key={g.id} href={`/leagues/${d.leagueId}/matchup/${g.id}`} className="card p-4 flex items-center gap-3 hover:bg-ink-50" style={{ borderTop: `4px solid ${L.color}` }}>
                <ClubLine d={d} id={g.home} score={g.hs || g.as || g.done ? num(g.hs) : '—'} win={g.hs > g.as} />
                <span className="ui text-[11px] text-ink-500">{g.done ? 'FINAL' : g.hs || g.as ? 'LIVE' : 'VS'}</span>
                <ClubLine d={d} id={g.away} score={g.hs || g.as || g.done ? num(g.as) : '—'} win={g.as > g.hs} right />
              </Link>
            ))}
          </section>
        </>
      )}

      {tab === 'po' && (
        <section className="card p-4 overflow-x-auto">
          <div className="ui text-[12px] tracking-[.12em] text-ink-500 mb-3">{d.live ? 'IF THE SEASON ENDED TODAY' : 'PLAYOFF FIELD'} · {d.champ.toUpperCase()}</div>
          <div className="grid gap-4 min-w-[720px]" style={{ gridTemplateColumns: '1fr 1fr 1fr 220px' }}>
            <div className="flex flex-col gap-3"><div className="ui text-[11px] text-ink-500">QUARTERFINALS</div>
              <div className="flex flex-col gap-1"><Seed i={2} /><Seed i={5} /></div><div className="flex flex-col gap-1"><Seed i={3} /><Seed i={4} /></div></div>
            <div className="flex flex-col gap-3"><div className="ui text-[11px] text-ink-500">SEMIFINALS</div>
              <div className="flex flex-col gap-1"><Seed i={0} /><Tbd label="Lowest remaining seed" /></div><div className="flex flex-col gap-1"><Seed i={1} /><Tbd label="Other QF winner" /></div></div>
            <div className="flex flex-col gap-3"><div className="ui text-[11px] text-ink-500">FINAL</div><div className="flex flex-col gap-1 mt-auto mb-auto"><Tbd label="SF winner" /><Tbd label="SF winner" /></div></div>
            <div className="flex flex-col items-center justify-center gap-2 rounded p-4 text-center" style={{ background: '#F2F2F2' }}>
              <img src={`/ysf/champ/${L.key}.svg`} alt="" className="h-28 w-auto" /><div className="ui text-[12px] font-bold">{d.champ.toUpperCase()}</div></div>
          </div>
        </section>
      )}

      {tab === 'ro' && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {d.table.map(r => r.teamId).concat(Object.keys(d.clubs).filter(id => !d.table.some(t => t.teamId === id))).map(id => { const c = d.clubs[id], on = id === rc; return (
              <button key={id} onClick={() => setRc(id)} className="inline-flex items-center gap-2 h-10 pl-2 pr-3 rounded border-2 font-display text-[13px] font-bold leading-none" style={{ borderColor: c.color ?? '#000', background: on ? c.color ?? '#000' : '#fff', color: on ? '#fff' : '#000' }}>
                <span className="w-6 h-6 inline-flex items-center justify-center"><img src={(on ? c.altLogo || c.logo : c.logo)!} alt="" className="w-6 h-6 object-contain" /></span>{c.abbreviation}</button>) })}
          </div>
          <section className="card overflow-hidden" style={{ borderTop: `4px solid ${d.clubs[rc]?.color ?? '#000'}` }}>
            {(d.rosters[rc] ?? []).map(g => (
              <div key={g.label}>
                <div className="ui flex justify-between px-4 py-2 bg-ink-50 text-[12px] font-bold tracking-[.12em]"><span>{g.label}</span><span className="text-ink-500">{g.rows.length}</span></div>
                {g.rows.map((p, i) => (
                  <div key={i} className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 items-center px-4 py-2 border-t border-ink-50">
                    <span className="ui inline-flex items-center justify-center leading-none h-7 rounded-[3px] text-[12px] font-bold" style={{ background: g.label === 'STARTERS' ? L.color : '#E5E5E5', color: g.label === 'STARTERS' ? '#fff' : '#1F1F1F' }}>{p.slot}</span>
                    <span className="min-w-0 font-bold">{p.name} <span className="font-normal text-[13px] text-ink-500 whitespace-nowrap">{p.meta}</span></span>
                  </div>
                ))}
              </div>
            ))}
          </section>
        </>
      )}

      {tab === 'mv' && <MovesTable leagueId={d.leagueId} rows={d.moves} clubs={d.clubs} codes={d.codes} fixedSport={d.sport} />}
    </>
  )
}
