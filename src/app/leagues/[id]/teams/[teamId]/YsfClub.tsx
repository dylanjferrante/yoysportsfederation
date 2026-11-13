// ySF Site Redesign — Club page (the canvas's Club board): club picker, club band with trophy case,
// this week's matchups, and tabs — calendar; each league (season switcher, standing, roster, future
// draft picks, schedule); drafts; moves; head-to-head — from the app's database.
import Link from 'next/link'
import { db } from '@/db'
import { teams, users, leagueHistory, matchups, rosters, players, draftPicks, teamRecords } from '@/db/schema'
import { and, eq, or } from 'drizzle-orm'
import { loadStandings, periodLabel, loadMoves, pastSeasonWeeks } from '@/lib/ysf-data'
import { weekDateRange } from '@/lib/defaults'
import { safeParse } from '@/lib/utils'
import { YSF_LEAGUES, YSF_ART, U } from '@/lib/ysf'
import { trophyName, trophyArt } from '@/lib/ysf-trophies'
import ClubTabs, { type ClubTabsData, type LeagueSeason } from './ClubTabs'

const pct = (x: number) => (x * 100 >= 99.95 ? '>99.9' : x > 0 && x < 0.001 ? '<0.1' : (x * 100).toFixed(1)) + '%'
const ord = (n: number) => `${n}${['TH', 'ST', 'ND', 'RD'][(n % 100 >= 11 && n % 100 <= 13) ? 0 : Math.min(n % 10, 4) % 4] ?? 'TH'}`
const SLOT_ORDER: Record<string, string[]> = {
  NFL: ['QB', 'RB', 'WR', 'TE', 'RB/WR/TE', 'K', 'DEF'], NHL: ['C', 'LW', 'RW', 'D', 'UTIL', 'G'],
  NBA: ['PG', 'SG', 'SF', 'PF', 'C', 'UTIL'], MLB: ['C', '1B', '2B', '3B', 'SS', 'OF', 'UTIL', 'SP', 'RP'],
}
const SLOT_LABEL: Record<string, string> = { 'RB/WR/TE': 'FLEX', DEF: 'D/ST' }
const fmtD = (d: Date, y = false) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(y ? { year: 'numeric' } : {}) })
const span = (a: Date, b: Date) => `${fmtD(a)}–${a.getMonth() === b.getMonth() ? b.getDate() : fmtD(b)}, ${b.getFullYear()}`
const dst = (x: string) => x.replace(/\bDEF\b/g, 'D/ST')
const n1 = (x: number) => x.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// `own` (the signed-in member's club): the lineup, add / drop, trade and pending tools join the club
// tabs — so My Club and your club's page are the same page.
export default async function YsfClub({ league, teamId, own = false }: { league: any; teamId: string; own?: boolean }) {
  const s = await loadStandings(league)
  const C = s.clubs, club = C[teamId]
  if (!club) return <div className="card p-8 text-center font-semibold text-ink-500">Club not found</div>
  const [ownerRow] = await db.select({ owner: users.name }).from(teams).leftJoin(users, eq(teams.userId, users.id)).where(eq(teams.id, teamId)).limit(1)
  const cupRow = s.cup.find(r => r.teamId === teamId)!
  const history = await db.select().from(leagueHistory).where(eq(leagueHistory.leagueId, league.id))
  const trophies = history.filter(h => h.championTeamId === teamId)
  const code = (sp: string) => YSF_LEAGUES.find(l => l.sport === sp)?.code ?? sp
  const label = (sp: string, name: string, team: string | null, pos: string) => `${name} (${code(sp)}-${team || 'FA'}, ${pos.replace(/\bDEF\b/g, 'D/ST')})`

  // every matchup in every season, all clubs (standings for past seasons, head-to-head)
  const all = await db.select().from(matchups).where(eq(matchups.leagueId, league.id))
  const ms = all.filter(m => m.homeTeamId === teamId || m.awayTeamId === teamId)
  const side = (m: typeof all[number], id = teamId) => {
    const home = m.homeTeamId === id, opp = home ? m.awayTeamId : m.homeTeamId
    return { opp: opp ?? '', home, me: (home ? m.homeScore : m.awayScore) ?? 0, them: (home ? m.awayScore : m.homeScore) ?? 0 }
  }
  const cur: Record<string, number> = {}
  for (const L of YSF_LEAGUES) { const inc = ms.filter(m => m.season === league.season && m.sport === L.sport && !m.isComplete).map(m => m.week); if (inc.length) cur[L.sport] = Math.min(...inc) }
  const now = Date.now()

  // this week, one card per league
  const thisWeek = YSF_LEAGUES.filter(L => cur[L.sport] != null).map(L => {
    const m = ms.find(x => x.season === league.season && x.sport === L.sport && x.week === cur[L.sport])!
    const sd = side(m), started = weekDateRange(league.season, m.week).start.getTime() <= now && (sd.me || sd.them)
    return { sport: L.sport, label: periodLabel(league, L.sport, m.week), matchupId: m.id, oppAb: C[sd.opp]?.abbreviation ?? '', oppLogo: C[sd.opp]?.logo ?? null,
      me: started ? sd.me : null, them: started ? sd.them : null, status: !started ? 'Not started' : sd.me > sd.them ? 'Leading' : sd.me < sd.them ? 'Trailing' : 'Tied' }
  })

  // calendar: every matchup this club has ever played, oldest first, one column per calendar week.
  // Where seasons overlap (late-summer baseball and early-season football) both seasons' matchups
  // share that week's column; the header marks the week each season starts. A matchup that runs
  // several weeks spans every week it covers.
  const allSeasons = [...new Set(ms.map(m => m.season ?? ''))].filter(Boolean).sort()
  type Ev = { m: typeof ms[number]; season: string; days: number[]; label: string; live: boolean }
  const evs: Ev[] = []
  const dayKey = (d: Date) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
  const seasonStartDay: Record<string, number> = {}
  const curDays = new Set<number>()
  for (const season of allSeasons) {
    const live = season === league.season
    const sm = ms.filter(m => m.season === season)
    const pw = live ? null : await pastSeasonWeeks(season)
    // the federation weeks each matchup covers (this season stores weeks directly; past seasons store periods)
    const covers = (m: typeof sm[number]) => live ? [m.week] : (pw!.periodWeeks[m.sport ?? '']?.[m.week] ?? [])
    const firstWk: Record<string, number> = {}
    for (const L of YSF_LEAGUES) { const lw = sm.filter(m => m.sport === L.sport).map(m => m.week); if (lw.length) firstWk[L.sport] = Math.min(...lw) }
    for (const m of sm) {
      const days = covers(m).map(w => dayKey(weekDateRange(season, w).start))
      if (!days.length) continue
      const lab = live ? periodLabel(league, m.sport ?? '', m.week) : `${m.sport === 'NFL' ? 'Week' : 'Period'} ${m.week - (firstWk[m.sport ?? ''] ?? 1) + 1}`
      evs.push({ m, season, days, label: lab.replace('Week ', 'WK ').replace('Period ', 'P'), live })
      seasonStartDay[season] = Math.min(seasonStartDay[season] ?? Infinity, ...days)
      if (live && cur[m.sport ?? ''] === m.week) days.forEach(d => curDays.add(d))
    }
  }
  // each season's playoff rounds. A game between two clubs that both lost their last playoff game is a
  // consolation game: after a first-round loss it is for 5th place, after a semifinal loss for 3rd. In
  // the last playoff week, the game between the two semifinal winners is the championship.
  const round = new Map<string, 'final' | 'third' | 'fifth'>()
  for (const season of allSeasons) for (const L of YSF_LEAGUES) {
    const po = all.filter(m => m.season === season && m.sport === L.sport && m.isPlayoff && m.awayTeamId)
    const wks = [...new Set(po.map(m => m.week))].sort((a, b) => a - b)
    if (wks.length < 2) continue
    const lostIn = new Map<string, number>() // club → the playoff round (0 = first) it was knocked out in
    wks.forEach((w, r) => {
      for (const m of po.filter(x => x.week === w)) {
        const both = [m.homeTeamId, m.awayTeamId!]
        if (both.every(t => lostIn.has(t))) {
          // consolation: decided by the round they went out in (the later of the two)
          const out = Math.max(...both.map(t => lostIn.get(t)!))
          round.set(m.id, out >= wks.length - 2 ? 'third' : 'fifth')
          continue
        }
        if (r === wks.length - 1) round.set(m.id, 'final')
        if (m.isComplete) { const loser = (m.homeScore ?? 0) >= (m.awayScore ?? 0) ? m.awayTeamId! : m.homeTeamId; if (!lostIn.has(loser)) lostIn.set(loser, r) }
      }
    })
  }
  const days = [...new Set(evs.flatMap(e => e.days))].sort((a, b) => a - b)
  const col = new Map(days.map((d, i) => [d, i]))
  const startsAt = new Map(Object.entries(seasonStartDay).map(([sn, d]) => [d, sn]))
  const calCols: ClubTabsData['calendar']['cols'] = days.map(d => {
    const st = new Date(d * 86_400_000), en = new Date((d + 6) * 86_400_000)
    const a = new Date(st.getUTCFullYear(), st.getUTCMonth(), st.getUTCDate()), z = new Date(en.getUTCFullYear(), en.getUTCMonth(), en.getUTCDate())
    return { key: String(d), label: span(a, z), current: curDays.has(d), season: startsAt.get(d)?.replace('-', '–') }
  })
  const calendar = { cols: calCols, rows: YSF_LEAGUES.map(L => {
    const mine = evs.filter(e => e.m.sport === L.sport).sort((x, y) => x.days[0] - y.days[0])
    const cells: ClubTabsData['calendar']['rows'][number]['cells'] = []
    let i = 0
    for (const e of mine) {
      const at = col.get(e.days[0])!
      if (at < i) continue // a second matchup in a week this row already shows (never expected)
      while (i < at) { cells.push(null); i++ }
      // championship and 3rd-place games are one week, whatever the period's length
      const width = round.has(e.m.id) ? 1 : Math.max(1, Math.min(e.days.length, days.length - at))
      const sd = side(e.m), m = e.m
      // a playoff bye (a top seed's first round) has no opponent
      const bye = !m.awayTeamId
      cells.push({ matchupId: m.id, span: width, label: e.label, opp: bye ? 'BYE' : `${sd.home ? '' : '@'}${C[sd.opp]?.abbreviation ?? 'TBD'}`,
        result: bye ? '' : m.isComplete ? `${sd.me > sd.them ? 'W' : sd.me < sd.them ? 'L' : 'T'} ${n1(sd.me)}–${n1(sd.them)}` : (sd.me || sd.them) ? `${n1(sd.me)}–${n1(sd.them)}` : '',
        tone: (bye ? 'future' : m.isComplete ? (sd.me > sd.them ? 'win' : sd.me < sd.them ? 'loss' : 'tie') : e.live && cur[L.sport] === m.week ? 'live' : 'future') as 'win' | 'loss' | 'tie' | 'live' | 'future', playoff: !!m.isPlayoff, round: round.get(m.id) })
      i = at + width
    }
    while (i < days.length) { cells.push(null); i++ }
    return { sport: L.sport, cells }
  }) }

  // each league: one entry per season the league has played
  const recs = await db.select().from(teamRecords).where(and(eq(teamRecords.leagueId, league.id), eq(teamRecords.teamId, teamId)))
  const ro = await db.select({ slot: rosters.slot, sport: rosters.sport, name: players.name, position: players.position, eligible: players.eligiblePositions, team: players.realTeamAbbr })
    .from(rosters).innerJoin(players, eq(rosters.playerId, players.id)).where(eq(rosters.teamId, teamId))
  const pickRows = await db.select().from(draftPicks).where(and(eq(draftPicks.leagueId, league.id), eq(draftPicks.isUsed, false), or(eq(draftPicks.currentTeamId, teamId), eq(draftPicks.originalTeamId, teamId))))
  const leagues: ClubTabsData['leagues'] = {}
  const pastCal: Record<string, Awaited<ReturnType<typeof pastSeasonWeeks>>> = {}
  for (const L of YSF_LEAGUES) {
    const seasons = [...new Set(all.filter(m => m.sport === L.sport).map(m => m.season ?? ""))].filter(Boolean).sort().reverse()
    const bySeason: Record<string, LeagueSeason> = {}
    for (const season of seasons) {
      const lm = all.filter(m => m.sport === L.sport && m.season === season)
      // standings from the completed regular season (win %, then points for)
      const tab: Record<string, { w: number; l: number; t: number; pf: number; pa: number }> = {}
      for (const m of lm.filter(x => x.isComplete && !x.isPlayoff && x.awayTeamId)) for (const id of [m.homeTeamId, m.awayTeamId!]) {
        const sd = side(m, id), r = (tab[id] ??= { w: 0, l: 0, t: 0, pf: 0, pa: 0 })
        r.pf += sd.me; r.pa += sd.them; if (sd.me > sd.them) r.w++; else if (sd.me < sd.them) r.l++; else r.t++
      }
      const wp = (r: { w: number; l: number; t: number }) => (r.w + r.t / 2) / Math.max(1, r.w + r.l + r.t)
      const order = Object.keys(tab).sort((a, b) => wp(tab[b]) - wp(tab[a]) || tab[b].pf - tab[a].pf)
      const me = tab[teamId] ?? { w: 0, l: 0, t: 0, pf: 0, pa: 0 }
      const live = season === league.season
      const lt = live ? s.tables[L.sport]?.find(r => r.teamId === teamId) : undefined
      const rec = recs.find(r => r.season === season && r.sport === L.sport)
      const champ = history.find(h => h.season === season && h.scope === L.sport)
      const done = !!champ || (!live && lm.length > 0)
      const finish = champ?.championTeamId === teamId ? 1 : champ?.runnerUpTeamId === teamId ? 2 : (done ? rec?.finishPosition ?? null : null)
      const firstWk = Math.min(...lm.map(m => m.week))
      const perLabel = (w: number) => `${L.sport === 'NFL' ? 'Week' : 'Period'} ${w - firstWk + 1}`
      // past seasons number matchups by period; their dates come from that season's period calendar
      const past = season !== league.season ? (pastCal[season] ??= await pastSeasonWeeks(season)) : null
      const dates = (wk: number) => {
        const fw = past ? past.periodWeeks[L.sport]?.[wk] : [wk]
        if (!fw?.length) return { start: null, end: null }
        return { start: weekDateRange(season, fw[0]).start, end: weekDateRange(season, fw[fw.length - 1]).end }
      }
      const sched = lm.filter(m => m.awayTeamId && (m.homeTeamId === teamId || m.awayTeamId === teamId)).sort((a, b) => a.week - b.week).map(m => {
        const sd = side(m), { start, end } = dates(m.week)
        return { per: (m.isPlayoff ? 'PLAYOFFS · ' : '') + perLabel(m.week).toUpperCase(), dates: start && end ? span(start, end) : '', ha: sd.home ? 'vs' : '@',
          crest: C[sd.opp]?.logo ?? null, opp: C[sd.opp]?.name ?? 'TBD', matchupId: m.id,
          res: m.isComplete ? (sd.me > sd.them ? 'W' : sd.me < sd.them ? 'L' : 'T') : '', score: m.isComplete || sd.me || sd.them ? `${n1(sd.me)}–${n1(sd.them)}` : '' }
      })
      bySeason[season] = {
        result: finish ? (finish === 1 ? 'CHAMPION' : ord(finish)) : null,
        rankLabel: done ? 'REG. SEASON' : 'RANK', rank: lt ? ord(lt.rk) : order.includes(teamId) ? ord(order.indexOf(teamId) + 1) : '—',
        rec: `${me.w}-${me.l}${me.t ? `-${me.t}` : ''}`, pf: n1(me.pf),
        fed: lt ? String(lt.fed) : finish ? String(13 - finish) : '—',
        po: lt && lt.po != null && !done ? pct(lt.po) : null, title: lt && !done ? pct(lt.title) : null,
        sched,
      }
    }
    // roster (current season only)
    const mine = ro.filter(r => r.sport === L.sport)
    const posOf = (r: typeof mine[number]) => { const e = safeParse<string[]>(r.eligible, []); return (e.length > 1 ? e : [r.position]).join('/') }
    const row = (r: typeof mine[number], slot: string) => ({ slot, name: r.name, team: r.team || 'FA', pos: dst(posOf(r)) })
    const so = SLOT_ORDER[L.sport] ?? []
    const starters = mine.filter(r => !['BN', 'IR', 'TAXI'].includes(r.slot)).sort((a, b) => (so.indexOf(a.slot) + 99) % 99 - (so.indexOf(b.slot) + 99) % 99)
    const roster = [
      { label: 'STARTERS', rows: starters.map(r => row(r, SLOT_LABEL[r.slot] ?? r.slot)) },
      { label: 'BENCH', rows: mine.filter(r => r.slot === 'BN').map(r => row(r, 'BN')) },
      { label: 'INJURED RESERVE', rows: mine.filter(r => r.slot === 'IR').map(r => row(r, 'IR')) },
      { label: 'TAXI SQUAD', rows: mine.filter(r => r.slot === 'TAXI').map(r => row(r, 'TAXI')) },
    ].filter(g => g.rows.length)
    // future picks: each year × round — own, acquired (from whom), traded away (to whom)
    const lp = pickRows.filter(p => p.sport === L.sport)
    const years = [...new Set(lp.map(p => p.year))].sort()
    const rounds = [...new Set(lp.map(p => p.round))].sort((a, b) => a - b)
    const picks = years.map(y => ({ year: y, cells: rounds.map(rd => lp.filter(p => p.year === y && p.round === rd).map(p =>
      p.currentTeamId === teamId && p.originalTeamId === teamId ? { kind: 'own' as const }
        : p.currentTeamId === teamId ? { kind: 'acq' as const, ab: C[p.originalTeamId]?.abbreviation ?? '', crest: C[p.originalTeamId]?.logo ?? null }
        : { kind: 'gone' as const, ab: C[p.currentTeamId]?.abbreviation ?? '' })) }))
    leagues[L.sport] = { seasons, bySeason, roster, rounds, picks }
  }

  // drafts and moves (Fantrax history + the app)
  const { moves: allMoves } = await loadMoves(league.id, league.season)
  const mv = allMoves.filter(m => m.teamId === teamId)
  const draftsMap = new Map<string, ClubTabsData['drafts'][number]>()
  for (const m of mv.filter(x => x.kind === 'DRAFTED')) {
    const fed = /#/.test(m.pick ?? '')
    const year = (m.when || '').slice(0, 4)
    const key = fed ? 'fed' : `${m.sport}|${year}`
    const d = draftsMap.get(key) ?? { title: fed ? '2025 Federation Draft' : `${year} ${code(m.sport)} Rookie Draft`, sport: fed ? null : m.sport, when: m.when, rows: [] }
    d.rows.push({ pk: m.pick ?? '', player: m.player ?? '', team: m.team || 'FA', pos: dst(m.pos ?? ''), via: m.via ? C[m.via]?.abbreviation ?? m.via : '' })
    draftsMap.set(key, d)
  }
  const pkNum = (p: string) => { const m = /R(\d+)\D+P(\d+)/.exec(p); return m ? +m[1] * 1000 + +m[2] : 0 }
  const drafts = [...draftsMap.values()].map(d => ({ ...d, rows: d.rows.sort((a, b) => pkNum(a.pk) - pkNum(b.pk)) })).sort((a, b) => (b.when > a.when ? 1 : -1))
  const moves = mv.filter(x => x.kind !== 'DRAFTED').slice(0, 300).map(m => ({
    when: m.when, sport: m.sport, kind: m.kind,
    player: m.player || m.text || '', team: m.player ? m.team || 'FA' : '', pos: m.player ? dst(m.pos ?? '') : '',
    detail: m.bid != null && m.kind !== 'TRADED' ? `$${m.bid}` : m.kind === 'TRADED' && m.from ? `from ${C[m.from]?.abbreviation ?? ''}` : '',
  }))

  // head-to-head: every completed matchup, every league and season
  const h2hMap: Record<string, { w: number; l: number; t: number; pf: number; pa: number }> = {}
  for (const m of ms.filter(x => x.isComplete && x.awayTeamId)) {
    const sd = side(m), r = (h2hMap[sd.opp] ??= { w: 0, l: 0, t: 0, pf: 0, pa: 0 })
    r.pf += sd.me; r.pa += sd.them; if (sd.me > sd.them) r.w++; else if (sd.me < sd.them) r.l++; else r.t++
  }
  const h2h = Object.entries(h2hMap).map(([id, r]) => ({ id, name: C[id]?.name ?? '', crest: C[id]?.logo ?? null, rec: `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`,
    pct: ((r.w + r.t / 2) / Math.max(1, r.w + r.l + r.t)).toFixed(3).replace(/^0/, ''), pf: n1(r.pf), pa: n1(r.pa), sortKey: (r.w + r.t / 2) / Math.max(1, r.w + r.l + r.t) }))
    .sort((a, b) => b.sortKey - a.sortKey || a.name.localeCompare(b.name))

  const titles = trophies.length
  return (
    <>
      {/* club picker: every crest in one evenly spaced row (two rows of six on phones); the club
          being viewed is outlined in its colour, the rest are quiet until hovered */}
      <nav aria-label="Clubs" className="grid grid-cols-6 lg:grid-cols-12 gap-1.5 sm:gap-2">
        {s.cup.map(r => r.teamId).sort((a, b) => C[a].name.localeCompare(C[b].name)).map(id => {
          const c = C[id], on = id === teamId
          return (
            <Link key={id} href={`/leagues/${league.id}/teams/${id}`} title={c.name} aria-label={c.name} aria-current={on ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg border-2 transition ${on ? '' : 'border-transparent opacity-60 grayscale-[35%] hover:opacity-100 hover:grayscale-0 hover:bg-ink-50'}`}
              style={on ? { borderColor: c.color ?? '#000', background: '#fff' } : undefined}>
              <span className="w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center"><img src={c.logo!} alt="" className="w-full h-full object-contain" /></span>
              <span className="font-display text-[10px] sm:text-[11px] font-bold tracking-[.06em] leading-none" style={{ color: on ? c.color ?? '#000' : '#4A4A4A' }}>{c.abbreviation}</span>
            </Link>
          )
        })}
      </nav>

      <section className="rounded p-5 sm:p-7 flex flex-wrap items-center gap-5 sm:gap-6" style={{ background: club.color ?? '#000', color: club.ink }}>
        <span className="w-24 h-24 sm:w-36 sm:h-36 inline-flex items-center justify-center flex-none"><img src={(club.altLogo || club.logo)!} alt={`${club.name} crest`} className="w-full h-full object-contain" /></span>
        <div className="min-w-0 flex-1 basis-[260px]">
          <div className="ui text-[12px] sm:text-[13px] tracking-[.16em] opacity-90">{U(`${ownerRow?.owner ?? ''} · ${club.abbreviation} · `)}<span className="whitespace-nowrap">{U('est. 2025–26')}</span></div>
          <h1 className="disp text-[34px] sm:text-[48px] lg:text-[72px] font-extrabold leading-[.85] mt-1 break-words">{U(club.name)}</h1>
          <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2 mt-4">
            {[['CUP RANK', ord(cupRow.rk)], ['CUP PTS', cupRow.pts], ['RECORD', cupRow.rec], ['CUP %', pct(cupRow.cupPct)], ['TITLES', titles]].map(([k, v]) => (
              <div key={k as string} className="bg-white text-black rounded px-3 py-2 sm:min-w-[96px] text-center"><div className="ui text-[10px] font-bold tracking-[.1em]">{k}</div><div className="disp text-[22px] sm:text-[26px] font-extrabold leading-none mt-0.5">{v}</div></div>
            ))}
          </div>
        </div>
        {trophies.length > 0 && (
          <div className="flex flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
            <div className="ui text-[12px] tracking-[.14em] opacity-90">TROPHY CASE</div>
            {trophies.map(t => <span key={t.id} className="inline-flex items-center gap-2 bg-black/20 rounded px-3 py-2 font-bold text-[14px]"><img src={trophyArt(t.scope, t.season)} alt="" className="w-6 h-6 object-contain" />{trophyName(t.scope, t.season)} champion</span>)}
          </div>
        )}
      </section>

      {thisWeek.length > 0 && (
        <section className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}>
          {thisWeek.map(w => {
            const L = YSF_LEAGUES.find(l => l.sport === w.sport)!
            return (
              <Link key={w.sport} href={`/leagues/${league.id}/matchup/${w.matchupId}`} className="card p-4 hover:bg-ink-50" style={{ borderTop: `4px solid ${L.color}` }}>
                <div className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="flex items-center gap-2 font-bold min-w-0"><img src={YSF_ART.leagueSymbol(L.key, 'white')} alt="" className="w-6 h-6 object-contain flex-none" /><span className="truncate"><span className="ysf-case">{L.code}</span> · {w.label}</span></span>
                  <span className="text-ink-500 flex-none">{w.status}</span>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="disp text-[32px] font-extrabold tabular-nums">{w.me == null ? '—' : n1(w.me)}</span>
                  <span className="flex items-center gap-1.5 text-[12px] text-ink-500">vs {w.oppLogo && <img src={w.oppLogo} alt="" className="w-6 h-6 object-contain" />}<b className="text-black">{w.oppAb}</b></span>
                  <span className="disp text-[32px] font-medium tabular-nums">{w.them == null ? '—' : n1(w.them)}</span>
                </div>
              </Link>
            )
          })}
        </section>
      )}

      <ClubTabs own={own} start={own ? YSF_LEAGUES.find(L => cur[L.sport] != null)?.sport ?? 'cal' : 'cal'} data={{ leagueId: league.id, teamId, clubName: club.name, clubAb: club.abbreviation, season: league.season, calendar, leagues, drafts, moves, h2h }} />
    </>
  )
}
