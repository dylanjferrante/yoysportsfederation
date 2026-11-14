// ySF Site Redesign — Players: every player in a league with who owns him (or free agent /
// waivers), season stats and ySF points; filters by league, position, availability and name.
// Free agents can be added and waiver players claimed (FAAB) straight from the list.
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { YSF_LEAGUES, YSF_ART, injTag } from '@/lib/ysf'
import { loadClubs } from '@/lib/ysf-data'
import { PageTitle, th, td } from '@/components/ysf/ui'
import ClaimButton from './ClaimButton'
import { settleYsfWaivers, nextNflRun, lastNflRun } from '@/lib/waivers'

const PER = 60
type Row = { id: string; name: string; position: string; elig: string | null; team: string | null; status: string | null; injury: string | null; owner: string | null; slot: string | null; clears: string | null; gp: number | null; pts: number | null }
const POS: Record<string, string[]> = { NFL: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'], NHL: ['C', 'LW', 'RW', 'D', 'G'], NBA: ['PG', 'SG', 'SF', 'PF', 'C'], MLB: ['C', '1B', '2B', '3B', 'SS', 'OF', 'SP', 'RP'] }

export default async function YsfPlayers({ league, sp }: { league: any; sp: Record<string, string | undefined> }) {
  const session = await getServerSession(authOptions)
  const C = await loadClubs(league.id)
  const L = YSF_LEAGUES.find(l => l.key === sp.lg) ?? YSF_LEAGUES[0]
  const pos = POS[L.sport].includes(sp.pos ?? '') ? sp.pos! : ''
  const avail = ['fa', 'own', 'all'].includes(sp.av ?? '') ? sp.av! : 'fa'
  const q = (sp.q ?? '').trim()
  const sort = ['pts', 'ppg', 'gp', 'name'].includes(sp.sort ?? '') ? sp.sort! : 'pts'
  const page = Math.max(1, Number(sp.p) || 1)

  await settleYsfWaivers(league)
  const rows = db.all<Row>(sql`
    SELECT p.id, p.name, p.position, p.eligible_positions elig, p.real_team_abbr team, p.status, p.injury_note injury,
      (SELECT r.team_id FROM rosters r JOIN teams t ON t.id = r.team_id WHERE r.player_id = p.id AND t.league_id = ${league.id} LIMIT 1) owner,
      (SELECT r.slot FROM rosters r JOIN teams t ON t.id = r.team_id WHERE r.player_id = p.id AND t.league_id = ${league.id} LIMIT 1) slot,
      (SELECT w.clears_at FROM waiver_wire w WHERE w.player_id = p.id AND w.league_id = ${league.id} LIMIT 1) clears,
      s.gp, s.points pts
    FROM players p LEFT JOIN player_season_stats s ON s.player_id = p.id AND s.league_id = ${league.id} AND s.season = ${league.season}
    WHERE p.sport = ${L.sport}`)
  // ySFFL: free agents whose game this week has started are on waivers until Wednesday's run
  if (L.sport === 'NFL') {
    const since = Math.floor(lastNflRun().getTime() / 1000), until = Math.floor(Date.now() / 1000) + 300
    const locked = new Set(db.all<{ t: string }>(sql`SELECT home_abbr t FROM game_schedule WHERE sport = 'NFL' AND game_time_epoch BETWEEN ${since} AND ${until} UNION SELECT away_abbr FROM game_schedule WHERE sport = 'NFL' AND game_time_epoch BETWEEN ${since} AND ${until}`).map(r => r.t))
    const wed = nextNflRun(new Date(), 0).toISOString()
    for (const r of rows) if (!r.owner && !r.clears && r.team && locked.has(r.team)) r.clears = wed
  }
  const posOf = (r: Row) => { try { const e = JSON.parse(r.elig ?? '[]') as string[]; return e.length ? e : [r.position] } catch { return [r.position] } }
  let list = rows.filter(r => (avail === 'all' || (avail === 'fa' ? !r.owner : !!r.owner)) && (!pos || posOf(r).includes(pos)) && (!q || r.name.toLowerCase().includes(q.toLowerCase())))
  const ppg = (r: Row) => (r.gp ? (r.pts ?? 0) / r.gp : 0)
  list = list.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'gp' ? (b.gp ?? 0) - (a.gp ?? 0) : sort === 'ppg' ? ppg(b) - ppg(a) : (b.pts ?? 0) - (a.pts ?? 0))
  const total = list.length, shown = list.slice((page - 1) * PER, page * PER)

  // my club: roster in this league (to drop) and FAAB left
  // this week's projection from the ySF player model (its earliest week still to finish)
  const proj = new Map<string, number>()
  try {
    const wk = db.all<{ w: number | null }>(sql`SELECT MIN(week) w FROM matchups WHERE league_id = ${league.id} AND season = ${league.season} AND sport = ${L.sport} AND is_complete = 0`)[0]?.w
    if (wk != null) for (const r of db.all<{ id: string; pts: number }>(sql`SELECT player_id id, pts FROM ysf_player_proj WHERE season = ${league.season} AND week = ${wk}`)) proj.set(r.id, r.pts)
  } catch { /* the model hasn't run yet */ }
  const me = session?.user?.id ? db.all<{ id: string }>(sql`SELECT id FROM teams WHERE league_id = ${league.id} AND user_id = ${session.user.id} LIMIT 1`)[0] : undefined
  // claims I already have in (from here or My Club) show as PENDING, not another CLAIM button
  const myClaims = new Set(me ? db.all<{ p: string }>(sql`SELECT add_player_id p FROM waiver_claims WHERE team_id = ${me.id} AND status = 'PENDING'`).map(r => r.p) : [])
  const myRoster = me ? db.all<{ id: string; rid: string; name: string; slot: string; team: string | null; position: string }>(sql`SELECT p.id, r.id rid, p.name, r.slot, p.real_team_abbr team, p.position FROM rosters r JOIN players p ON p.id = r.player_id WHERE r.team_id = ${me.id} AND r.sport = ${L.sport} ORDER BY r.slot`) : []
  const faab = me ? (db.all<{ f: number }>(sql`SELECT faab_remaining f FROM team_records WHERE team_id = ${me.id} AND season = ${league.season} AND sport = ${L.sport} LIMIT 1`)[0]?.f ?? 0) : 0

  const base = `/leagues/${league.id}/waivers`
  const link = (o: Record<string, string | number | undefined>) => { const p = new URLSearchParams(); const m = { lg: L.key, pos, av: avail, q, sort, ...o }; for (const [k, v] of Object.entries(m)) if (v !== undefined && v !== '' && !(k === 'av' && v === 'fa') && !(k === 'sort' && v === 'pts') && !(k === 'lg' && v === 'fl')) p.set(k, String(v)); const s = p.toString(); return s ? `${base}?${s}` : base }
  const chip = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg font-display text-[12px] font-bold tracking-[.06em] leading-none border whitespace-nowrap'
  const on = (x: boolean) => ({ background: x ? '#000' : '#fff', color: x ? '#fff' : '#000', borderColor: x ? '#000' : '#C7C7C7' })
  const SortTh = ({ k, label, right, cls = '' }: { k: string; label: string; right?: boolean; cls?: string }) => (
    <th className={`${th} ${right ? 'text-right' : ''} ${cls}`}><Link href={link({ sort: k, p: undefined })} className={sort === k ? 'text-black' : ''}>{label}{sort === k ? ' ▾' : ''}</Link></th>
  )

  return (
    <>
      <PageTitle eyebrow={`${L.code} · ${total.toLocaleString()} players${me ? ` · $${faab} FAAB left` : ''}`} title="PLAYERS" />
      <div className="flex flex-wrap gap-2">
        {YSF_LEAGUES.map(l => { const o = l.key === L.key; return (
          <Link key={l.key} href={link({ lg: l.key, pos: undefined, p: undefined })} className={chip} style={{ background: o ? l.color : 'var(--surface)', color: o ? '#fff' : 'var(--fg)', borderColor: o ? l.color : 'var(--line-2)' }}>
            <img src={YSF_ART.leagueSymbol(l.key, o ? 'color' : 'white')} alt="" className="w-5 h-5 object-contain" /><span className="ysf-case">{l.code}</span>
          </Link>) })}
      </div>
      <div className="flex flex-wrap items-center gap-2 -mt-3 sm:-mt-4">
        {[['fa', 'AVAILABLE'], ['own', 'ROSTERED'], ['all', 'ALL']].map(([k, label]) => <Link key={k} href={link({ av: k, p: undefined })} className={chip} style={on(avail === k)}>{label}</Link>)}
        <span className="w-px h-6 bg-ink-100 mx-1" />
        <Link href={link({ pos: undefined, p: undefined })} className={chip} style={on(!pos)}>ALL POS</Link>
        {POS[L.sport].map(x => <Link key={x} href={link({ pos: x, p: undefined })} className={chip} style={on(pos === x)}>{x === 'DEF' ? 'D/ST' : x}</Link>)}
        <form action={base} className="ml-auto flex items-center gap-2">
          {L.key !== 'fl' && <input type="hidden" name="lg" value={L.key} />}{pos && <input type="hidden" name="pos" value={pos} />}{avail !== 'fa' && <input type="hidden" name="av" value={avail} />}
          <input name="q" defaultValue={q} placeholder="Search players" className="h-9 w-48 px-3 rounded-lg border border-ink-200 text-[14px]" />
        </form>
      </div>
      <section className="card overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr>
            <SortTh k="name" label="PLAYER" /><th className={th}>TEAM</th><th className={th}>POS</th><th className={th}>STATUS</th>
            <SortTh k="gp" label="GP" right cls="hidden sm:table-cell" /><SortTh k="pts" label="FPTS" right /><th className={`${th} text-right`}>PROJ</th><SortTh k="ppg" label="FP/G" right cls="hidden sm:table-cell" /><th className={th} />
          </tr></thead>
          <tbody>
            {shown.map(r => {
              const c = r.owner ? C[r.owner] : undefined
              return (
                <tr key={r.id}>
                  <td className={`${td} !whitespace-normal min-w-[132px]`}>
                    <span className="block text-[14px] leading-tight break-words"><b>{r.name}</b>{injTag(r.status) && <> <span title={r.status ?? ''} className="ui inline-flex items-center justify-center leading-none h-[16px] px-[4px] rounded-[2px] bg-[#ba0c2f] text-white text-[10px] font-bold align-[1px]">{injTag(r.status)}</span></>}</span>
                    {r.injury && injTag(r.status) && <span className="block text-[11px] text-[#ba0c2f] font-semibold leading-tight mt-0.5 max-w-[420px]">{r.injury}</span>}
                  </td>
                  <td className={`${td} font-normal whitespace-nowrap`}>{r.team || 'FA'}</td>
                  <td className={`${td} font-normal whitespace-nowrap`}>{posOf(r).join('/').replace(/\bDEF\b/, 'D/ST')}</td>
                  <td className={`${td} font-normal`}>
                    {c ? <Link href={`/leagues/${league.id}/teams/${r.owner}`} className="inline-flex items-center gap-1.5"><img src={c.logo ?? ''} alt="" className="w-5 h-5 object-contain" /><span className="font-semibold hidden sm:inline">{c.abbreviation}</span></Link>
                      : r.clears ? <span className="ui inline-flex items-center justify-center h-[22px] px-2 rounded-[2px] text-[11px] font-bold leading-none bg-[#2F5D8A] text-white"><span className="hidden sm:inline">WAIVERS · </span><span className="sm:hidden">W · </span>{new Date(r.clears).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      : <span className="ui inline-flex items-center justify-center h-[22px] px-2 rounded-[2px] text-[11px] font-bold leading-none bg-black text-white"><span className="hidden sm:inline">FREE AGENT</span><span className="sm:hidden">FA</span></span>}
                  </td>
                  <td className={`${td} text-right hidden sm:table-cell font-normal`}>{r.gp ?? 0}</td>
                  <td className={`${td} text-right`}>{(r.pts ?? 0).toFixed(1)}</td>
                  <td className={`${td} text-right font-normal`}>{proj.has(r.id) ? proj.get(r.id)!.toFixed(1) : '—'}</td>
                  <td className={`${td} text-right hidden sm:table-cell font-normal`}>{ppg(r).toFixed(1)}</td>
                  <td className={`${td} text-right`}>{!r.owner && me && myClaims.has(r.id) && <span className="ui inline-flex items-center justify-center h-8 px-3 rounded-lg border border-black text-[12px] font-bold leading-none">PENDING</span>}{!r.owner && me && !myClaims.has(r.id) && <ClaimButton leagueId={league.id} teamId={me.id} player={{ id: r.id, name: r.name, team: r.team, pos: posOf(r).join('/') }} code={L.code} waivers={!!r.clears} faab={faab} roster={myRoster} />}</td>
                </tr>
              )
            })}
            {!shown.length && <tr><td colSpan={9} className="px-4 py-6 text-center text-ink-400 font-semibold">No players match</td></tr>}
          </tbody>
        </table>
      </section>
      {total > PER && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && <Link href={link({ p: page - 1 })} className={chip} style={on(false)}>‹ PREV</Link>}
          <span className="ui text-[12px] text-ink-500">PAGE {page} OF {Math.ceil(total / PER)}</span>
          {page * PER < total && <Link href={link({ p: page + 1 })} className={chip} style={on(false)}>NEXT ›</Link>}
        </div>
      )}
    </>
  )
}
