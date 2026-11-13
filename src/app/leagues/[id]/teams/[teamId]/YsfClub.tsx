// ySF Site Redesign — Club page: picker, club band, this week's matchups, and tabs
// (calendar, each league's roster, transactions, draft picks), from the Nexus database.
import Link from 'next/link'
import { db } from '@/db'
import { teams, users, leagueHistory, matchups, rosters, players, activity, draftPicks } from '@/db/schema'
import { and, eq, desc } from 'drizzle-orm'
import { loadStandings, periodLabel } from '@/lib/ysf-data'
import { weekDateRange } from '@/lib/defaults'
import { safeParse } from '@/lib/utils'
import { YSF_LEAGUES, YSF_ART, U } from '@/lib/ysf'
import { trophyName, trophyArt } from '@/lib/ysf-trophies'
import ClubTabs, { type ClubTabsData } from './ClubTabs'

const pct = (x: number) => (x * 100 >= 99.95 ? '>99.9' : x > 0 && x < 0.001 ? '<0.1' : (x * 100).toFixed(1)) + '%'
const SLOT_ORDER: Record<string, string[]> = {
  NFL: ['QB', 'RB', 'WR', 'TE', 'RB/WR/TE', 'K', 'DEF'], NHL: ['C', 'LW', 'RW', 'D', 'UTIL', 'G'],
  NBA: ['PG', 'SG', 'SF', 'PF', 'C', 'UTIL'], MLB: ['C', '1B', '2B', '3B', 'SS', 'OF', 'UTIL', 'SP', 'RP'],
}
const SLOT_LABEL: Record<string, string> = { 'RB/WR/TE': 'FLEX', DEF: 'D/ST' }

