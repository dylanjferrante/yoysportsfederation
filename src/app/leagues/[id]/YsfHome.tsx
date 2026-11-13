// ySF Site Redesign — Home (front page), from the Nexus database.
import Link from 'next/link'
import { loadStandings, loadWeek, seriesSummary, type ClubInfo } from '@/lib/ysf-data'
import { YSF_LEAGUES, YSF_ART, U } from '@/lib/ysf'
import HomeStandings from './HomeStandings'

const NOUN: Record<string, string> = { NFL: 'football', NHL: 'hockey', NBA: 'basketball', MLB: 'baseball' }
const FLAVOR: Record<string, string> = { NFL: 'owns the gridiron', NHL: 'owns the ice', NBA: 'owns the court', MLB: 'owns the diamond' }
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth']
const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
const WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const pct = (x: number) => (x * 100 >= 99.95 ? '>99.9' : x > 0 && x < 0.001 ? '<0.1' : (x * 100).toFixed(1)) + '%'
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const list = (a: string[]) => a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`

export default async function YsfHome({ league }: { league: any }) {
  const s = await loadStandings(league)
  const wk = await loadWeek(league)
  const C = s.clubs, ab = (id: string) => C[id]?.abbreviation ?? ''
  const live = s.live
  const lead = s.cup[0], second = s.cup[1]
  const L = (sport: string) => YSF_LEAGUES.find(l => l.sport === sport)!

  // ── lead story, written from the table ──
  const gap = lead.pts - second.pts
  const headline = gap > 0
    ? `${ab(lead.teamId)} holds a ${WORD[gap] ?? gap}-point Cup lead${live.includes('MLB') ? '' : ' with ySFLB still to come'}`
    : `${ab(lead.teamId)} and ${ab(second.teamId)} share the Cup lead`
  const byRank = new Map<number, string[]>()
  for (const sp of live) { const r = lead.ranks[sp]; if (r != null) byRank.set(r, [...(byRank.get(r) ?? []), NOUN[sp]]) }
  const rankBits = [...byRank.entries()].sort((a, b) => a[0] - b[0]).map(([r, ns]) => `${ORD[r] ?? ord(r)} in ${list(ns)}`)
  const rival = [...s.cup].slice(1).sort((a, b) => b.cupPct - a.cupPct)[0]
  const dek = `${cap(list(rankBits))}, and ${lead.rec} across the ${WORD[live.length] ?? live.length}. The season model gives ${C[lead.teamId]?.name} a ${pct(lead.cupPct)} shot at the Cup; nobody else is above ${pct(rival.cupPct)}.`

  // ── headlines column ──
  const heads: { topic: string; topicColor?: string; clubs: string[]; title: string; dek: string }[] = []
  const byOdds = [...s.cup].sort((a, b) => b.cupPct - a.cupPct)
  const [o2, o3] = [byOdds[1], byOdds[2]]
  heads.push({ topic: 'CUP RACE', clubs: [o2.teamId, o3.teamId],
    title: Math.abs(o2.exp - o3.exp) < 0.6 ? `${ab(o2.teamId)} and ${ab(o3.teamId)} both project to ${o2.exp.toFixed(1)}` : `${ab(o2.teamId)} and ${ab(o3.teamId)} chase ${ab(byOdds[0].teamId)}`,
    dek: `Second place is close: ${C[o2.teamId]?.name} at ${pct(o2.cupPct)} to win the Cup, ${C[o3.teamId]?.name} at ${pct(o3.cupPct)}.` })
  for (const sp of live) {
    const top = s.tables[sp][0]
    if (!top || top.teamId === lead.teamId || heads.length >= 3) continue
    const row = s.cup.find(r => r.teamId === top.teamId)!
    heads.push({ topic: L(sp).code, topicColor: L(sp).color, clubs: [top.teamId], title: `${C[top.teamId]?.name} ${FLAVOR[sp]}`,
      dek: `First in ${NOUN[sp]} at ${top.rec}, and ${row.rec} overall — ${ord(row.rk)} in the Cup table.` })
  }
  const split = s.cup.map(r => { const rs = live.map(sp => ({ sp, r: r.ranks[sp] ?? 0 })).sort((a, b) => a.r - b.r); return { r, best: rs[0], worst: rs[rs.length - 1] } })
    .sort((a, b) => (b.worst.r - b.best.r) - (a.worst.r - a.best.r))[0]
  if (split && split.worst.r - split.best.r >= 5) heads.push({ topic: L(split.best.sp).code, topicColor: L(split.best.sp).color, clubs: [split.r.teamId],
    title: `${ab(split.r.teamId)}: ${ord(split.best.r)} in ${NOUN[split.best.sp]}, ${ord(split.worst.r)} in ${NOUN[split.worst.sp]}`,
    dek: `The widest split in the Federation leaves ${ab(split.r.teamId)} at ${pct(split.r.cupPct)} to win the Cup.` })
  const oddsRank = new Map(byOdds.map((r, i) => [r.teamId, i + 1]))
  const fav = s.cup.map(r => ({ r, d: r.rk - (oddsRank.get(r.teamId) ?? r.rk) })).sort((a, b) => b.d - a.d)[0]
  if (fav && fav.d > 0) heads.push({ topic: 'THE MODEL', clubs: [fav.r.teamId], title: `The model likes ${ab(fav.r.teamId)} more than the table does`,
    dek: `${cap(ord(fav.r.rk))} on points, but ${ord(oddsRank.get(fav.r.teamId)!)} on Cup odds at ${pct(fav.r.cupPct)}.` })

  const leader = C[lead.teamId] as ClubInfo
  const stripLabels = YSF_LEAGUES.map(l => wk.pairings[0]?.lines.find(x => x.sport === l.sport)).filter(Boolean) as any[]

  return (
    <>
      {/* score strip — one cell per club pairing, every active league stacked */}
      <section className="-mx-4 sm:mx-0 bg-black text-white flex overflow-x-auto sm:rounded">
        <div className="flex-none flex items-center gap-2 px-4 bg-[#ba0c2f] font-display font-bold tracking-[.1em] text-[13px]"><span className="w-2 h-2 rounded-full bg-white" />LIVE</div>
        <div className="flex-none flex flex-col justify-center gap-1 px-4 font-display text-[11px] tracking-[.1em] text-ink-200 border-r border-ink-800">
          {stripLabels.map(l => <span key={l.sport}>{U(`${l.label} · ${l.status === 'FINAL' ? 'final' : l.status === 'LIVE' ? 'live' : 'upcoming'}`)}</span>)}
        </div>
        {wk.pairings.map(p => (
          <Link key={p.a + p.b} href={`/leagues/${league.id}/scores`} className="flex-none min-w-[200px] px-4 py-2.5 border-r border-ink-800 hover:bg-ink-800">
            {[p.a, p.b].map((id, side) => (
              <div key={id} className="flex items-center gap-3 font-display text-[13px] font-bold leading-[1.5]">
                <span className="w-12">{ab(id)}</span>
                {p.lines.map(l => { const v = side ? l.b : l.a, o = side ? l.a : l.b; return <span key={l.sport} className="w-12 text-right tabular-nums" style={{ color: v != null && o != null && v > o ? '#fff' : '#C7C7C7', fontWeight: v != null && o != null && v > o ? 800 : 500 }}>{v == null ? '–' : v.toLocaleString('en-US', { maximumFractionDigits: 1 })}</span> })}
              </div>
            ))}
            <div className="text-[11px] text-ink-200 mt-0.5">{seriesSummary(p, ab)}</div>
          </Link>
        ))}
      </section>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <div className="rounded overflow-hidden flex" style={{ background: leader.color ?? '#000' }}>
            <div className="flex flex-col w-1.5">{YSF_LEAGUES.map(l => <span key={l.key} className="flex-1" style={{ background: l.color }} />)}</div>
            <div className="flex flex-wrap items-center gap-6 p-6 text-white">
              <span className="w-28 h-28 sm:w-36 sm:h-36 inline-flex items-center justify-center"><img src={(leader.altLogo || leader.logo)!} alt={leader.name} className="w-full h-full object-contain" /></span>
              <div className="min-w-0">
                <div className="disp text-[64px] sm:text-[96px] font-extrabold leading-[.85]">{pct(lead.cupPct)}</div>
                <div className="ui text-[13px] tracking-[.14em] mt-2">{U(`percent chance to win the 26-27 Fed Cup · ${leader.name}`)}</div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {live.map(sp => lead.ranks[sp] != null && (
                    <span key={sp} className="ui inline-flex items-center gap-1.5 bg-white text-black rounded px-2 h-7 text-[12px] font-bold leading-none">
                      <img src={YSF_ART.leagueSymbol(L(sp).key, 'white')} alt="" className="w-5 h-5 object-contain" />{ord(lead.ranks[sp]!).toUpperCase()} <span className="ysf-case">{L(sp).code}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <h1 className="disp text-[40px] sm:text-[64px] font-extrabold leading-[.9]"><span className="ysf-case">{U(headline)}</span></h1>
          <p className="text-[16px] leading-relaxed text-ink-800 max-w-[640px]">{dek}</p>
          <Link href={`/leagues/${league.id}/standings`} className="ui text-[13px] font-bold tracking-[.12em]">SEE THE FULL STANDINGS →</Link>
        </div>

        <aside>
          <div className="ui text-[13px] tracking-[.18em] pb-2 border-b-2 border-black">HEADLINES</div>
          {heads.slice(0, 4).map((h, i) => (
            <div key={i} className="flex gap-4 py-4 border-b border-ink-100">
              <div className="flex flex-col gap-1 flex-none">{h.clubs.map(id => <span key={id} className="w-9 h-9 inline-flex items-center justify-center"><img src={C[id]?.logo ?? ''} alt="" className="w-9 h-9 object-contain" /></span>)}</div>
              <div className="min-w-0">
                <div className="ui text-[11px] font-bold tracking-[.12em]" style={{ color: h.topicColor ?? '#000' }}><span className="ysf-case">{h.topic}</span></div>
                <div className="disp text-[22px] font-extrabold leading-[1.02] mt-1">{U(h.title)}</div>
                <p className="text-[13px] text-ink-500 mt-1.5 leading-snug">{h.dek}</p>
              </div>
            </div>
          ))}
        </aside>
      </section>

      <HomeStandings leagueId={league.id} cup={s.cup} live={live} clubs={Object.fromEntries(Object.values(C).map(c => [c.id, { name: c.name, abbreviation: c.abbreviation, logo: c.logo, color: c.color }]))} />
    </>
  )
}
