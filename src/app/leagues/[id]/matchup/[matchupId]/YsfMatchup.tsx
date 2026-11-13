// ySF Site Redesign — one league matchup. Tabs to this club pairing's other leagues this week, a
// scroller of the league's other matchups, the scoreboard, a day picker for the daily leagues
// (ySFHL/ySFBA/ySFLB), then both lineups slot by slot (all starters together, in position order)
// with each player's stat line and points, then bench, IR and taxi.
// Player lines come from Fantrax's own record (fantrax_player_periods) until the app scores
// matchups itself; points show once a day (or the NFL week) is over.
import Link from 'next/link'
import { db } from '@/db'
import { matchups } from '@/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { YSF_LEAGUES, YSF_ART, U } from '@/lib/ysf'
import { loadClubs, periodLabel } from '@/lib/ysf-data'
import { weekDateRange } from '@/lib/defaults'
import { statType, statCell, maxCols } from '@/lib/ysf-statline'

type Line = { team_id: string; date: string | null; slot: string; status: string; name: string; pro_team: string | null; positions: string | null; fpts: number | null; opp: string | null; fx_player_id: string; stats: string | null }
const SLOT: Record<string, string> = { RWT: 'FLEX', Flx: 'FLEX', UT: 'UTIL', Util: 'UTIL', Skt: 'SKT' }
const STATUS: Record<string, string> = { '2': 'BENCH', '3': 'INJURED RESERVE', '9': 'TAXI SQUAD' }
const fmt = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
const dayLabel = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const utd = (name = '') => name.replace(/\bUnited\b/, 'Utd.')
// full club name; "United" becomes "Utd." on phones
const ClubName = ({ name }: { name?: string }) => <><span className="sm:hidden">{utd(name)}</span><span className="hidden sm:inline">{name}</span></>
const GRID = 'grid grid-cols-[minmax(0,1fr)_auto_48px_auto_minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_72px_60px_72px_minmax(0,1fr)] items-center gap-x-2 sm:gap-x-3 px-3 sm:px-4'

