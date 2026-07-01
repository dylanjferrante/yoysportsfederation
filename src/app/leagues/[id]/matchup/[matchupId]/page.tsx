import { db } from '@/db'
import { leagues, teams, matchups, rosters, players, playerGameStats } from '@/db/schema'
import { eq, and, or, ne } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { sportMeta, safeParse } from '@/lib/utils'
import { sportWeekOf, type ScheduleEntry } from '@/lib/defaults'
import { RESERVE_SLOTS } from '@/lib/defaults'
import { boxScoreColumns } from '@/lib/scoring-categories'
import { weekGameStatus, type GameStatus } from '@/lib/schedule'
import { playerKickoff } from '@/lib/locks'
import { oppLabel } from '@/lib/realschedule'
import { weekDates, teamDayLineups } from '@/lib/dailylineup'
import MatchupChat from './MatchupChat'
import BoxScores from './BoxScores'

const isStarter = (slot: string) => !RESERVE_SLOTS.includes(slot)

const FINAL_RE = /final|completed|closed/i
const LIVE_RE = /in.?progress|live|q[1-4]\b|\bhalf\b|inning|period|\bot\b|delay|active|top\b|bot\b|\bmid\b|\bend\b/i
type Bucket = 'final' | 'live' | 'pending'
function gameBucket(points: number | null, gs: { kickoff: number | null; status: string | null }, now: number): Bucket {
  if (points != null) return 'final'
  if (gs.status && FINAL_RE.test(gs.status)) return 'final'
  if (gs.status && LIVE_RE.test(gs.status)) return 'live'
  if (gs.kickoff != null && now >= gs.kickoff) return 'live'
  return 'pending'
}
function gameLabel(bucket: Bucket, gs: { kickoff: number | null; status: string | null }): string {
  if (bucket === 'final') return 'Final'
  if (bucket === 'live') return gs.status && !FINAL_RE.test(gs.status) ? gs.status : 'In progress'
  if (gs.kickoff != null) return new Date(gs.kickoff).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  return 'Scheduled'
}

