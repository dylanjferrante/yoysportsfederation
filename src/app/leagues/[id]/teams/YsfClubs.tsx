// ySF Site Redesign — All Clubs: one club-color tile per club with its Cup line and league lines.
import Link from 'next/link'
import { db } from '@/db'
import { teams, users, leagueHistory } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { loadStandings } from '@/lib/ysf-data'
import { PageTitle } from '@/components/ysf/ui'
import { YSF_LEAGUES, YSF_ART } from '@/lib/ysf'
import { trophyName, trophyArt } from '@/lib/ysf-trophies'

const pct = (x: number) => (x * 100 >= 99.95 ? '>99.9' : x > 0 && x < 0.001 ? '<0.1' : (x * 100).toFixed(1)) + '%'

export default async function YsfClubs({ league }: { league: any }) {
  const s = await loadStandings(league)
  const owners = new Map((await db.select({ id: teams.id, owner: users.name, wordmark: teams.wordmark }).from(teams).leftJoin(users, eq(teams.userId, users.id)).where(eq(teams.leagueId, league.id))).map(r => [r.id, r]))
  const titles = await db.select().from(leagueHistory).where(eq(leagueHistory.leagueId, league.id))
  return (
    <>
      <PageTitle title="ALL CLUBS" />
      <section className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        {s.cup.map(r => {
          const c = s.clubs[r.teamId], o = owners.get(r.teamId)
          const cups = titles.filter(t => t.championTeamId === r.teamId)
          return (
            <Link key={r.teamId} href={`/leagues/${league.id}/teams/${r.teamId}`} className="rounded p-5 text-white flex flex-col gap-4 hover:brightness-110" style={{ background: c.color ?? '#000' }}>
              <div className="flex items-center gap-3">
                <span className="w-14 h-14 inline-flex items-center justify-center flex-none"><img src={(c.altLogo || c.logo)!} alt="" className="w-14 h-14 object-contain" /></span>
                <div className="min-w-0"><div className="disp text-[26px] font-extrabold leading-none">{c.name}</div><div className="text-[12px] opacity-90 mt-1">{o?.owner} · <b>{c.abbreviation}</b></div></div>
              </div>
              {cups.length > 0 && (
                <div className="flex flex-wrap gap-2">{cups.map(t => (
                  <span key={t.id} title={trophyName(t.scope, t.season)} className="inline-flex items-center gap-1.5 bg-black/20 rounded px-2 py-1 text-[11px] font-bold">
                    <img src={trophyArt(t.scope)} alt="" className="w-5 h-5 object-contain" />{trophyName(t.scope, t.season)}
                  </span>))}</div>
              )}
              <div className="grid grid-cols-[0.7fr_0.8fr_1.2fr_1fr] gap-2">
                {[['RANK', r.rk], ['POINTS', r.pts], ['CUP %', pct(r.cupPct)], ['RECORD', r.rec]].map(([k, v]) => (
                  <div key={k as string} className="min-w-0"><div className="ui text-[10px] tracking-[.12em] opacity-85">{k}</div><div className="disp text-[21px] font-extrabold leading-none mt-1 whitespace-nowrap">{v}</div></div>
                ))}
              </div>
              <div className="text-[12px]">
                {YSF_LEAGUES.map(l => {
                  const t = s.tables[l.sport].find(x => x.teamId === r.teamId)
                  const on = s.live.includes(l.sport) && t
                  return (
                    <div key={l.sport} className="grid grid-cols-[52px_40px_1fr_auto] gap-2 py-1 border-t border-white/25">
                      <span className="ui font-bold opacity-90 ysf-case">{l.code}</span>
                      <span className="font-bold">{on ? `#${t!.rk}` : '—'}</span>
                      <span>{on ? t!.rec : '—'}</span>
                      <span className="text-right tabular-nums">{on ? t!.pf.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}</span>
                    </div>
                  )
                })}
              </div>
            </Link>
          )
        })}
      </section>
    </>
  )
}