export default async function YsfMatchup({ league, m, day }: { league: any; m: any; day?: string }) {
  const C = await loadClubs(league.id)
  const L = YSF_LEAGUES.find(l => l.sport === m.sport)!
  const season = m.season ?? league.season
  const isCur = season === league.season
  const label = isCur ? periodLabel(league, m.sport, m.week) : `${m.sport === 'NFL' ? 'Week' : 'Period'} ${m.week}`
  const period = isCur ? Number(label.replace(/\D/g, '')) : m.week
  const md = (d: Date, y = false) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(y ? { year: 'numeric' } : {}) })
  const A = m.homeTeamId, B = m.awayTeamId

  let lines: Line[] = []
  try {
    lines = db.all<Line>(sql`SELECT team_id, date, slot, status, name, pro_team, positions, fpts, opp, fx_player_id, stats FROM fantrax_player_periods
      WHERE season = ${season} AND sport = ${m.sport} AND matchup_period = ${period} AND team_id IN (${A}, ${B}) ORDER BY rowid`)
  } catch { /* table not loaded yet */ }
  const today = new Date().toISOString().slice(0, 10)
  const daily = m.sport !== 'NFL'
  const days = daily ? [...new Set(lines.map(l => l.date!).filter(Boolean))].sort() : []
  const final = (l: Line) => m.isComplete || (daily && !!l.date && l.date < today)
  const sel = daily ? (day && days.includes(day) ? day : days.filter(d => d <= today).pop() ?? days[0]) : null
  const shown = daily ? lines.filter(l => l.date === sel) : lines
  let span = season.replace('-', '–')
  if (daily && days.length) span = `${md(new Date(days[0] + 'T12:00:00'))}–${md(new Date(days[days.length - 1] + 'T12:00:00'), true)}`
  else if (!daily && isCur) { const { start } = weekDateRange(season, m.week); const s0 = new Date(start); s0.setDate(s0.getDate() + 3); const e0 = new Date(start); e0.setDate(e0.getDate() + 9); span = `${md(s0)}–${md(e0, true)}` }

  // this pairing's other leagues this week, and this league's other matchups
  const week = await db.select().from(matchups).where(and(eq(matchups.leagueId, league.id), eq(matchups.season, season), eq(matchups.week, m.week)))
  const pair = (x: any) => [x.homeTeamId, x.awayTeamId].sort().join('|') === [A, B].sort().join('|')
  const siblings = isCur ? YSF_LEAGUES.map(l => ({ l, x: week.find(x => x.sport === l.sport && pair(x)) })).filter(s => s.x) : []
  const others = week.filter(x => x.sport === m.sport && x.awayTeamId)

  const total = (tid: string, ls: Line[]) => ls.filter(l => l.team_id === tid && l.status === '1' && final(l)).reduce((s, l) => s + (l.fpts ?? 0), 0)
  const side = (tid: string) => {
    const ls = shown.filter(l => l.team_id === tid)
    return { act: ls.filter(l => l.status === '1'), groups: ['2', '3', '9'].map(s => ({ s, ls: ls.filter(l => l.status === s) })) }
  }
  const sa = side(A), sb = side(B)
  const rows = Math.max(sa.act.length, sb.act.length)
  const base = `/leagues/${league.id}/matchup/${m.id}`
  const aw = (m.homeScore ?? 0) > (m.awayScore ?? 0), bw = (m.awayScore ?? 0) > (m.homeScore ?? 0)
  const statsOf = (l: Line) => (l.stats ? JSON.parse(l.stats) : null) as Record<string, string> | null

  const Player = ({ l, right }: { l?: Line; right?: boolean }) => l ? (
    <span className={`min-w-0 flex flex-col ${right ? 'items-end text-right' : ''}`}>
      <span className="font-bold text-[14px] leading-tight">{l.name}</span>
      <span className="text-[11px] text-ink-500 leading-tight"><span className="ysf-case">({L.code}{l.pro_team ? `-${l.pro_team}` : ''}, {l.positions ?? l.slot})</span>{l.opp ? <span> · {l.opp.replace(/ F$/, '')}</span> : null}</span>
    </span>
  ) : <span className="text-ink-200 text-[13px]">Empty</span>
  const Pts = ({ l, right }: { l?: Line; right?: boolean }) => (
    <span className={`disp text-[18px] sm:text-[20px] tabular-nums ${right ? 'text-left' : 'text-right'} ${l && final(l) ? 'font-extrabold' : 'text-ink-400 font-medium'}`}>{l && final(l) && l.fpts != null && (l.opp || l.fpts) ? fmt(l.fpts) : '–'}</span>
  )
  const Club = ({ tid, score, win, right }: { tid: string; score: number | null; win: boolean; right?: boolean }) => (
    <Link href={`/leagues/${league.id}/teams/${tid}`} className={`flex-1 min-w-0 flex items-center gap-3 p-4 text-white ${right ? 'sm:flex-row-reverse sm:text-right' : ''}`} style={{ background: C[tid]?.color ?? '#000' }}>
      <span className="w-14 h-14 sm:w-20 sm:h-20 inline-flex items-center justify-center flex-none"><img src={(C[tid]?.altLogo || C[tid]?.logo) ?? ''} alt="" className="w-full h-full object-contain" /></span>
      <span className="min-w-0 flex-1 disp text-[20px] sm:text-[26px] font-extrabold leading-[1.05]"><ClubName name={C[tid]?.name} /></span>
      <span className={`disp tabular-nums text-[34px] sm:text-[52px] leading-none ${win ? 'font-extrabold' : 'font-medium opacity-80'}`}>{score == null ? '–' : fmt(score)}</span>
    </Link>
  )
  const chip = 'flex-none inline-flex items-center justify-center gap-2 h-11 px-3.5 rounded-lg border leading-none'

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b-2 border-black pb-3.5">
        <div>
          <div className="eyebrow flex items-center gap-2"><img src={YSF_ART.leagueSymbol(L.key, 'white')} alt="" className="w-5 h-5 object-contain" /><span className="ysf-case">{U(`${L.code} · ${label} · ${span}`)}</span></div>
          <h1 className="disp text-[40px] sm:text-[64px] font-extrabold leading-[.85] mt-1.5">MATCHUP</h1>
        </div>
        <Link href={`/leagues/${league.id}/scores`} className="ui text-[13px] font-bold tracking-[.12em]">ALL SCORES →</Link>
      </div>

      {/* this pairing in every league this week */}
      {siblings.length > 1 && (
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
          {siblings.map(({ l, x }) => { const on = x!.id === m.id, a = x!.homeTeamId === A ? x!.homeScore : x!.awayScore, b = x!.homeTeamId === A ? x!.awayScore : x!.homeScore; return (
            <Link key={l.key} href={`/leagues/${league.id}/matchup/${x!.id}`} className={chip} style={{ background: on ? l.color : '#fff', color: on ? '#fff' : '#000', borderColor: on ? l.color : '#C7C7C7' }}>
              <img src={YSF_ART.leagueSymbol(l.key, on ? 'color' : 'white')} alt="" className="w-6 h-6 object-contain" />
              <span className="font-display text-[13px] font-bold ysf-case">{l.code}</span>
              <span className="text-[13px] tabular-nums">{a == null ? '–' : fmt(a)} – {b == null ? '–' : fmt(b)}</span>
            </Link>) })}
        </div>
      )}

      <section className="rounded overflow-hidden">
        <div className="flex flex-col sm:flex-row">
          <Club tid={A} score={m.homeScore} win={aw} />
          <Club tid={B} score={m.awayScore} win={bw} right />
        </div>
        <div className="ui text-[12px] font-bold tracking-[.12em] text-center py-2 bg-black text-white">{m.isComplete ? 'FINAL' : 'IN PROGRESS'}</div>
      </section>

      {/* the league's other matchups this week */}
      {others.length > 1 && (
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
          {others.map(x => { const on = x.id === m.id; return (
            <Link key={x.id} href={`/leagues/${league.id}/matchup/${x.id}`} className={`flex-none flex flex-col justify-center gap-1 min-w-[150px] px-3 py-2 rounded-lg border ${on ? 'bg-black text-white border-black' : 'bg-white border-ink-100 hover:border-ink-400'}`}>
              {[[x.homeTeamId, x.homeScore, x.awayScore], [x.awayTeamId!, x.awayScore, x.homeScore]].map(([id, v, o]) => (
                <span key={id as string} className="flex items-center gap-2 text-[13px] leading-none">
                  <img src={C[id as string]?.logo ?? ''} alt="" className="w-[18px] h-[18px] object-contain" />
                  <span className="font-bold flex-1">{C[id as string]?.abbreviation}</span>
                  <span className={`tabular-nums ${(v as number) > (o as number) ? 'font-extrabold' : ''}`}>{v == null ? '–' : fmt(v as number)}</span>
                </span>
              ))}
            </Link>) })}
        </div>
      )}

      {daily && days.length > 0 && (
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
          {days.map(d => { const on = d === sel; return (
            <Link key={d} href={`${base}?day=${d}`} scroll={false} className={`flex-none flex flex-col items-center justify-center gap-1 min-w-[96px] h-[54px] px-3 rounded-lg border leading-none ${on ? 'bg-black text-white border-black' : 'bg-white border-ink-100 hover:border-ink-400'}`}>
              <span className="font-display text-[13px] font-bold">{dayLabel(d).toUpperCase()}</span>
              <span className={`text-[11px] tabular-nums ${on ? 'text-ink-200' : 'text-ink-500'}`}>{d < today || m.isComplete ? `${fmt(total(A, lines.filter(l => l.date === d)))} – ${fmt(total(B, lines.filter(l => l.date === d)))}` : 'Upcoming'}</span>
            </Link>) })}
        </div>
      )}

      {!lines.length ? (
        <div className="card p-8 text-center font-semibold text-ink-500">Lineups for this matchup haven’t been loaded yet</div>
      ) : (
        <section className="card overflow-hidden">
          <div className={`${GRID} py-2 border-b-2 border-black ui text-[11px] text-ink-500`}>
            <span><ClubName name={C[A]?.name} /></span><span className="text-right">PTS</span>
            <span className="text-center">{daily && sel ? dayLabel(sel).toUpperCase() : 'SLOT'}</span>
            <span>PTS</span><span className="text-right"><ClubName name={C[B]?.name} /></span>
          </div>
          {Array.from({ length: rows }, (_, i) => {
            const a = sa.act[i], b = sb.act[i]
            return (
              <div key={i} className={`${GRID} py-2.5 border-b border-ink-50`}>
                <Player l={a} /><Pts l={a} />
                <span className="inline-flex items-center justify-center h-7 rounded bg-ink-50 ui text-[11px] font-bold leading-none">{SLOT[(a ?? b)!.slot] ?? (a ?? b)!.slot}</span>
                <Pts l={b} right /><Player l={b} right />
              </div>
            )
          })}
          <div className={`${GRID} py-3 bg-ink-50`}>
            <span className="ui text-[12px] font-bold">{daily ? 'DAY TOTAL' : 'TOTAL'}</span>
            <span className="disp text-[22px] font-extrabold tabular-nums text-right">{fmt(total(A, shown))}</span><span />
            <span className="disp text-[22px] font-extrabold tabular-nums">{fmt(total(B, shown))}</span>
            <span className="ui text-[12px] font-bold text-right">{daily ? 'DAY TOTAL' : 'TOTAL'}</span>
          </div>
        </section>
      )}

      {/* box score: one table per club, stat columns; starters together in position order, a header row wherever the stat type changes */}
      {lines.length > 0 && [{ tid: A, s: sa }, { tid: B, s: sb }].map(({ tid, s }) => {
        const nCols = maxCols(m.sport)
        const groups = [{ s: '1', ls: s.act }, ...s.groups].filter(g => g.ls.length)
        const th = 'px-2 py-2 ui text-[11px] font-medium text-ink-500 whitespace-nowrap'
        return (
          <section key={tid} className="card overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-2.5 border-b-2 border-black">
              <span className="w-7 h-7 inline-flex items-center justify-center"><img src={C[tid]?.logo ?? ''} alt="" className="w-7 h-7 object-contain" /></span>
              <span className="font-bold flex-1">{C[tid]?.name}</span>
              <span className="disp text-[20px] font-extrabold tabular-nums">{fmt(total(tid, shown))}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <tbody>
                  {groups.map(g => {
                    let prev = ''
                    return [
                      <tr key={g.s + 'h'} className="bg-ink-50"><td colSpan={5 + nCols} className="px-3 py-1.5 ui text-[11px] font-bold tracking-[.12em]">{g.s === '1' ? 'STARTERS' : STATUS[g.s]}</td></tr>,
                      ...g.ls.flatMap(l => {
                        const st = statsOf(l), t = statType(m.sport, l.slot, st), out = []
                        if (t.id !== prev) {
                          out.push(<tr key={l.fx_player_id + 'th'} className="border-b border-ink-100">
                            <th className={`${th} text-left sticky left-0 bg-white`}>{g.s === '1' ? 'SLOT' : ''}</th><th className={`${th} text-left sticky left-[52px] bg-white`}>PLAYER</th><th className={`${th} text-left`}>OPP</th><th className={`${th} text-right`}>FPTS</th>
                            {t.cols.map(([lab]) => <th key={lab} className={`${th} text-right`}>{lab}</th>)}{Array.from({ length: nCols - t.cols.length }, (_, i) => <th key={'x' + i} />)}<th />
                          </tr>)
                          prev = t.id
                        }
                        const played = !!(l.opp || l.fpts)
                        out.push(<tr key={l.fx_player_id} className="border-b border-ink-50">
                          <td className="px-2 py-2 sticky left-0 bg-white w-[52px]">{g.s === '1' && <span className="inline-flex items-center justify-center h-6 min-w-[40px] px-1 rounded bg-ink-50 ui text-[10px] font-bold leading-none">{SLOT[l.slot] ?? l.slot}</span>}</td>
                          <td className="px-2 py-2 sticky left-[52px] bg-white min-w-[150px]"><span className="block font-bold leading-tight">{l.name}</span><span className="block text-[11px] text-ink-500 leading-tight ysf-case">({L.code}{l.pro_team ? `-${l.pro_team}` : ''}, {l.positions ?? l.slot})</span></td>
                          <td className="px-2 py-2 text-ink-500 whitespace-nowrap">{l.opp ? l.opp.replace(/ F$/, '') : '–'}</td>
                          <td className={`px-2 py-2 text-right tabular-nums ${g.s === '1' ? 'font-extrabold' : 'text-ink-500'}`}>{final(l) && l.fpts != null && played ? fmt(l.fpts) : '–'}</td>
                          {t.cols.map(([lab, key]) => { const v = played ? statCell(st, key) : ''; return <td key={lab} className={`px-2 py-2 text-right tabular-nums ${v && v !== '0' ? '' : 'text-ink-200'}`}>{v === '' ? '–' : v}</td> })}
                          {Array.from({ length: nCols - t.cols.length }, (_, i) => <td key={'x' + i} />)}<td />
                        </tr>)
                        return out
                      }),
                    ]
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </>
  )
}
