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
import { YSF_LEAGUES, YSF_ART, U, etToday } from '@/lib/ysf'
import { loadClubs, periodLabel, siteFeed } from '@/lib/ysf-data'
import { weekDateRange } from '@/lib/defaults'
import { statType, statCell, compactCols, maxCompact, breakdown } from '@/lib/ysf-statline'
import { gameInfo, refreshLive, tankTeam, loadGameLines, toFantraxStats, type Sport } from '@/lib/ysf-gamelines'
import { scoreSource } from '@/lib/ysf-engine'

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
    // with the engine as the score source, points and stats are the app's own (Fantrax's kept for comparison)
    const eng = scoreSource() === 'engine' && season === league.season
    lines = db.all<Line>(eng
      ? sql`SELECT team_id, date, slot, status, name, pro_team, positions, engine_pts AS fpts, opp, fx_player_id, COALESCE(engine_stats, stats) AS stats FROM fantrax_player_periods
      WHERE season = ${season} AND sport = ${m.sport} AND matchup_period = ${period} AND team_id IN (${A}, ${B}) ORDER BY rowid`
      : sql`SELECT team_id, date, slot, status, name, pro_team, positions, fpts, opp, fx_player_id, stats FROM fantrax_player_periods
      WHERE season = ${season} AND sport = ${m.sport} AND matchup_period = ${period} AND team_id IN (${A}, ${B}) ORDER BY rowid`)
  } catch { /* table not loaded yet */ }
  const today = etToday()
  const daily = m.sport !== 'NFL'
  // every day of the matchup period (from the ySF schedule), played or not
  const dataDays = daily ? [...new Set(lines.map(l => l.date!).filter(Boolean))].sort() : []
  let days = dataDays
  const fkey = { NFL: 'ysf_fl', NHL: 'ysf_hl', NBA: 'ysf_ba', MLB: 'ysf_lb' }[m.sport as string]
  const pfeed = await siteFeed<any>(isCur ? `league_${fkey}.json` : `archives/${season}/${fkey}.json`)
  const pd = pfeed?.schedule_meta?.periods?.[String(period)] as { start: string; end: string } | undefined
  if (daily) {
    if (pd?.start && pd?.end) {
      days = []
      for (let d = new Date(pd.start + 'T12:00:00'); d <= new Date(pd.end + 'T12:00:00'); d.setDate(d.getDate() + 1)) days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    }
  }
  const final = (l: Line) => m.isComplete || (daily && !!l.date && l.date < today) || !!(l as any).live
  const sel = daily ? (day && days.includes(day) ? day : days.filter(d => d <= today).pop() ?? days[0]) : null
  // a day not played yet shows the latest lineup on record, without points
  const lineupDay = daily ? (dataDays.filter(d => d <= sel!).pop() ?? dataDays[dataDays.length - 1]) : null
  const upcoming = daily && !!sel && sel >= today && !m.isComplete
  // daily leagues: "Matchup" view = each player's totals for the period; points and stats count only
  // on days he started (so they add up to the matchup score); players who never started are listed below
  const isTotal = daily && day === 'total'
  const aggregate = (): Line[] => {
    const order = new Map(lines.filter(l => l.date === lineupDay).map((l, i) => [l.team_id + l.fx_player_id, i]))
    const by = new Map<string, Line[]>()
    for (const l of lines) { const k = l.team_id + l.fx_player_id; by.set(k, [...(by.get(k) ?? []), l]) }
    const out: (Line & { _o: number })[] = []
    for (const [k, ls] of by) {
      const act = ls.filter(l => l.status === '1'), use = (act.length ? act : ls).filter(l => final(l) && (l.opp || l.fpts))
      const sum: Record<string, number> = {}; let outs = 0
      for (const l of use) for (const [sk, v] of Object.entries(JSON.parse(l.stats || '{}') as Record<string, string>)) {
        if (sk === 'IP') { const [w, f] = String(v).split('.'); outs += Number(w) * 3 + Number(f || 0); continue }
        const x = Number(v); if (Number.isFinite(x)) sum[sk] = (sum[sk] ?? 0) + x
      }
      if (outs) sum.IP = Number(`${Math.floor(outs / 3)}.${outs % 3}`)
      const freq = (xs: string[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]?.[0]
      const last = ls[ls.length - 1], gp = ls.filter(l => l.opp || l.fpts).length
      out.push({ ...last, date: 'total', status: act.length ? '1' : freq(ls.map(l => l.status)) ?? last.status, slot: act.length ? freq(act.map(l => l.slot))! : last.slot,
        fpts: use.length ? +use.reduce((a, l) => a + (l.fpts ?? 0), 0).toFixed(2) : null, stats: JSON.stringify(Object.fromEntries(Object.entries(sum).map(([a, v]) => [a, String(+v.toFixed(2))]))),
        opp: `${gp} GP${act.length ? ` · ${act.filter(l => l.opp || l.fpts).length} started` : ''}`, live: true, _o: order.get(k) ?? 999 } as any)
    }
    return out.sort((a, b) => a._o - b._o)
  }
  const pickShown = () => isTotal ? aggregate() : daily ? lines.filter(l => l.date === lineupDay).map(l => upcoming && l.date !== sel ? { ...l, fpts: null, opp: null, stats: null, date: sel } : l) : lines
  let shown = pickShown()
  let span = season.replace('-', '–')
  if (daily && days.length) span = `${md(new Date(days[0] + 'T12:00:00'))}–${md(new Date(days[days.length - 1] + 'T12:00:00'), true)}`
  else if (!daily && isCur) { const { start } = weekDateRange(season, m.week); const s0 = new Date(start); s0.setDate(s0.getDate() + 3); const e0 = new Date(start); e0.setDate(e0.getDate() + 9); span = `${md(s0)}–${md(e0, true)}` }

  // real-game info per player: finals from box scores, live and upcoming from the schedule
  const sched = pd ? db.all<{ id: string; status: string | null; epoch: string | null }>(sql`SELECT id, status, game_time_epoch AS epoch FROM game_schedule WHERE sport = ${m.sport} AND game_date >= ${pd.start.replace(/-/g, '')} AND game_date <= ${pd.end.replace(/-/g, '')}`) : []
  // live games of the players on show: pull their box scores (score, period, clock)
  const shownTeams = new Set(lines.filter(l => !daily || l.date === lineupDay).map(l => l.pro_team && tankTeam(m.sport, l.pro_team)).filter(Boolean))
  const nowSec = Date.now() / 1000
  const liveIds = sched.filter(g => !/final|completed|postponed|cancel/i.test(g.status ?? '') && (/progress|live/i.test(g.status ?? '') || (g.epoch && Number(g.epoch) < nowSec)) && g.id.slice(9).split('@').some(t => shownTeams.has(t))).map(g => g.id)
  // hockey comes live from the NHL's own feed (scheduler, every 2 minutes); others from Tank01, at most once a minute per game
  if (m.sport !== 'NHL') await refreshLive(m.sport, liveIds)
  // the unfinished part of the period is scored by the app from live and final box scores
  if (!m.isComplete && pd) {
    const scoring = (JSON.parse(league.scoringSettings ?? '{}')[m.sport] ?? {}) as Record<string, number>
    const from = daily ? today : pd.start, to = daily ? today : pd.end
    const gl = loadGameLines(m.sport as Sport, from, to, scoring, true)
    const byTank = new Map<string, typeof gl>(); for (const g of gl) byTank.set(g.tankId, [...(byTank.get(g.tankId) ?? []), g])
    const ids = [...new Set(lines.map(l => l.fx_player_id))]
    const map = new Map<string, string>()
    try { for (const r of db.all<{ fx_id: string; tank_id: string }>(sql`SELECT fx_id, tank_id FROM player_id_map WHERE sport = ${m.sport}`)) map.set(r.fx_id, r.tank_id) } catch { /* not built yet */ }
    const dstOf = (l: Line) => l.fx_player_id.includes('#') && l.pro_team == null ? gl.filter(g => g.dstTeam && l.name.startsWith(g.team)) : null
    lines = lines.map(l => {
      if (daily ? l.date !== today : false) return l
      const mine = (map.get(l.fx_player_id) ? byTank.get(map.get(l.fx_player_id)!) : dstOf(l) ?? undefined) ?? []
      if (!mine.length) return daily ? { ...l, fpts: null, stats: null } : { ...l, fpts: null, stats: null }
      const stats: Record<string, number> = {}
      for (const g of mine) for (const [k, v] of Object.entries(g.stats)) stats[k] = (stats[k] ?? 0) + v
      return { ...l, fpts: +mine.reduce((a, g) => a + g.pts, 0).toFixed(2), stats: JSON.stringify(toFantraxStats(m.sport, stats)), opp: l.opp || 'live', live: true } as Line
    })
    void ids
    shown = pickShown()
  }
  const game = (l: Line) => {
    if (l.date === 'total') return l.opp
    const from = daily ? l.date ?? sel ?? '' : pd?.start ?? '', to = daily ? l.date ?? sel ?? '' : pd?.end ?? ''
    return (from && gameInfo(m.sport, l.pro_team, from, to, sched)) || (l.opp ? l.opp.replace(/<br\/>/g, ' ').replace(/ F$/, ' · Final') : null)
  }
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
  const rules = (JSON.parse(league.scoringSettings ?? '{}')[m.sport] ?? {}) as Record<string, any>
  // a player's points, with how they were calculated on hover (or tap)
  const Pts = ({ l }: { l: Line }) => {
    const b = breakdown(m.sport, l.slot, statsOf(l), rules)
    return (
      <span tabIndex={0} className="relative inline-block group cursor-help outline-none">
        {fmt(l.fpts ?? 0)}
        {b.lines.length > 0 && (
          <span className="pointer-events-none absolute z-30 left-1/2 -translate-x-1/2 top-full mt-1 hidden group-hover:block group-focus:block w-max max-w-[260px] rounded bg-black text-white text-left font-body text-[11px] font-normal leading-snug px-3 py-2 shadow-lg whitespace-pre-line">
            <span className="block ui text-[10px] tracking-[.1em] text-ink-200 mb-1">{l.name.toUpperCase()}</span>
            {b.lines.join('\n')}
            <span className="block border-t border-white/30 mt-1.5 pt-1 font-bold">= {fmt(l.fpts ?? 0)} pts</span>
          </span>
        )}
      </span>
    )
  }

  const Player = ({ l, right }: { l?: Line; right?: boolean }) => l ? (
    <span className={`min-w-0 flex flex-col ${right ? 'items-end text-right' : ''}`}>
      <span className="font-bold text-[14px] leading-tight">{l.name}</span>
      <span className="text-[11px] text-ink-500 leading-tight"><span className="ysf-case">({L.code}{l.pro_team ? `-${l.pro_team}` : ''}, {l.positions ?? l.slot})</span>{l.opp ? <span> · {l.opp.replace(/ F$/, '')}</span> : null}</span>
    </span>
  ) : <span className="text-ink-200 text-[13px]">Empty</span>
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
          <Link href={`${base}?day=total`} scroll={false} className={`flex-none flex flex-col items-center justify-center gap-1 min-w-[96px] h-[54px] px-3 rounded-lg border leading-none ${isTotal ? 'bg-black text-white border-black' : 'bg-white border-ink-100 hover:border-ink-400'}`}>
            <span className="font-display text-[13px] font-bold">MATCHUP</span>
            <span className={`text-[11px] tabular-nums ${isTotal ? 'text-ink-200' : 'text-ink-500'}`}>{fmt(m.homeScore ?? 0)} – {fmt(m.awayScore ?? 0)}</span>
          </Link>
          {days.map(d => { const on = !isTotal && d === sel; return (
            <Link key={d} href={`${base}?day=${d}`} scroll={false} className={`flex-none flex flex-col items-center justify-center gap-1 min-w-[96px] h-[54px] px-3 rounded-lg border leading-none ${on ? 'bg-black text-white border-black' : 'bg-white border-ink-100 hover:border-ink-400'}`}>
              <span className="font-display text-[13px] font-bold">{dayLabel(d).toUpperCase()}</span>
              <span className={`text-[11px] tabular-nums ${on ? 'text-ink-200' : 'text-ink-500'}`}>{(d < today || m.isComplete) && dataDays.includes(d) ? `${fmt(total(A, lines.filter(l => l.date === d)))} – ${fmt(total(B, lines.filter(l => l.date === d)))}` : d === today ? 'Today' : d < today ? '–' : 'Upcoming'}</span>
            </Link>) })}
        </div>
      )}

      {!lines.length ? (
        <div className="card p-8 text-center font-semibold text-ink-500">Lineups for this matchup haven’t been loaded yet</div>
      ) : (() => {
        // one module: both clubs side by side, each player's stat columns beside his points;
        // starters together in position order, then bench, IR and taxi; a header row wherever the stat type changes
        const n = maxCompact(m.sport)
        const groups = [{ s: '1', a: sa.act, b: sb.act }, ...['2', '3', '9'].map(g => ({ s: g, a: sa.groups.find(x => x.s === g)!.ls, b: sb.groups.find(x => x.s === g)!.ls }))].filter(g => g.a.length || g.b.length)
        const th = 'px-1 py-1.5 ui text-[10px] font-medium text-ink-500 whitespace-nowrap'
        const cell = (st: Record<string, string> | null, key: string, played: boolean) => { const v = played ? statCell(st, key) : ''; return <span className={v && v !== '0' ? '' : 'text-ink-200'}>{v === '' ? '–' : v}</span> }
        const PlayerCell = ({ l, right }: { l?: Line; right?: boolean }) => (
          <td className={`px-2 py-2 whitespace-nowrap ${right ? 'text-right' : ''}`}>{l ? <div className={`max-w-[30vw] sm:max-w-[20vw] md:max-w-[18vw] lg:max-w-[16vw] xl:max-w-[250px] ${right ? 'ml-auto' : ''}`}>
            <span className="block text-[13px] leading-tight whitespace-nowrap overflow-hidden text-ellipsis"><b>{l.name}</b> <span className="text-ink-500">| {l.pro_team ? `${l.pro_team}, ` : ''}{(l.positions ?? l.slot).replace(/,/g, '/')}</span></span>
            <span className="block text-[11px] text-ink-500 leading-tight mt-0.5 overflow-hidden text-ellipsis">{game(l) ?? '–'}</span>
          </div> : <span className="text-ink-200 text-[12px]">Empty</span>}</td>
        )
        // stat columns are numbered slots shown by width (2 on small tablets, 4 mid-size, all on desktop, none on phones) so nothing scrolls
        const vis = (p: number) => p < 2 ? 'hidden sm:table-cell' : p < 4 ? 'hidden md:table-cell' : 'hidden lg:table-cell'
        const slots = (f: (p: number) => React.ReactNode) => Array.from({ length: n }, (_, p) => f(p))
        const StatCells = ({ l, cols }: { l?: Line; cols: [string, string][]; right?: boolean }) => {
          const st = l ? statsOf(l) : null, played = !!l && !!(l.opp || l.fpts) && final(l)
          return <>{slots(p => <td key={p} className={`${vis(p)} px-1 py-2 text-right tabular-nums text-[11px]`}>{l && cols[p] ? cell(st, cols[p][1], played) : ''}</td>)}</>
        }
        const PtsCell = ({ l, starter }: { l?: Line; starter: boolean }) => (
          <td className={`px-2 py-2 text-center tabular-nums disp ${starter ? 'text-[18px] font-extrabold' : 'text-[15px] text-ink-500'}`}>{l && final(l) && l.fpts != null && (l.opp || l.fpts) ? <Pts l={l} /> : '–'}</td>
        )
        return (
          <>
          {/* phones: each club's lineup in turn; stat columns scroll sideways beside a fixed player column */}
          <div className="sm:hidden flex flex-col gap-4">
            {[{ tid: A, s: sa }, { tid: B, s: sb }].map(({ tid, s: sd }) => (
              <section key={tid} className="card overflow-hidden">
                <div className="flex items-center gap-2.5 px-3 py-2.5 border-b-2 border-black">
                  <span className="w-7 h-7 inline-flex items-center justify-center"><img src={C[tid]?.logo ?? ''} alt="" className="w-7 h-7 object-contain" /></span>
                  <span className="font-bold flex-1 min-w-0"><ClubName name={C[tid]?.name} /></span>
                  <span className="disp text-[22px] font-extrabold tabular-nums">{fmt(total(tid, shown))}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="border-collapse w-full">
                    <tbody>
                      {[{ g: '1', ls: sd.act }, ...sd.groups.map(x => ({ g: x.s, ls: x.ls }))].filter(x => x.ls.length).map(({ g, ls }) => {
                        let prev = ''
                        return [
                          <tr key={g} className="bg-ink-50"><td className="sticky left-0 z-10 bg-ink-50 px-3 py-1.5 ui text-[11px] font-bold tracking-[.12em]" colSpan={2}>{g === '1' ? 'STARTERS' : STATUS[g]}</td><td colSpan={12} /></tr>,
                          ...ls.flatMap(l => {
                            const st = statsOf(l), t = statType(m.sport, l.slot, st), played = !!(l.opp || l.fpts) && final(l), out = []
                            if (t.id !== prev) { out.push(<tr key={l.fx_player_id + 'h'} className="border-b border-ink-100"><th className="sticky left-0 z-10 bg-white px-3 py-1 ui text-[10px] font-medium text-ink-500 text-left shadow-[2px_0_0_#F2F2F2]">PLAYER</th><th className="px-2 py-1 ui text-[10px] font-medium text-ink-500 text-right">PTS</th>{t.cols.map(([lab]) => <th key={lab} className="px-2 py-1 ui text-[10px] font-medium text-ink-500 text-right whitespace-nowrap">{lab}</th>)}</tr>); prev = t.id }
                            out.push(<tr key={l.fx_player_id} className="border-b border-ink-50">
                              <td className="sticky left-0 z-10 bg-white px-3 py-2 whitespace-nowrap shadow-[2px_0_0_#F2F2F2]">
                                <div className="flex items-center gap-2 max-w-[48vw]">
                                  {g === '1' && <span className="inline-flex items-center justify-center h-5 min-w-[34px] px-1 rounded bg-ink-50 ui text-[9px] font-bold leading-none flex-none">{SLOT[l.slot] ?? l.slot}</span>}
                                  <span className="min-w-0">
                                    <span className="block text-[13px] leading-tight overflow-hidden text-ellipsis"><b>{l.name}</b> <span className="text-ink-500">| {l.pro_team ? `${l.pro_team}, ` : ''}{(l.positions ?? l.slot).replace(/,/g, '/')}</span></span>
                                    <span className="block text-[11px] text-ink-500 leading-tight overflow-hidden text-ellipsis">{game(l) ?? '–'}</span>
                                  </span>
                                </div>
                              </td>
                              <td className={`px-2 py-2 text-right tabular-nums disp ${g === '1' ? 'text-[16px] font-extrabold' : 'text-[14px] text-ink-500'}`}>{played && l.fpts != null ? <Pts l={l} /> : '–'}</td>
                              {t.cols.map(([lab, key]) => { const v = played ? statCell(st, key) : ''; return <td key={lab} className={`px-2 py-2 text-right tabular-nums text-[12px] ${v && v !== '0' ? '' : 'text-ink-200'}`}>{v === '' ? '–' : v}</td> })}
                            </tr>)
                            return out
                          }),
                        ]
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
          <section className="card overflow-hidden hidden sm:block">
            <div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-black">
                    <th className={`${th} text-left`}><span className="text-[12px] font-bold text-black"><ClubName name={C[A]?.name} /></span></th>{slots(p => <th key={'a' + p} className={vis(p)} />)}
                    <th className={th}>PTS</th>
                    <th className={th}>{isTotal ? 'MATCHUP' : daily && sel ? dayLabel(sel).toUpperCase() : ''}</th>
                    <th className={th}>PTS</th>
                    {slots(p => <th key={'b' + p} className={vis(p)} />)}<th className={`${th} text-right`}><span className="text-[12px] font-bold text-black"><ClubName name={C[B]?.name} /></span></th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(g => {
                    let prev = ''
                    const len = Math.max(g.a.length, g.b.length)
                    return [
                      g.s !== '1' && <tr key={g.s} className="bg-ink-50"><td colSpan={5 + 2 * n} className="px-3 py-1.5 ui text-[11px] font-bold tracking-[.12em] text-center">{STATUS[g.s]}</td></tr>,
                      ...Array.from({ length: len }, (_, i) => {
                        const a = g.a[i], b = g.b[i], ref = (a ?? b)!
                        const t = statType(m.sport, ref.slot, statsOf(ref)), cols = compactCols(t)
                        const out = []
                        if (t.id !== prev) {
                          const hs = (x: string) => slots(p => <th key={x + p} className={`${th} ${vis(p)} text-right`}>{cols[p]?.[0] ?? ''}</th>)
                          out.push(<tr key={g.s + i + 'h'} className="border-b border-ink-100"><th className={`${th} text-left`}>PLAYER</th>{hs('a')}<th /><th /><th />{hs('b')}<th className={`${th} text-right`}>PLAYER</th></tr>)
                          prev = t.id
                        }
                        out.push(
                          <tr key={g.s + i} className="border-b border-ink-50">
                            <PlayerCell l={a} /><StatCells l={a} cols={cols} /><PtsCell l={a} starter={g.s === '1'} />
                            <td className="px-1 py-2 text-center">{g.s === '1' && <span className="inline-flex items-center justify-center h-6 min-w-[40px] px-1 rounded bg-ink-50 ui text-[10px] font-bold leading-none">{SLOT[ref.slot] ?? ref.slot}</span>}</td>
                            <PtsCell l={b} starter={g.s === '1'} /><StatCells l={b} cols={cols} right /><PlayerCell l={b} right />
                          </tr>)
                        return out
                      }),
                      g.s === '1' && (
                        <tr key="tot" className="bg-ink-50 border-b-2 border-black">
                          <td className="px-3 py-2.5 ui text-[12px] font-bold">{isTotal ? 'MATCHUP TOTAL' : daily ? 'DAY TOTAL' : 'TOTAL'}</td>{slots(p => <td key={'ta' + p} className={vis(p)} />)}
                          <td className="px-2 text-center disp text-[22px] font-extrabold tabular-nums">{fmt(total(A, shown))}</td><td />
                          <td className="px-2 text-center disp text-[22px] font-extrabold tabular-nums">{fmt(total(B, shown))}</td>
                          {slots(p => <td key={'tb' + p} className={vis(p)} />)}<td className="px-3 py-2.5 ui text-[12px] font-bold text-right">{isTotal ? 'MATCHUP TOTAL' : daily ? 'DAY TOTAL' : 'TOTAL'}</td>
                        </tr>),
                    ]
                  })}
                </tbody>
              </table>
            </div>
          </section>
          </>
        )
      })()}
    </>
  )
}
