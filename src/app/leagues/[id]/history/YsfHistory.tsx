// ySF Site Redesign — History: seasons, the Federation Cup champion, the all-time table,
// league champions, a records book and rookie-draft results, from the Nexus database.
import Link from 'next/link'
import { db } from '@/db'
import { teamRecords, leagueHistory, matchups, drafts, draftPicks, players } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { loadStandings, loadMoves, periodLabel, siteSeasons } from '@/lib/ysf-data'
import { PageTitle, th, td, RecTh, RecTd } from '@/components/ysf/ui'
import { YSF_LEAGUES, YSF_ART, U } from '@/lib/ysf'
import { trophyName, trophyArt } from '@/lib/ysf-trophies'
import DraftResults from './DraftResults'

const TROPHY_BG: Record<string, string> = { NFL: '#95A2AC', NHL: '#8CC63F', NBA: '#EEB21D', MLB: '#8B2144' }
// the first ySF season; the page's "last season" is the most recent finished one (from ysffantasy.com)
const FIRST = '2025-26'
const num = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 })

export default async function YsfHistory({ league }: { league: any }) {
  const PREV = (await siteSeasons()).complete.filter(x => x < league.season).pop() ?? FIRST
  const firstTag = PREV === FIRST ? ' · INAUGURAL SEASON' : ''
  const s = await loadStandings(league)
  const C = s.clubs, ab = (id: string) => C[id]?.abbreviation ?? ''
  const recs = await db.select().from(teamRecords).where(eq(teamRecords.leagueId, league.id))
  const titles = await db.select().from(leagueHistory).where(eq(leagueHistory.leagueId, league.id))
  const ms = await db.select().from(matchups).where(eq(matchups.leagueId, league.id))
  const code = (sp: string) => YSF_LEAGUES.find(l => l.sport === sp)!.code

  // seasons
  const prevRecs = recs.filter(r => r.season === PREV)
  const prevCup: Record<string, number> = {}
  for (const r of prevRecs) if (r.finishPosition) prevCup[r.teamId] = (prevCup[r.teamId] ?? 0) + (13 - r.finishPosition)
  const fedChamp = titles.find(t => t.season === PREV && t.scope === 'OVERALL')
  const champOf = (sp: string) => titles.find(t => t.season === PREV && t.scope === sp)

  // all-time table (regular season + playoffs, every league, every season)
  const allTime = Object.keys(C).map(id => {
    const mine = ms.filter(m => m.isComplete && m.awayTeamId && (m.homeTeamId === id || m.awayTeamId === id))
    const wl = (list: typeof mine) => list.reduce((a, m) => { const me = m.homeTeamId === id ? m.homeScore ?? 0 : m.awayScore ?? 0, them = m.homeTeamId === id ? m.awayScore ?? 0 : m.homeScore ?? 0; return me > them ? { w: a.w + 1, l: a.l } : me < them ? { w: a.w, l: a.l + 1 } : a }, { w: 0, l: 0 })
    const tot = wl(mine)
    const per = Object.fromEntries(YSF_LEAGUES.map(L => [L.sport, wl(mine.filter(m => m.sport === L.sport))]))
    const cup = (prevCup[id] ?? 0) + (s.cup.find(r => r.teamId === id)?.pts ?? 0)
    const ts = titles.filter(t => t.championTeamId === id)
    return { id, gp: tot.w + tot.l, ...tot, pct: tot.w + tot.l ? tot.w / (tot.w + tot.l) : 0, per, cup, titles: ts }
  }).sort((a, b) => b.titles.length - a.titles.length || b.pct - a.pct)

  // records book
  const done = ms.filter(m => m.isComplete && m.awayTeamId && !m.isPlayoff)
  const records: { k: string; v: string }[] = []
  for (const L of YSF_LEAGUES) {
    let best: { id: string; pts: number; m: typeof done[number] } | null = null
    for (const m of done.filter(x => x.sport === L.sport)) for (const [id, pts] of [[m.homeTeamId, m.homeScore ?? 0], [m.awayTeamId!, m.awayScore ?? 0]] as [string, number][]) if (!best || pts > best.pts) best = { id, pts, m }
    if (best) records.push({ k: `Most points, one ${L.code} ${L.sport === 'NFL' ? 'week' : 'period'}`, v: `${ab(best.id)} · ${num(best.pts)} (${best.m.season?.replace('-', '–')}, ${best.m.season === league.season ? periodLabel(league, L.sport, best.m.week) : `${L.sport === 'NFL' ? 'Week' : 'Period'} ${best.m.week}`})` })
  }
  let streak = { id: '', n: 0, sp: '' }
  for (const L of YSF_LEAGUES) for (const id of Object.keys(C)) {
    const mine = done.filter(m => m.season === league.season && m.sport === L.sport && (m.homeTeamId === id || m.awayTeamId === id)).sort((a, b) => b.week - a.week)
    let n = 0
    for (const m of mine) { const me = m.homeTeamId === id ? m.homeScore ?? 0 : m.awayScore ?? 0, them = m.homeTeamId === id ? m.awayScore ?? 0 : m.homeScore ?? 0; if (me > them) n++; else break }
    if (n > streak.n) streak = { id, n, sp: L.sport }
  }
  if (streak.n) records.push({ k: 'Longest win streak (current)', v: `${ab(streak.id)} · ${streak.n} straight in ${code(streak.sp)}` })
  const { moves } = await loadMoves(league.id, league.season)
  for (const season of [league.season, PREV]) {
    const big = moves.filter(m => m.season === season && m.bid != null).sort((a, b) => (b.bid ?? 0) - (a.bid ?? 0))[0]
    if (big) records.push({ k: `Biggest FAAB bid, ${season.replace('-', '–')}`, v: `${ab(big.teamId)} · $${big.bid} for ${big.player}` })
  }
  const titleCount = Object.keys(C).map(id => ({ id, n: titles.filter(t => t.championTeamId === id && t.scope !== 'OVERALL').length })).sort((a, b) => b.n - a.n)[0]
  if (titleCount?.n) records.push({ k: 'Most league titles', v: `${ab(titleCount.id)} · ${titleCount.n}` })
  const topCup = Object.entries(prevCup).sort((a, b) => b[1] - a[1])[0]
  if (topCup) records.push({ k: 'Highest Cup total', v: `${ab(topCup[0])} · ${topCup[1]} (${PREV.replace('-', '–')})` })

  // completed rookie drafts
  const ds = (await db.select().from(drafts).where(and(eq(drafts.leagueId, league.id), eq(drafts.status, 'COMPLETED'))))
  const draftData = await Promise.all(ds.map(async d => {
    const picks = await db.select({ n: draftPicks.pickNumber, round: draftPicks.round, owner: draftPicks.currentTeamId, orig: draftPicks.originalTeamId, name: players.name, pos: players.position, team: players.realTeamAbbr })
      .from(draftPicks).leftJoin(players, eq(draftPicks.pickedPlayerId, players.id)).where(eq(draftPicks.draftId, d.id))
    const when = d.startsAt ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(d.startsAt)) : ''
    return { sport: d.scope, code: code(d.scope), when, picks: picks.filter(p => p.n).sort((a, b) => a.n! - b.n!).map(p => ({ n: p.n!, round: p.round, owner: ab(p.owner), via: p.orig !== p.owner ? ab(p.orig) : null, player: p.name ? `${p.name} (${code(d.scope)}-${p.team ?? 'FA'}, ${p.pos})` : 'Skipped' })) }
  }))
  draftData.sort((a, b) => YSF_LEAGUES.findIndex(l => l.sport === a.sport) - YSF_LEAGUES.findIndex(l => l.sport === b.sport))

  const lead = s.cup[0], fc = fedChamp ? C[fedChamp.championTeamId!] : null
  const SeasonCard = ({ title, kick, cupLabel, cupLine, rows, links }: { title: string; kick: string; cupLabel: string; cupLine: React.ReactNode; rows: { sp: string; label: string; line: React.ReactNode }[]; links: [string, string][] }) => (
    <div className="card overflow-hidden">
      <div className="bg-black text-white flex items-center gap-4 px-4 py-3">
        <img src={YSF_ART.primaryOnBlack} alt="" className="h-12 w-auto" />
        <div><div className="ui text-[11px] tracking-[.12em] opacity-90">{kick}</div><div className="disp text-[36px] font-extrabold leading-none">{title}</div></div>
      </div>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-ink-100"><img src={YSF_ART.cupSymbol} alt="" className="w-10 h-10 object-contain" /><div><div className="ui text-[11px] text-ink-500">{cupLabel}</div><div className="font-bold">{cupLine}</div></div></div>
      <div className="grid grid-cols-2">
        {rows.map((r, i) => { const L = YSF_LEAGUES.find(l => l.sport === r.sp)!; return (
          <div key={r.sp} className={`flex items-center gap-2.5 px-4 py-2.5 border-b border-ink-100 ${i % 2 ? 'border-l' : ''}`}>
            <img src={YSF_ART.leagueSymbol(L.key, 'white')} alt="" className="w-7 h-7 object-contain" />
            <div className="min-w-0"><div className="ui text-[11px] text-ink-500"><span className="ysf-case">{L.code}</span> · {r.label}</div><div className="font-bold text-[14px]">{r.line}</div></div>
          </div>) })}
      </div>
      <div className="flex flex-wrap gap-2 p-4">{links.map(([l, h]) => <Link key={l} href={h} className="ui inline-flex items-center justify-center h-8 px-3 border-2 border-black rounded text-[11px] font-bold">{l}</Link>)}</div>
    </div>
  )
  const base = `/leagues/${league.id}`
  return (
    <>
      <PageTitle eyebrow="Past seasons · champions · records · drafts" title="HISTORY" />
      <section className="flex flex-col gap-4">
        <h2 className="disp text-[32px] font-extrabold m-0">SEASONS</h2>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
          <SeasonCard title={league.season.replace('-', '–')} kick="IN PROGRESS" cupLabel="FED CUP LEADER" cupLine={`${C[lead.teamId]?.name} · ${lead.pts} pts`}
            rows={YSF_LEAGUES.map(L => { const t = s.tables[L.sport]?.[0]; return { sp: L.sport, label: s.live.includes(L.sport) ? 'LEADER' : 'OPENS SOON', line: s.live.includes(L.sport) && t ? `${ab(t.teamId)} · ${t.rec}` : '—' } })}
            links={[['STANDINGS', `${base}/standings`], ['SCORES', `${base}/scores`], ['CLUBS', `${base}/teams`]]} />
          <SeasonCard title={PREV.replace('-', '–')} kick={`FINAL${firstTag}`} cupLabel="FED CUP CHAMPION" cupLine={fc ? `${fc.name} · ${prevCup[fedChamp!.championTeamId!] ?? ''} pts` : '—'}
            rows={YSF_LEAGUES.map(L => { const c = champOf(L.sport); return { sp: L.sport, label: 'CHAMPION', line: c ? ab(c.championTeamId!) : '—' } })}
            links={[['MOVES', `${base}/transactions`]]} />
        </div>
      </section>

      {fc && (
        <section className="rounded p-6 sm:p-7 flex flex-wrap items-center gap-6" style={{ background: fc.color ?? '#000', color: fc.ink ?? '#fff' }}>
          <img src={trophyArt('OVERALL')} alt="" className="w-24 h-24 object-contain" />
          <span className="w-24 h-24 inline-flex items-center justify-center"><img src={(fc.altLogo || fc.logo)!} alt="" className="w-24 h-24 object-contain" /></span>
          <div className="min-w-0"><div className="ui text-[13px] tracking-[.14em] opacity-90">{U(`${PREV.replace('-', '–')} Federation Cup champion${PREV === FIRST ? ' · inaugural' : ''}`)}</div>
            <div className="disp text-[44px] sm:text-[60px] font-extrabold leading-[.9]">{U(fc.name)}</div>
            <div className="text-[14px] mt-1 opacity-95">{prevCup[fedChamp!.championTeamId!]} Federation points · {titles.filter(t => t.season === PREV && t.scope !== 'OVERALL' && t.championTeamId === fedChamp!.championTeamId).map(t => code(t.scope)).join(' and ')} titles</div></div>
        </section>
      )}

      <section className="card overflow-x-auto">
        <div className="px-4 pt-4"><h2 className="disp text-[28px] font-extrabold m-0">ALL-TIME FEDERATION TABLE</h2></div>
        <table className="w-full border-collapse mt-2 min-w-[900px]">
          <thead><tr>
            <th className={th}>RK</th><th className={th}>CLUB</th><th className={`${th} text-right`}>GP</th><RecTh /><th className={`${th} text-right`}>PCT</th>
            {YSF_LEAGUES.map(l => <th key={l.sport} className={`${th} text-right`} style={{ color: l.color }}><span className="ysf-case">{l.code}</span></th>)}
            <th className={`${th} text-right`}>CUP PTS</th><th className={th}>TITLES</th>
          </tr></thead>
          <tbody>{allTime.map((r, i) => (
            <tr key={r.id}>
              <td className={`${td} w-9`}>{i + 1}</td>
              <td className={`${td} whitespace-normal`} style={{ borderLeft: `4px solid ${C[r.id]?.color ?? '#000'}` }}><Link href={`${base}/teams/${r.id}`} className="flex items-center gap-2.5"><span className="w-7 h-7 inline-flex items-center justify-center"><img src={C[r.id]?.logo ?? ''} alt="" className="w-7 h-7 object-contain" /></span><span className="font-bold">{C[r.id]?.name}</span></Link></td>
              <td className={`${td} text-right font-normal`}>{r.gp}</td><RecTd rec={`${r.w}-${r.l}`} /><td className={`${td} text-right`}>{r.pct.toFixed(3).replace(/^0/, '')}</td>
              {YSF_LEAGUES.map(l => <td key={l.sport} className={`${td} text-right font-normal`}>{r.per[l.sport].w + r.per[l.sport].l ? `${r.per[l.sport].w}–${r.per[l.sport].l}` : '—'}</td>)}
              <td className={`${td} text-right`}>{r.cup}</td>
              <td className={td}><span className="flex gap-1">{r.titles.map(t => <span key={t.id} title={trophyName(t.scope, t.season)} className="w-8 h-8 inline-flex items-center justify-center rounded" style={{ background: t.scope === 'OVERALL' ? '#000' : TROPHY_BG[t.scope] }}><img src={trophyArt(t.scope, t.season)} alt={trophyName(t.scope, t.season)} className="w-7 h-7 object-contain" /></span>)}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </section>

      <section className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {YSF_LEAGUES.map(L => { const t = champOf(L.sport); const c = t ? C[t.championTeamId!] : null; return (
          <div key={L.sport} className="rounded overflow-hidden">
            <div className="flex flex-col items-center gap-2 p-4" style={{ background: TROPHY_BG[L.sport] }}><img src={trophyArt(L.sport, PREV)} alt="" className="h-24 w-auto" /><div className="ui text-[12px] font-bold text-center" style={{ color: L.sport === 'MLB' ? '#fff' : '#000' }}>{U(trophyName(L.sport, PREV))}</div></div>
            <div className="flex items-center gap-3 p-4" style={{ background: c?.color ?? '#000', color: c?.ink ?? '#fff' }}>
              {c && <span className="w-12 h-12 inline-flex items-center justify-center flex-none"><img src={(c.altLogo || c.logo)!} alt="" className="w-12 h-12 object-contain" /></span>}
              <div className="min-w-0"><div className="ui text-[10px] opacity-90">CHAMPION</div><div className="disp text-[22px] font-extrabold leading-tight">{c?.name ?? '—'}</div>{t?.runnerUpTeamId && <div className="text-[12px] opacity-90">Runner-up: {C[t.runnerUpTeamId]?.name}</div>}</div>
            </div>
          </div>) })}
      </section>

      <section className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
        <div className="card p-4">
          <div className="ui text-[12px] tracking-[.12em] text-ink-500 mb-2">RECORDS BOOK</div>
          {records.map(r => <div key={r.k} className="flex justify-between gap-4 py-2 border-t border-ink-50 first:border-t-0"><span className="text-[14px]">{r.k}</span><span className="font-bold text-[14px] text-right ysf-case">{r.v}</span></div>)}
        </div>
        {draftData.length > 0 && <DraftResults drafts={draftData} />}
      </section>
    </>
  )
}