export default async function YsfClub({ league, teamId }: { league: any; teamId: string }) {
  const s = await loadStandings(league)
  const C = s.clubs, club = C[teamId]
  if (!club) return <div className="card p-8 text-center font-semibold text-ink-500">Club not found</div>
  const [own] = await db.select({ owner: users.name }).from(teams).leftJoin(users, eq(teams.userId, users.id)).where(eq(teams.id, teamId)).limit(1)
  const cupRow = s.cup.find(r => r.teamId === teamId)!
  const trophies = (await db.select().from(leagueHistory).where(and(eq(leagueHistory.leagueId, league.id), eq(leagueHistory.championTeamId, teamId))))
  const sportAbbr = safeParse<Record<string, string>>(league.sportAbbr, {})
  const code = (sp: string) => sportAbbr[sp] || sp

  // matchups: this week's card per league + the season calendar
  const ms = (await db.select().from(matchups).where(and(eq(matchups.leagueId, league.id), eq(matchups.season, league.season))))
    .filter(m => m.homeTeamId === teamId || m.awayTeamId === teamId)
  const cur: Record<string, number> = {}
  for (const L of YSF_LEAGUES) { const inc = ms.filter(m => m.sport === L.sport && !m.isComplete).map(m => m.week); if (inc.length) cur[L.sport] = Math.min(...inc) }
  const now = Date.now()
  const side = (m: typeof ms[number]) => {
    const home = m.homeTeamId === teamId, opp = home ? m.awayTeamId : m.homeTeamId
    return { opp: opp ?? '', home, me: (home ? m.homeScore : m.awayScore) ?? 0, them: (home ? m.awayScore : m.homeScore) ?? 0 }
  }
  const thisWeek = YSF_LEAGUES.filter(L => cur[L.sport] != null).map(L => {
    const m = ms.find(x => x.sport === L.sport && x.week === cur[L.sport])!
    const sd = side(m), started = weekDateRange(league.season, m.week).start.getTime() <= now && (sd.me || sd.them)
    return { sport: L.sport, label: periodLabel(league, L.sport, m.week), matchupId: m.id, oppAb: C[sd.opp]?.abbreviation ?? '', oppLogo: C[sd.opp]?.logo ?? null,
      me: started ? sd.me : null, them: started ? sd.them : null, status: !started ? 'Not started' : sd.me > sd.them ? 'Leading' : sd.me < sd.them ? 'Trailing' : 'Tied' }
  })
  const weeks = [...new Set(ms.map(m => m.week))].sort((a, b) => a - b)
  const calendar = {
    cols: weeks.map(w => { const { start, end } = weekDateRange(league.season, w); const f = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); return { w, label: `${f(start)}–${start.getMonth() === end.getMonth() ? end.getDate() : f(end)}, ${end.getFullYear()}`, current: Object.values(cur).includes(w) } }),
    rows: YSF_LEAGUES.map(L => ({ sport: L.sport, cells: weeks.map(w => {
      const m = ms.find(x => x.sport === L.sport && x.week === w)
      if (!m) return null
      const sd = side(m)
      return { matchupId: m.id, label: periodLabel(league, L.sport, w).replace('Week ', 'WK ').replace('Period ', 'P'), opp: `${sd.home ? '' : '@'}${C[sd.opp]?.abbreviation ?? 'TBD'}`,
        result: m.isComplete ? `${sd.me > sd.them ? 'W' : sd.me < sd.them ? 'L' : 'T'} ${sd.me.toFixed(1)}–${sd.them.toFixed(1)}` : (sd.me || sd.them) ? `${sd.me.toFixed(1)}–${sd.them.toFixed(1)}` : '',
        tone: (m.isComplete ? (sd.me > sd.them ? 'win' : sd.me < sd.them ? 'loss' : 'tie') : cur[L.sport] === w ? 'live' : 'future') as 'win' | 'loss' | 'tie' | 'live' | 'future', playoff: !!m.isPlayoff }
    }) })),
  }

  // rosters by league, grouped fantasy-app style
  const ro = await db.select({ slot: rosters.slot, sport: rosters.sport, name: players.name, position: players.position, eligible: players.eligiblePositions, team: players.realTeamAbbr })
    .from(rosters).innerJoin(players, eq(rosters.playerId, players.id)).where(eq(rosters.teamId, teamId))
  const rosterBy: ClubTabsData['rosters'] = {}
  for (const L of YSF_LEAGUES) {
    const mine = ro.filter(r => r.sport === L.sport)
    const posOf = (r: typeof mine[number]) => { const e = safeParse<string[]>(r.eligible, []); return (e.length > 1 ? e : [r.position]).join('/').replace(/\bDEF\b/g, 'D/ST') }
    const row = (r: typeof mine[number], slot: string) => ({ slot, name: r.name, meta: `(${code(L.sport)}-${r.team || 'FA'}, ${posOf(r)})` })
    const order = SLOT_ORDER[L.sport] ?? []
    const starters = mine.filter(r => !['BN', 'IR', 'TAXI'].includes(r.slot)).sort((a, b) => (order.indexOf(a.slot) + 99) % 99 - (order.indexOf(b.slot) + 99) % 99)
    rosterBy[L.sport] = [
      { label: 'STARTERS', rows: starters.map(r => row(r, SLOT_LABEL[r.slot] ?? r.slot)) },
      { label: 'BENCH', rows: mine.filter(r => r.slot === 'BN').map(r => row(r, 'BN')) },
      { label: 'INJURED RESERVE', rows: mine.filter(r => r.slot === 'IR').map(r => row(r, 'IR')) },
      { label: 'TAXI SQUAD', rows: mine.filter(r => r.slot === 'TAXI').map(r => row(r, 'TAXI')) },
    ].filter(g => g.rows.length)
  }

  // transactions + picks
  const moves = (await db.select().from(activity).where(and(eq(activity.leagueId, league.id), eq(activity.teamId, teamId))).orderBy(desc(activity.createdAt)).limit(200))
    .filter(a => a.message && !/lineup_change/i.test(a.message)).map(a => ({ when: a.createdAt ?? '', type: a.type ?? '', text: a.message! }))
  const pickRows = await db.select().from(draftPicks).where(and(eq(draftPicks.leagueId, league.id), eq(draftPicks.currentTeamId, teamId), eq(draftPicks.isUsed, false)))
  const picks = pickRows.sort((a, b) => a.year - b.year || (a.sport ?? '').localeCompare(b.sport ?? '') || a.round - b.round)
    .map(p => ({ year: p.year, sport: p.sport ?? '', code: p.sport ? code(p.sport) : 'Federation', round: p.round, via: p.originalTeamId !== teamId ? C[p.originalTeamId]?.abbreviation ?? null : null }))

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {s.cup.map(r => r.teamId).sort((a, b) => C[a].name.localeCompare(C[b].name)).map(id => {
          const c = C[id], on = id === teamId
          return (
            <Link key={id} href={`/leagues/${league.id}/teams/${id}`} className="inline-flex items-center gap-2 h-10 pl-2 pr-3 rounded border-2 font-display text-[13px] font-bold tracking-[.06em] leading-none"
              style={{ borderColor: c.color ?? '#000', background: on ? c.color ?? '#000' : '#fff', color: on ? '#fff' : '#000' }}>
              <span className="w-6 h-6 inline-flex items-center justify-center"><img src={(on ? c.altLogo || c.logo : c.logo)!} alt="" className="w-6 h-6 object-contain" /></span>{c.abbreviation}
            </Link>
          )
        })}
      </div>

      <section className="rounded p-6 sm:p-7 text-white flex flex-wrap items-center gap-6" style={{ background: club.color ?? '#000' }}>
        <span className="w-28 h-28 sm:w-36 sm:h-36 inline-flex items-center justify-center flex-none"><img src={(club.altLogo || club.logo)!} alt={club.name} className="w-full h-full object-contain" /></span>
        <div className="min-w-0 flex-1">
          <div className="ui text-[13px] tracking-[.16em] opacity-90">{U(`${own?.owner ?? ''} · ${club.abbreviation} · est. 2025–26`)}</div>
          <h1 className="disp text-[44px] sm:text-[72px] font-extrabold leading-[.85] mt-1">{U(club.name)}</h1>
          <div className="flex flex-wrap gap-2 mt-4">
            {[['CUP RANK', cupRow.rk], ['CUP PTS', cupRow.pts], ['RECORD', cupRow.rec], ['CUP %', pct(cupRow.cupPct)]].map(([k, v]) => (
              <div key={k as string} className="bg-white text-black rounded px-3 py-2 min-w-[96px]"><div className="ui text-[10px] font-bold tracking-[.1em]">{k}</div><div className="disp text-[26px] font-extrabold leading-none mt-0.5">{v}</div></div>
            ))}
          </div>
        </div>
        {trophies.length > 0 && (
          <div className="flex flex-col items-end gap-2">
            <div className="ui text-[12px] tracking-[.14em] opacity-90">TROPHY CASE</div>
            {trophies.map(t => <span key={t.id} className="inline-flex items-center gap-2 bg-black/20 rounded px-3 py-2 font-bold text-[14px]"><img src={trophyArt(t.scope, t.season)} alt="" className="w-6 h-6 object-contain" />{trophyName(t.scope, t.season)} champion</span>)}
          </div>
        )}
      </section>

      {thisWeek.length > 0 && (
        <section className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {thisWeek.map(w => {
            const L = YSF_LEAGUES.find(l => l.sport === w.sport)!
            return (
              <Link key={w.sport} href={`/leagues/${league.id}/matchup/${w.matchupId}`} className="card p-4 hover:bg-ink-50" style={{ borderTop: `4px solid ${L.color}` }}>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-2 font-bold"><img src={YSF_ART.leagueSymbol(L.key, 'white')} alt="" className="w-6 h-6 object-contain" /><span className="ysf-case">{L.code}</span> · {w.label}</span>
                  <span className="text-ink-500">{w.status}</span>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="disp text-[32px] font-extrabold tabular-nums">{w.me == null ? '—' : w.me.toLocaleString('en-US', { maximumFractionDigits: 1 })}</span>
                  <span className="flex items-center gap-1.5 text-[12px] text-ink-500">vs {w.oppLogo && <img src={w.oppLogo} alt="" className="w-6 h-6 object-contain" />}<b className="text-black">{w.oppAb}</b></span>
                  <span className="disp text-[32px] font-medium tabular-nums">{w.them == null ? '—' : w.them.toLocaleString('en-US', { maximumFractionDigits: 1 })}</span>
                </div>
              </Link>
            )
          })}
        </section>
      )}

      <ClubTabs data={{ leagueId: league.id, calendar, rosters: rosterBy, moves, picks, codes: Object.fromEntries(YSF_LEAGUES.map(l => [l.sport, code(l.sport)])) }} />
    </>
  )
}
