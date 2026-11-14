// ySF Site Redesign — Club page (the canvas's Club board): club picker, club band with trophy case,
// this week's matchups, and tabs — calendar; each league (season switcher, standing, roster, future
// draft picks, schedule); drafts; moves; head-to-head — from the app's database.
import Link from 'next/link'
import { YSF_LEAGUES, YSF_ART, U } from '@/lib/ysf'
import { trophyName, trophyArt } from '@/lib/ysf-trophies'
import ClubTabs from './ClubTabs'
import { loadClubPage } from '@/lib/ysf-club'

const pct = (x: number) => (x * 100 >= 99.95 ? '>99.9' : x > 0 && x < 0.001 ? '<0.1' : (x * 100).toFixed(1)) + '%'
const ord = (n: number) => `${n}${['TH', 'ST', 'ND', 'RD'][(n % 100 >= 11 && n % 100 <= 13) ? 0 : Math.min(n % 10, 4) % 4] ?? 'TH'}`
const n1 = (x: number) => x.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// `own` (the signed-in member's club): the lineup, add / drop, trade and pending tools join the club
// tabs — so My Club and your club's page are the same page.
export default async function YsfClub({ league, teamId, own = false }: { league: any; teamId: string; own?: boolean }) {
  const d = await loadClubPage(league, teamId)
  if (!d) return <div className="card p-8 text-center font-semibold text-ink-500">Club not found</div>
  const { s, C, club, ownerRow, cupRow, trophies, bio, thisWeek, cur, calendar, leagues, drafts, moves, h2h } = d
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
              <span className="font-display text-[10px] sm:text-[11px] font-bold tracking-[.06em] leading-none" style={{ color: on ? c.color ?? 'var(--fg)' : 'var(--muted)' }}>{c.abbreviation}</span>
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

      {/* the club's bio, from ysffantasy.com */}
      {bio && (
        <section className="card p-4 sm:p-5" style={{ borderTop: `4px solid ${club.color ?? '#000'}` }}>
          <div className="ui text-[12px] font-bold tracking-[.12em] mb-1.5">ABOUT THE CLUB</div>
          <p className="text-[15px] sm:text-[16px] leading-relaxed text-ink-800 max-w-[880px]"><span className="ysf-case">{bio}</span></p>
        </section>
      )}

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
