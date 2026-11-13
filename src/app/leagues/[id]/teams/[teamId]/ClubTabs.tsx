'use client'
// Club page tabs (the canvas's Club board): calendar · each league · drafts · moves · head-to-head
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Tabs, th, td } from '@/components/ysf/ui'
import { YSF_LEAGUES, YSF_ART } from '@/lib/ysf'
import MyClub from '../../myteam/MyClub'

type Cell = { matchupId: string; span: number; label: string; opp: string; result: string; tone: 'win' | 'loss' | 'tie' | 'live' | 'future'; playoff: boolean } | null
export type LeagueSeason = {
  result: string | null; rankLabel: string; rank: string; rec: string; pf: string; fed: string; po: string | null; title: string | null
  sched: { per: string; dates: string; ha: string; crest: string | null; opp: string; matchupId: string; res: string; score: string }[]
}
type PickChip = { kind: 'own' } | { kind: 'acq'; ab: string; crest: string | null } | { kind: 'gone'; ab: string }
export type ClubTabsData = {
  leagueId: string; clubName: string; clubAb: string; season: string
  calendar: { cols: { key: string; label: string; current: boolean; season?: string }[]; rows: { sport: string; cells: Cell[] }[] }
  leagues: Record<string, { seasons: string[]; bySeason: Record<string, LeagueSeason>; roster: { label: string; rows: { slot: string; name: string; team: string; pos: string }[] }[]; rounds: number[]; picks: { year: number; cells: PickChip[][] }[] }>
  drafts: { title: string; sport: string | null; when: string; rows: { pk: string; player: string; team: string; pos: string; via: string }[] }[]
  moves: { when: string; sport: string; kind: string; player: string; team: string; pos: string; detail: string }[]
  h2h: { id: string; name: string; crest: string | null; rec: string; pct: string; pf: string; pa: string }[]
}
const TONE: Record<string, { bg: string; bd: string }> = {
  win: { bg: '#E8F3EC', bd: '#CFE6D6' }, loss: { bg: '#FBE9EC', bd: '#F2D0D6' }, tie: { bg: '#F2F2F2', bd: '#E5E5E5' },
  live: { bg: '#fff', bd: '#000' }, future: { bg: '#fff', bd: '#E5E5E5' },
}
const KIND: Record<string, string> = { CLAIMED: 'CLAIM', SIGNED: 'SIGN', DROPPED: 'DROP', TRADED: 'TRADE', MOVE: 'MOVE' }
const fmt = (iso: string) => { const d = new Date(/T|Z/.test(iso) ? iso : iso.replace(' ', 'T') + 'Z'); return isNaN(+d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
const badge = 'ui inline-flex items-center justify-center leading-none h-[22px] px-1.5 rounded-[2px] text-[11px] font-bold'

// `own`: the signed-in member's club — each league tab carries that league's editable lineup, and
// ADD / DROP, TRADE and PENDING join the same tab row (?tab=players|trade|pending opens one).
export default function ClubTabs({ data: d, own = false, start = 'cal' }: { data: ClubTabsData; own?: boolean; start?: string }) {
  const [tab, setTab] = useState(() => {
    const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null
    return own && q && ['players', 'trade', 'pending'].includes(q) ? q : start
  })
  const [season, setSeason] = useState<Record<string, string>>({})
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (tab !== 'cal' || !scroller.current) return
    const el = scroller.current.querySelector('[data-current="1"]') as HTMLElement | null
    if (el) scroller.current.scrollLeft = Math.max(0, el.offsetLeft - 260)
  }, [tab])
  const L = YSF_LEAGUES.find(l => l.sport === tab)
  const lg = L ? d.leagues[L.sport] : undefined
  const ss = L && lg ? (season[L.sport] ?? lg.seasons[0]) : ''
  const S = lg?.bySeason[ss]
  const isCur = ss === d.season
  const lgOf = (sp: string) => YSF_LEAGUES.find(l => l.sport === sp)

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 min-w-0">
        <div className="min-w-0 w-full lg:w-auto lg:flex-1">
          <Tabs value={tab} onChange={setTab} items={[{ id: 'cal', label: 'CALENDAR' }, ...YSF_LEAGUES.map(l => ({ id: l.sport, label: l.code })), ...(own ? [{ id: 'players', label: 'ADD / DROP' }, { id: 'trade', label: 'TRADE' }, { id: 'pending', label: 'PENDING' }] : []), { id: 'dr', label: 'DRAFTS' }, { id: 'tx', label: 'MOVES' }, { id: 'h2h', label: 'HEAD-TO-HEAD' }]} />
        </div>
        {L && lg && lg.seasons.length > 1 && (
          <label className="inline-flex items-center gap-2">
            <span className="ui text-[11px] tracking-[.12em] text-ink-500">SEASON</span>
            <select className="ui h-10 px-3 rounded-lg border border-ink-100 bg-white text-[13px] font-bold" value={ss} onChange={e => setSeason(x => ({ ...x, [L.sport]: e.target.value }))}>
              {lg.seasons.map(x => <option key={x} value={x}>{x.replace('-', '–')}</option>)}
            </select>
          </label>
        )}
      </div>

      {tab === 'cal' && (
        <section className="card p-3 min-w-0">
          <div ref={scroller} className="overflow-x-auto">
            <div className="grid gap-1 w-max" style={{ gridTemplateColumns: `40px repeat(${d.calendar.cols.length}, 112px)` }}>
              <span className="sticky left-0 z-20 bg-white shadow-[4px_0_0_#fff]" />
              {d.calendar.cols.map(c => (
                <span key={c.key} data-current={c.current ? '1' : undefined} className="flex flex-col items-center justify-end gap-1 text-[11px] font-bold text-center leading-tight py-1" style={{ color: c.current ? '#000' : '#4A4A4A' }}>
                  {c.season && <span className="ui text-[10px] font-bold text-white bg-black rounded px-1.5 py-0.5">{c.season} STARTS</span>}
                  {c.label}
                </span>
              ))}
              {d.calendar.rows.map(r => {
                const l = lgOf(r.sport)!
                return [
                  <span key={r.sport} className="sticky left-0 z-20 bg-white shadow-[4px_0_0_#fff] flex items-center justify-center border-r-4 border-black pr-1" title={l.code}><img src={YSF_ART.leagueSymbol(l.key, 'white')} alt={l.code} className="w-7 h-7 object-contain" /></span>,
                  ...r.cells.map((c, i) => c ? (
                    <Link key={r.sport + i} href={`/leagues/${d.leagueId}/matchup/${c.matchupId}`} className="h-[52px] rounded flex flex-col items-center justify-center text-center leading-tight border hover:brightness-95"
                      style={{ gridColumn: `span ${c.span}`, background: TONE[c.tone].bg, borderColor: l.color, borderWidth: c.tone === 'live' ? 3 : 2 }}>
                      <span className="text-[10px] text-ink-500">{c.label}{c.playoff ? ' · PO' : ''}</span>
                      <span className="text-[12px] font-bold">{c.opp}</span>
                      {c.result && <span className="text-[10px]">{c.result}</span>}
                    </Link>
                  ) : <span key={r.sport + i} className="h-[52px] rounded border border-ink-50" />),
                ]
              })}
            </div>
          </div>
        </section>
      )}

      {own && (tab === 'players' || tab === 'trade' || tab === 'pending') && <MyClub key={tab} leagueId={d.leagueId} embedded view={tab} />}

      {L && lg && S && (
        <section className="flex flex-col gap-4 min-w-0">
          <div className="card p-4 sm:p-5 flex flex-wrap items-center gap-4" style={{ borderTop: `4px solid ${L.color}` }}>
            <span className="w-12 h-12 inline-flex items-center justify-center flex-none"><img src={YSF_ART.leagueSymbol(L.key, 'white')} alt="" className="w-12 h-12 object-contain" /></span>
            <div className="min-w-0 flex-1 basis-[180px]"><div className="ui text-[11px] tracking-[.12em] text-ink-500">{d.clubName.toUpperCase()} · {ss.replace('-', '–')}</div><div className="disp text-[24px] sm:text-[28px] font-extrabold leading-none mt-1"><span className="ysf-case">{L.name}</span></div></div>
            <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-x-5 gap-y-3 w-full sm:w-auto">
              {([S.result ? ['RESULT', S.result] : null, [S.rankLabel, S.rank], ['RECORD', S.rec], ['PF', S.pf], ['CUP PTS', S.fed], S.po ? ['P%', S.po] : null, S.title ? ['TITLE %', S.title] : null].filter(Boolean) as string[][]).map(([k, v]) => (
                <div key={k}><div className="ui text-[10px] tracking-[.12em] text-ink-500">{k}</div><div className="disp text-[22px] font-extrabold leading-none mt-0.5">{v}</div></div>
              ))}
            </div>
          </div>

          {own && isCur && <MyClub key={L.sport} leagueId={d.leagueId} embedded sport={L.sport} view="lineup" />}

          <div className="grid gap-4 lg:grid-cols-2 items-start">
            {isCur && !own && (
              <div className="card overflow-hidden">
                {lg.roster.map(g => (
                  <div key={g.label}>
                    <div className="ui flex justify-between px-4 py-2 bg-ink-50 text-[12px] font-bold tracking-[.12em]"><span>{g.label}</span><span className="text-ink-500">{g.rows.length}</span></div>
                    {g.rows.map((p, i) => (
                      <div key={i} className="grid grid-cols-[52px_minmax(0,1fr)_44px_72px] gap-3 items-center px-4 py-2 border-t border-ink-50">
                        <span className="ui inline-flex items-center justify-center leading-none h-7 rounded-[3px] text-[12px] font-bold" style={{ background: g.label === 'STARTERS' ? L.color : '#E5E5E5', color: g.label === 'STARTERS' ? '#fff' : '#1F1F1F' }}>{p.slot}</span>
                        <span className="min-w-0 font-semibold text-[14px] break-words">{p.name}</span><span className="text-[13px]">{p.team}</span><span className="text-[13px] break-words">{p.pos}</span>
                      </div>
                    ))}
                  </div>
                ))}
                {!lg.roster.length && <div className="p-4 text-ink-400 font-semibold">No players</div>}
              </div>
            )}
            <div className="flex flex-col gap-4 min-w-0">
              {isCur && lg.picks.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="ui px-4 py-2.5 border-b-2 border-black text-[12px] font-bold tracking-[.12em]">FUTURE DRAFT PICKS</div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead><tr><th className={th}>DRAFT</th>{lg.rounds.map(r => <th key={r} className={`${th} text-center`}>RD {r}</th>)}</tr></thead>
                      <tbody>{lg.picks.map(p => (
                        <tr key={p.year}><td className={td}>{p.year}</td>
                          {p.cells.map((chips, i) => (
                            <td key={i} className={`${td} text-center`}><div className="flex flex-wrap justify-center gap-1">
                              {chips.map((c, j) => c.kind === 'own' ? <span key={j} className={`${badge} bg-black text-white`}>OWN</span>
                                : c.kind === 'acq' ? <span key={j} className={`${badge} gap-1 border border-black bg-white text-black`}>{c.crest && <img src={c.crest} alt="" className="w-4 h-4 object-contain" />}{c.ab}</span>
                                : <span key={j} className={`${badge} bg-ink-100 text-ink-600`} title={`Traded to ${c.ab}`}>TRADED</span>)}
                              {!chips.length && <span className="text-ink-300">—</span>}
                            </div></td>
                          ))}
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="card overflow-hidden">
                <div className="ui px-4 py-2.5 border-b-2 border-black text-[12px] font-bold tracking-[.12em]">SCHEDULE</div>
                {S.sched.map((x, i) => (
                  <Link key={i} href={`/leagues/${d.leagueId}/matchup/${x.matchupId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-ink-50 first:border-t-0 hover:bg-ink-50">
                    <span className="min-w-0"><span className="ui block text-[11px] tracking-[.08em] text-ink-500">{x.per}{x.dates ? ` · ${x.dates}` : ''}</span>
                      <span className="flex items-center gap-1.5 font-bold text-[14px] min-w-0"><span className="text-ink-500 font-normal">{x.ha}</span>{x.crest && <img src={x.crest} alt="" className="w-5 h-5 object-contain flex-none" />}<span className="truncate">{x.opp}</span></span></span>
                    <span className="flex items-center gap-2 flex-none">{x.res && <span className={`${badge} text-white`} style={{ background: x.res === 'W' ? '#177245' : x.res === 'L' ? '#ba0c2f' : '#8A8A8A' }}>{x.res}</span>}<span className="text-[14px] font-semibold tabular-nums">{x.score}</span></span>
                  </Link>
                ))}
                {!S.sched.length && <div className="p-4 text-ink-400 font-semibold">No schedule yet</div>}
              </div>
            </div>
          </div>
        </section>
      )}

      {tab === 'dr' && (
        <section className="grid gap-4 lg:grid-cols-2 items-start">
          {d.drafts.map((dr, i) => { const l = dr.sport ? lgOf(dr.sport) : null; return (
            <div key={i} className="card overflow-hidden" style={{ borderTop: `4px solid ${l?.color ?? '#000'}` }}>
              <div className="flex items-center gap-2 px-4 pt-3">
                {l ? <img src={YSF_ART.leagueSymbol(l.key, 'white')} alt="" className="w-6 h-6 object-contain" /> : <img src={YSF_ART.cupSymbol} alt="" className="w-6 h-6 object-contain" />}
                <span className="ui text-[13px] font-bold tracking-[.08em]"><span className="ysf-case">{dr.title.toUpperCase().replace(/YSF/g, 'ySF')}</span></span>
              </div>
              <div className="px-4 pb-2 text-[13px] text-ink-500">{fmt(dr.when)} · {dr.rows.length} {d.clubAb} pick{dr.rows.length === 1 ? '' : 's'}</div>
              <table className="w-full border-collapse table-fixed">
                <thead><tr><th className={`${th} w-[92px]`}>PICK</th><th className={th}>PLAYER</th><th className={`${th} w-[52px]`}>TEAM</th><th className={`${th} w-[72px]`}>POS</th><th className={`${th} w-[64px]`}>VIA</th></tr></thead>
                <tbody>{dr.rows.map((r, j) => <tr key={j}><td className={`${td} text-[13px]`}>{r.pk}</td><td className={`${td} !whitespace-normal`}>{r.player}</td><td className={`${td} font-normal`}>{r.team}</td><td className={`${td} font-normal !whitespace-normal`}>{r.pos}</td><td className={`${td} font-normal`}>{r.via}</td></tr>)}</tbody>
              </table>
            </div>) })}
          {!d.drafts.length && <div className="card p-6 text-ink-500 font-semibold">No drafts yet</div>}
        </section>
      )}

      {tab === 'tx' && (
        <section className="card overflow-hidden">
          {d.moves.length ? (
            <table className="w-full border-collapse table-fixed">
              <thead><tr><th className={`${th} w-[96px] sm:w-[120px]`}>DATE</th><th className={`${th} w-[44px]`}><span className="sr-only">League</span></th><th className={`${th} w-[64px]`}>MOVE</th><th className={th}>PLAYER</th><th className={`${th} w-[52px]`}>TEAM</th><th className={`${th} hidden sm:table-cell w-[72px]`}>POS</th><th className={`${th} hidden sm:table-cell w-[110px] text-right`}>DETAIL</th></tr></thead>
              <tbody>{d.moves.map((m, i) => { const l = lgOf(m.sport); return (
                <tr key={i}>
                  <td className={`${td} font-normal text-[13px]`}>{fmt(m.when)}</td>
                  <td className={td}>{l && <img src={YSF_ART.leagueSymbol(l.key, 'white')} alt={l.code} className="w-6 h-6 object-contain" />}</td>
                  <td className={td}><span className={`${badge} text-white`} style={{ background: m.kind === 'DROPPED' ? '#8A8A8A' : m.kind === 'TRADED' ? '#2F5D8A' : '#000' }}>{KIND[m.kind] ?? m.kind}</span></td>
                  <td className={`${td} !whitespace-normal text-[14px]`}>{m.player}</td><td className={`${td} font-normal`}>{m.team}</td><td className={`${td} font-normal hidden sm:table-cell !whitespace-normal`}>{m.pos}</td>
                  <td className={`${td} hidden sm:table-cell text-right font-normal`}>{m.detail}</td>
                </tr>) })}</tbody>
            </table>
          ) : <div className="p-6 text-ink-500 font-semibold">No transactions yet this season.</div>}
        </section>
      )}

      {tab === 'h2h' && (
        <section className="card overflow-hidden">
          <table className="w-full border-collapse table-fixed">
            <thead><tr><th className={th}>OPPONENT</th><th className={`${th} w-[44px] text-right`}>W</th><th className={`${th} w-[44px] text-right`}>L</th><th className={`${th} w-[64px] text-right`}>PCT</th><th className={`${th} hidden sm:table-cell w-[110px] text-right`}>PF</th><th className={`${th} hidden sm:table-cell w-[110px] text-right`}>PA</th></tr></thead>
            <tbody>{d.h2h.map(t => (
              <tr key={t.id}>
                <td className={`${td} !whitespace-normal`}><Link href={`/leagues/${d.leagueId}/teams/${t.id}`} className="inline-flex items-center gap-2 min-w-0">{t.crest && <img src={t.crest} alt="" className="w-6 h-6 object-contain flex-none" />}<span>{t.name}</span></Link></td>
                {t.rec.split(/[–-]/).slice(0, 2).map((v, k) => <td key={k} className={`${td} text-right`}>{v}</td>)}<td className={`${td} text-right`}>{t.pct}</td>
                <td className={`${td} hidden sm:table-cell text-right font-normal`}>{t.pf}</td><td className={`${td} hidden sm:table-cell text-right font-normal`}>{t.pa}</td>
              </tr>
            ))}</tbody>
          </table>
          {!d.h2h.length && <div className="p-6 text-ink-500 font-semibold">No completed matchups yet</div>}
        </section>
      )}
    </>
  )
}