export default async function MatchupPage({ params }: { params: Promise<{ id: string; matchupId: string }> }) {
  const { id, matchupId } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  const [m] = await db.select().from(matchups).where(eq(matchups.id, matchupId)).limit(1)
  if (!league || !m) notFound()
  const meta = sportMeta(m.sport)
  const cols = boxScoreColumns(m.sport)

  const season = m.season ?? league.season
  const now = Date.now()
  const ymd = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  const todayStr = ymd(now)
  const statusMap = await weekGameStatus(m.sport, season, m.week)

  async function lineup(teamId: string | null) {
    if (!teamId) return { team: null, starters: [] as any[], bench: [] as any[], proj: 0, optimal: 0, benchPts: 0, final: 0, live: 0, pending: 0, ptsIn: 0, projLeft: 0 }
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1)
    const rows = await db
      .select({ slot: rosters.slot, name: players.name, position: players.position, realTeam: players.realTeam, realTeamAbbr: players.realTeamAbbr, playerId: players.id, projected: players.projectedPoints, points: playerGameStats.points, stats: playerGameStats.stats })
      .from(rosters).innerJoin(players, eq(rosters.playerId, players.id))
      .leftJoin(playerGameStats, and(eq(playerGameStats.playerId, rosters.playerId), eq(playerGameStats.leagueId, id), eq(playerGameStats.season, season), eq(playerGameStats.week, m.week)))
      .where(and(eq(rosters.teamId, teamId), eq(rosters.sport, m.sport)))
    for (const r of rows as any[]) {
      const gs: GameStatus | undefined = r.realTeamAbbr ? statusMap?.[r.realTeamAbbr] : undefined
      const kickoff = gs?.kickoff ?? playerKickoff(m.sport, r.realTeamAbbr, season, m.week)
      const eff = { kickoff, status: gs?.status ?? null }
      const bucket: Bucket = m.isComplete ? 'final' : gameBucket(r.points, eff, now)
      r.game = { bucket, label: gameLabel(bucket, eff), opp: gs ? oppLabel(gs) : null }
      r.gameDate = eff.kickoff != null ? ymd(eff.kickoff) : null
      r.isToday = r.gameDate === todayStr
    }
    const starters = rows.filter(r => isStarter(r.slot)).sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    const bench = rows.filter(r => !isStarter(r.slot)).sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    const proj = +starters.reduce((s, r) => s + (r.projected ?? 0), 0).toFixed(1)
    const benchPts = +bench.reduce((s, r) => s + (r.points ?? 0), 0).toFixed(1)
    const optimal = +[...rows].map(r => r.points ?? 0).sort((a, b) => b - a).slice(0, starters.length).reduce((s, v) => s + v, 0).toFixed(1)
    const final = starters.filter((r: any) => r.game.bucket === 'final').length
    const live = starters.filter((r: any) => r.game.bucket === 'live').length
    const pending = starters.filter((r: any) => r.game.bucket === 'pending').length
    const ptsIn = +starters.reduce((s, r) => s + (r.points ?? 0), 0).toFixed(1)
    const projLeft = +starters.filter((r: any) => r.game.bucket !== 'final').reduce((s, r) => s + (r.projected ?? 0), 0).toFixed(1)
    return { team, starters, bench, proj, optimal, benchPts, final, live, pending, ptsIn, projLeft }
  }

  const home = await lineup(m.homeTeamId)
  const away = await lineup(m.awayTeamId)

  // Daily sports: the week's dates and each club's per-day lineup overrides so
  // the box score can be stepped through day by day.
  const isDaily = m.sport !== 'NFL'
  const weekDaysList = isDaily ? weekDates(season, m.week) : []
  const homeOverrides = isDaily && m.homeTeamId ? await teamDayLineups(id, m.homeTeamId, season, m.sport, weekDaysList) : {}
  const awayOverrides = isDaily && m.awayTeamId ? await teamDayLineups(id, m.awayTeamId, season, m.sport, weekDaysList) : {}
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const weekDays = weekDaysList.map(d => { const dt = new Date(`${d}T00:00:00`); return { date: d, label: `${WD[dt.getDay()]} ${dt.getMonth() + 1}/${dt.getDate()}` } })

  const spread = (home.proj || 0) - (away.proj || 0)
  const scale = Math.max(10, ((home.proj || 0) + (away.proj || 0)) * 0.06)
  const homeWinPct = Math.round(100 / (1 + Math.exp(-spread / scale)))

  let h2h: { homeW: number; awayW: number; recent: { week: number; season: string | null; hs: number; as: number; homeIsThis: boolean }[] } | null = null
  if (m.homeTeamId && m.awayTeamId) {
    const a = m.homeTeamId, b = m.awayTeamId
    const past = await db.select().from(matchups).where(and(
      eq(matchups.leagueId, id), eq(matchups.sport, m.sport), eq(matchups.isComplete, true), ne(matchups.id, m.id),
      or(and(eq(matchups.homeTeamId, a), eq(matchups.awayTeamId, b)), and(eq(matchups.homeTeamId, b), eq(matchups.awayTeamId, a))),
    ))
    let homeW = 0, awayW = 0
    for (const g of past) {
      const aScore = g.homeTeamId === a ? (g.homeScore ?? 0) : (g.awayScore ?? 0)
      const bScore = g.homeTeamId === a ? (g.awayScore ?? 0) : (g.homeScore ?? 0)
      if (aScore > bScore) homeW++; else if (bScore > aScore) awayW++
    }
    const recent = past
      .sort((x, y) => (y.season ?? '').localeCompare(x.season ?? '') || y.week - x.week)
      .slice(0, 5)
      .map(g => ({ week: g.week, season: g.season, hs: g.homeTeamId === a ? (g.homeScore ?? 0) : (g.awayScore ?? 0), as: g.homeTeamId === a ? (g.awayScore ?? 0) : (g.homeScore ?? 0), homeIsThis: true }))
    h2h = { homeW, awayW, recent }
  }

  const toPL = (p: any) => {
    const stats = safeParse<Record<string, number>>(p.stats ?? '{}', {})
    return {
      slot: p.slot, name: p.name, position: p.position, playerId: p.playerId,
      projected: +(p.projected ?? 0).toFixed(1),
      points: p.points == null ? null : +p.points.toFixed(1),
      colVals: cols.map(c => p.points == null ? null : (+c.get(stats).toFixed(1) || 0)),
      gameDate: p.gameDate ?? null, gameLabel: p.game?.label ?? null, gameBucket: p.game?.bucket ?? null,
    }
  }
  const sideLite = (side: any, overrides: Record<string, Record<string, string>>) => ({
    team: side.team ? { name: side.team.name, abbreviation: side.team.abbreviation, logo: side.team.logo, altLogo: side.team.altLogo, primaryColor: side.team.primaryColor, secondaryColor: side.team.secondaryColor, logoBg: !!side.team.logoBg } : null,
    starters: side.starters.map(toPL), bench: side.bench.slice(0, 12).map(toPL), dayOverrides: overrides,
  })

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-3">
        <Link href={`/leagues/${id}/scores`} className="btn-ghost text-slate-500">← Scores</Link>
        {(() => {
          const sw = sportWeekOf(safeParse<ScheduleEntry[]>(league.sportSchedule, []), m.sport, m.week)
          return (
            <p className="text-sm font-semibold text-slate-700">
              {m.sport} · {sw ? `Week ${sw}` : `Week ${m.week}`}
              <span className="font-normal text-slate-400"> · {league.name} · {m.isComplete ? 'Final' : 'Live'}</span>
            </p>
          )
        })()}
      </div>

      {/* Compact header — logos, scores, win prob and key numbers in one card */}
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <TeamLogo team={home.team} size={42} />
            <div className="min-w-0">
              <p className="font-bold text-slate-900 truncate">{home.team?.name ?? 'BYE'}</p>
              <p className="text-[11px] text-slate-400 tabular-nums">proj {home.proj.toFixed(1)} · {home.final}✓{home.live ? <span className="text-red-500"> · {home.live} live</span> : null}{home.pending ? ` · ${home.pending} left` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <span className="text-3xl font-black tabular-nums" style={{ color: meta.hex }}>{(m.homeScore ?? 0).toFixed(1)}</span>
            <span className="text-[11px] font-bold text-slate-300">{m.isComplete ? 'FINAL' : 'VS'}</span>
            <span className="text-3xl font-black tabular-nums" style={{ color: meta.hex }}>{(m.awayScore ?? 0).toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-end text-right">
            <div className="min-w-0">
              <p className="font-bold text-slate-900 truncate">{away.team?.name ?? 'BYE'}</p>
              <p className="text-[11px] text-slate-400 tabular-nums">proj {away.proj.toFixed(1)} · {away.final}✓{away.live ? <span className="text-red-500"> · {away.live} live</span> : null}{away.pending ? ` · ${away.pending} left` : ''}</p>
            </div>
            <TeamLogo team={away.team} size={42} />
          </div>
        </div>

        <div className="mt-3 h-1.5 rounded-full overflow-hidden bg-slate-100 flex">
          <div style={{ width: `${homeWinPct}%`, background: meta.hex }} />
          <div style={{ width: `${100 - homeWinPct}%` }} className="bg-slate-300" />
        </div>

        <div className="mt-2 flex items-center justify-center flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500">
          <span><b className="text-slate-700 tabular-nums">{home.optimal.toFixed(1)}</b> Optimal <b className="text-slate-700 tabular-nums">{away.optimal.toFixed(1)}</b></span>
          <span><b className="text-slate-700 tabular-nums">{home.benchPts.toFixed(1)}</b> Bench <b className="text-slate-700 tabular-nums">{away.benchPts.toFixed(1)}</b></span>
          {h2h && (h2h.homeW + h2h.awayW > 0) && <span><b className="text-slate-700 tabular-nums">{h2h.homeW}</b> Series <b className="text-slate-700 tabular-nums">{h2h.awayW}</b></span>}
        </div>
      </div>

      {/* Box scores — up front, no scrolling past hero cards */}
      <BoxScores home={sideLite(home, homeOverrides)} away={sideLite(away, awayOverrides)} cols={cols.map(c => c.label)} accent={meta.hex}
        weekScore={{ home: m.homeScore ?? 0, away: m.awayScore ?? 0 }} weekDays={weekDays} today={todayStr} />

      {h2h && h2h.recent.length > 0 && (
        <details className="card mt-5">
          <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none">
            <span className="font-semibold text-slate-900">All-Time Series</span>
            <span className="text-sm font-bold tabular-nums text-slate-700">{h2h.homeW}<span className="text-slate-300"> – </span>{h2h.awayW}</span>
          </summary>
          <div className="flex gap-2 flex-wrap px-4 pb-4">
            {h2h.recent.map((g, i) => {
              const homeWon = g.hs > g.as
              return (
                <div key={i} className="text-xs rounded-lg border border-slate-100 px-2.5 py-1.5">
                  <span className="text-slate-400">{g.season} Wk{g.week}</span>
                  <span className="ml-2 font-semibold tabular-nums" style={{ color: homeWon ? meta.hex : undefined }}>{g.hs.toFixed(0)}</span>
                  <span className="text-slate-300">–</span>
                  <span className="font-semibold tabular-nums" style={{ color: !homeWon ? meta.hex : undefined }}>{g.as.toFixed(0)}</span>
                </div>
              )
            })}
          </div>
        </details>
      )}

      {home.team && away.team && <MatchupChat leagueId={id} matchupId={matchupId} accent={meta.hex} />}
    </div>
  )
}

function TeamLogo({ team, size }: { team: any; size: number }) {
  if (!team) return <span className="rounded-lg bg-slate-100 flex-shrink-0" style={{ width: size, height: size }} />
  const primary = team.primaryColor || '#0f172a'
  const secondary = team.secondaryColor || '#ffffff'
  const src = team.altLogo || team.logo
  return src
    ? <span className="rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ width: size, height: size, background: team.logoBg ? primary : '#f1f5f9' }}><img src={src} alt="" style={{ width: '80%', height: '80%', objectFit: 'contain' }} /></span>
    : <span className="rounded-lg flex items-center justify-center flex-shrink-0 font-bold" style={{ width: size, height: size, background: primary, color: secondary, fontSize: Math.round(size * 0.34) }}>{(team.abbreviation || team.name || '?').slice(0, 3).toUpperCase()}</span>
}
