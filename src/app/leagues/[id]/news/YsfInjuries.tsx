// ySF Injuries: every designation change for a rostered player (the injury sync logs them), then the
// current injury report for each league — club, player, designation and the latest note.
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import Link from 'next/link'
import { YSF_LEAGUES, YSF_ART, injTag, isInjured } from '@/lib/ysf'
import { loadClubs } from '@/lib/ysf-data'
import { PageTitle, th, td } from '@/components/ysf/ui'
import { playerLabel } from '@/lib/ysf-audit'

type R = { pid: string; name: string; sport: string; team: string | null; position: string; elig: string | null; status: string | null; note: string | null; owner: string; slot: string }
const stamp = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) + ' ET'
const Tag = ({ s }: { s: string | null }) => injTag(s)
  ? <span title={s ?? ''} className="ui inline-flex items-center justify-center leading-none h-[20px] min-w-[28px] px-[5px] rounded-[2px] bg-[#ba0c2f] text-white text-[11px] font-bold">{injTag(s)}</span>
  : <span className="ui inline-flex items-center justify-center leading-none h-[20px] min-w-[28px] px-[5px] rounded-[2px] bg-[#177245] text-white text-[11px] font-bold">ACT</span>

export default async function YsfInjuries({ league, lg }: { league: any; lg?: string }) {
  const C = await loadClubs(league.id)
  const rostered = db.all<R>(sql`SELECT p.id pid, p.name, p.sport, p.real_team_abbr team, p.position, p.eligible_positions elig, p.status, p.injury_note note, r.team_id owner, r.slot
    FROM rosters r JOIN teams t ON t.id = r.team_id JOIN players p ON p.id = r.player_id WHERE t.league_id = ${league.id}`)
  const byId = new Map(rostered.map(r => [r.pid, r]))
  let log: { player_id: string; status: string; prev_status: string | null; note: string | null; at: string }[] = []
  try { log = db.all(sql`SELECT player_id, status, prev_status, note, at FROM player_injury_log WHERE at >= ${new Date(Date.now() - 14 * 86_400_000).toISOString()} ORDER BY at DESC LIMIT 400`) } catch { /* no log yet */ }
  const changes = log.filter(l => byId.has(l.player_id))
  const L = YSF_LEAGUES.find(l => l.key === lg)
  const leagues = L ? [L] : YSF_LEAGUES
  const chip = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg font-display text-[12px] font-bold tracking-[.06em] leading-none border whitespace-nowrap'
  const club = (id: string) => C[id]
  const label = (r: R) => playerLabel(r.sport, r.name, r.team, r.position, r.elig)

  return (
    <>
      <PageTitle eyebrow="Rostered players" title="INJURIES" />
      <div className="flex flex-wrap gap-2">
        <Link href={`/leagues/${league.id}/news`} className={chip} style={{ background: !L ? '#000' : '#fff', color: !L ? '#fff' : '#000', borderColor: !L ? '#000' : '#C7C7C7' }}>ALL</Link>
        {YSF_LEAGUES.map(l => { const on = L?.key === l.key; return (
          <Link key={l.key} href={`/leagues/${league.id}/news?lg=${l.key}`} className={chip} style={{ background: on ? l.color : '#fff', color: on ? '#fff' : '#000', borderColor: on ? l.color : '#C7C7C7' }}><span className="ysf-case">{l.code}</span></Link>) })}
      </div>

      <section className="card overflow-hidden">
        <div className="ui px-4 py-2.5 border-b-2 border-black text-[12px] font-bold tracking-[.12em]">LATEST CHANGES</div>
        {changes.filter(c => !L || byId.get(c.player_id)!.sport === L.sport).slice(0, 60).map((c, i) => { const r = byId.get(c.player_id)!; const o = club(r.owner); return (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center px-4 py-2.5 border-t border-ink-50">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><span className="font-bold"><span className="ysf-case">{label(r)}</span></span>
                <span className="inline-flex items-center gap-1.5"><Tag s={c.prev_status} /><span className="text-ink-400">→</span><Tag s={c.status} /></span></div>
              {c.note && <div className="text-[13px] text-ink-600 mt-0.5">{c.note}</div>}
              <div className="text-[12px] text-ink-400 mt-0.5 inline-flex items-center gap-1.5">{o?.logo && <img src={o.logo} alt="" className="w-4 h-4 object-contain" />}{o?.name} · {stamp(c.at)}</div>
            </div>
          </div>) })}
        {!changes.length && <div className="px-4 py-4 text-ink-500 font-semibold">No changes in the last 14 days</div>}
      </section>

      {leagues.map(l => {
        const list = rostered.filter(r => r.sport === l.sport && isInjured(r.status)).sort((a, b) => (club(a.owner)?.name ?? '').localeCompare(club(b.owner)?.name ?? '') || a.name.localeCompare(b.name))
        return (
          <section key={l.key} className="card overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 text-white" style={{ background: l.color }}>
              <img src={YSF_ART.leagueSymbol(l.key, 'color')} alt="" className="w-7 h-7 object-contain" />
              <span className="disp text-[22px] font-extrabold ysf-case">{l.code}</span>
              <span className="ui ml-auto text-[12px] font-bold">{list.length} INJURED</span>
            </div>
            <table className="w-full border-collapse table-fixed">
              <thead><tr><th className={`${th} w-[30%]`}>CLUB</th><th className={th}>PLAYER</th><th className={`${th} w-[64px] text-center`}>STATUS</th></tr></thead>
              <tbody>{list.map(r => { const o = club(r.owner); return (
                <tr key={r.pid}>
                  <td className={`${td} !whitespace-normal`}><span className="inline-flex items-center gap-1.5">{o?.logo && <img src={o.logo} alt="" className="w-5 h-5 object-contain flex-none" />}<span className="hidden sm:inline">{o?.name}</span><span className="sm:hidden">{o?.abbreviation}</span></span></td>
                  <td className={`${td} !whitespace-normal`}><div><span className="ysf-case">{label(r)}</span>{r.slot === 'IR' && <span className="text-ink-500 font-normal"> · on IR</span>}</div>{r.note && <div className="text-[13px] font-normal text-ink-600 mt-0.5">{r.note}</div>}</td>
                  <td className={`${td} text-center`}><Tag s={r.status} /></td>
                </tr>) })}</tbody>
            </table>
            {!list.length && <div className="px-4 py-4 text-ink-500 font-semibold">No injured players</div>}
          </section>
        )
      })}
    </>
  )
}
