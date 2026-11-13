'use client'

// The ySF Moves table: black full-date day bars, TIME · LEAGUE · CLUB · TRANSACTION · PLAYER · BID,
// with search and league / club / type filters.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { YSF_LEAGUES, YSF_ART } from '@/lib/ysf'

type Club = { name: string; abbreviation: string; logo: string | null; color: string | null }
export type MoveRowT = { id: string; when: string; sport: string; teamId: string; kind: string; player: string; team: string; pos: string; bid: number | null; text: string; season?: string }
const PILL: Record<string, { bg: string; fg: string; bd?: string }> = {
  DRAFTED: { bg: '#660066', fg: '#fff' }, SIGNED: { bg: '#000', fg: '#fff' }, CLAIMED: { bg: '#2F5D8A', fg: '#fff' }, RELEASED: { bg: '#F2F2F2', fg: '#4A4A4A' }, MOVE: { bg: '#fff', fg: '#000', bd: '#C7C7C7' },
}
// Feed times are US Eastern wall-clock times.
const toDate = (iso: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + '-05:00')
const ET = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', ...o }).format(toDate(iso))

export default function MovesTable({ leagueId, rows, clubs, codes, fixedSport }: { leagueId: string; rows: MoveRowT[]; clubs: Record<string, Club>; codes: Record<string, string>; fixedSport?: string }) {
  const [q, setQ] = useState('')
  const [lg, setLg] = useState(fixedSport ?? '')
  const [club, setClub] = useState('')
  const [kind, setKind] = useState('')
  const kinds = useMemo(() => [...new Set(rows.map(r => r.kind))].sort(), [rows])
  const shown = rows.filter(r => (!lg || r.sport === lg) && (!club || r.teamId === club) && (!kind || r.kind === kind)
    && (!q || `${r.player} ${clubs[r.teamId]?.name ?? ''} ${clubs[r.teamId]?.abbreviation ?? ''} ${codes[r.sport] ?? ''}`.toLowerCase().includes(q.toLowerCase())))
  const days: { day: string; rows: MoveRowT[] }[] = []
  for (const r of shown) {
    const day = ET(r.when, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()
    const last = days[days.length - 1]
    if (last?.day === day) last.rows.push(r); else days.push({ day, rows: [r] })
  }
  const Filter = ({ label, value, set, opts }: { label: string; value: string; set: (v: string) => void; opts: [string, string][] }) => (
    <label className="inline-flex items-center gap-2 h-10 pl-3 pr-1 border border-ink-100 rounded">
      <span className="ui text-[12px] text-ink-500">{label}</span>
      <span className="relative">
        <select value={value} onChange={e => set(e.target.value)} className="appearance-none h-9 pr-7 font-semibold bg-white text-[13px] outline-none">{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <span className="absolute right-2 top-0 bottom-0 inline-flex items-center pointer-events-none text-[11px]">▾</span>
      </span>
    </label>
  )
  return (
    <>
      <label className="flex items-center gap-3 h-12 px-3 border border-ink-100 rounded">
        <span className="ui text-[12px] text-ink-500">SEARCH</span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Player, club or league" className="flex-1 h-full outline-none font-semibold" />
      </label>
      <div className="flex flex-wrap gap-2">
        {!fixedSport && <Filter label="LEAGUE" value={lg} set={setLg} opts={[['', 'All leagues'], ...YSF_LEAGUES.map(l => [l.sport, codes[l.sport]] as [string, string])]} />}
        <Filter label="CLUB" value={club} set={setClub} opts={[['', 'All clubs'], ...Object.entries(clubs).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, c]) => [id, c.name] as [string, string])]} />
        <Filter label="TYPE" value={kind} set={setKind} opts={[['', 'All types'], ...kinds.map(k => [k, k.charAt(0) + k.slice(1).toLowerCase()] as [string, string])]} />
      </div>
      <section className="card overflow-x-auto">
        <table className="w-full border-collapse min-w-[760px]">
          <thead><tr>{['TIME', 'LEAGUE', 'CLUB', 'TRANSACTION', 'PLAYER', 'BID'].map((h, i) => (
            <th key={h} className={`font-display text-[12px] font-medium tracking-[.12em] text-ink-500 px-2 py-2.5 border-b-2 border-black ${i === 5 ? 'text-right' : 'text-left'}`}>{h}</th>
          ))}</tr></thead>
          <tbody>
            {days.map(d => [
              <tr key={d.day}><td colSpan={6} className="bg-black text-white font-display text-[12px] font-bold tracking-[.12em] px-2 py-2">{d.day}</td></tr>,
              ...d.rows.map(r => {
                const c = clubs[r.teamId], L = YSF_LEAGUES.find(l => l.sport === r.sport), p = PILL[r.kind] ?? PILL.MOVE
                return (
                  <tr key={r.id} className="border-b border-ink-100">
                    <td className="px-2 py-2.5 text-[13px] text-ink-500 whitespace-nowrap">{ET(r.when, { hour: 'numeric', minute: '2-digit' })}</td>
                    <td className="px-2 py-2.5 whitespace-nowrap">{L && <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold"><img src={YSF_ART.leagueSymbol(L.key, 'white')} alt="" className="w-5 h-5 object-contain" /><span className="ysf-case">{codes[r.sport]}</span></span>}</td>
                    <td className="px-2 py-2.5" style={{ borderLeft: `4px solid ${c?.color ?? '#000'}` }}>
                      <Link href={`/leagues/${leagueId}/teams/${r.teamId}`} className="flex items-center gap-2 font-semibold">
                        <span className="w-6 h-6 inline-flex items-center justify-center flex-none">{c?.logo && <img src={c.logo} alt="" className="w-6 h-6 object-contain" />}</span>{c?.name}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5"><span className="ui inline-flex items-center justify-center min-w-[84px] h-[22px] px-2 rounded-[2px] text-[11px] font-bold leading-none" style={{ background: p.bg, color: p.fg, border: p.bd ? `1px solid ${p.bd}` : undefined }}>{r.kind}</span></td>
                    <td className="px-2 py-2.5 font-semibold">{r.player
                      ? <>{r.player} <span className="text-ink-500 font-normal ysf-case">({codes[r.sport]}-{r.team}, {r.pos.replace(/\bDEF\b/g, 'D/ST')})</span></>
                      : r.text}</td>
                    <td className="px-2 py-2.5 text-right font-bold tabular-nums">{r.bid != null ? `$${r.bid}` : ''}</td>
                  </tr>
                )
              }),
            ])}
            {!days.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-400 font-semibold">No moves match</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  )
}
