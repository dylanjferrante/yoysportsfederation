// ySF Site Redesign — The Federation Report: a weekly issue written from the standings, results
// and moves. Each federation week's issue is kept (the current one refreshes until the week ends),
// so past issues stay readable from the archive.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { leagues } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { YSF_LEAGUE_ID, YSF_LEAGUES, YSF_ART, U } from '@/lib/ysf'
import { loadStandings, loadWeek, loadMoves } from '@/lib/ysf-data'
import { writeStories, type Headline, type Section } from '@/lib/ysf-stories'
import { weekDateRange } from '@/lib/defaults'

export const metadata = { title: 'ySF · The Federation Report' }

type Issue = { headline: string; dek: string; heads: Headline[]; sections: Section[]; clubs: Record<string, { name: string; abbreviation: string; logo: string | null }> }
type Row = { week: number; season: string; published: string; data: string }

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ issue?: string }> }) {
  const { id } = await params
  if (id !== YSF_LEAGUE_ID) redirect(`/leagues/${id}/news`)
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  const sp = await searchParams

  // write this week's issue and keep it (dated mid-day on the week's Monday, so DST never shifts the date)
  const s = await loadStandings(league)
  const wk = await loadWeek(league)
  const { start } = weekDateRange(league.season, wk.thisWeek)
  const { moves, trades } = await loadMoves(id, league.season)
  const since = Date.now() - 7 * 864e5
  const recent = moves.filter(m => m.season === league.season && Date.parse(m.when) >= since)
  const st = writeStories(s, { moves: recent, trades: trades.filter(t => t.season === league.season) })
  const cur: Issue = { ...st, clubs: Object.fromEntries(Object.values(s.clubs).map(c => [c.id, { name: c.name, abbreviation: c.abbreviation, logo: c.logo }])) }
  db.run(sql`CREATE TABLE IF NOT EXISTS ysf_report_issues (season TEXT NOT NULL, week INTEGER NOT NULL, published TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (season, week))`)
  db.run(sql`INSERT INTO ysf_report_issues (season, week, published, data) VALUES (${league.season}, ${wk.thisWeek}, ${new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12).toISOString()}, ${JSON.stringify(cur)})
    ON CONFLICT(season, week) DO UPDATE SET data = excluded.data, published = excluded.published`)
  const all = db.all<Row>(sql`SELECT season, week, published, data FROM ysf_report_issues ORDER BY season, week`)
  const issues = all.map((r, i) => ({ ...r, n: i + 1 }))
  const pick = issues.find(r => String(r.n) === sp.issue) ?? issues[issues.length - 1]
  const is: Issue = JSON.parse(pick.data)
  const C = is.clubs
  const dt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleDateString('en-US', { ...o, timeZone: 'America/New_York' })
  const L = (sport?: string) => YSF_LEAGUES.find(l => l.sport === sport)
  const isCur = pick === issues[issues.length - 1]

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_260px] items-start">
      <article className="min-w-0">
        <header className="text-center pb-6 border-b-4 border-black">
          <img src={YSF_ART.primaryOnWhite} alt="yoy Sports Federation" className="h-16 w-auto mx-auto" />
          <h1 className="disp text-[40px] sm:text-[64px] font-extrabold leading-[.9] mt-4">THE FEDERATION REPORT</h1>
          <div className="ui text-[12px] sm:text-[13px] tracking-[.16em] text-ink-500 mt-3">
            {U(`Week of ${dt(pick.published, { month: 'short', day: 'numeric', year: 'numeric' })} · Issue ${pick.n} · ${pick.season.replace('-', '–')}`)}
          </div>
        </header>

        <section className="py-8 border-b border-ink-100">
          <h2 className="disp text-[36px] sm:text-[56px] font-extrabold leading-[.92]"><span className="ysf-case">{U(is.headline)}</span></h2>
          <p className="text-[17px] leading-relaxed text-ink-800 mt-4 max-w-[720px]">{is.dek}</p>
        </section>

        {is.sections.map((x, i) => (
          <section key={i} className="py-6 border-b border-ink-100 grid gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
            <div className="flex sm:flex-col items-center sm:items-start gap-3">
              <div className="ui text-[13px] font-bold tracking-[.14em] flex items-center gap-2" style={{ color: L(x.sport)?.color ?? '#000' }}>
                {L(x.sport) && <img src={YSF_ART.leagueSymbol(L(x.sport)!.key, 'white')} alt="" className="w-6 h-6 object-contain" />}
                <span className="ysf-case">{x.topic}</span>
              </div>
              <div className="flex gap-1.5">{x.clubs.slice(0, 3).map(c => <span key={c} className="w-9 h-9 inline-flex items-center justify-center"><img src={C[c]?.logo ?? ''} alt={C[c]?.abbreviation ?? ''} className="w-9 h-9 object-contain" /></span>)}</div>
            </div>
            <p className="text-[16px] leading-relaxed text-ink-800"><span className="ysf-case">{x.body}</span></p>
          </section>
        ))}

        <section className="pt-8">
          <div className="ui text-[13px] tracking-[.18em] pb-2 border-b-2 border-black">ALSO IN THIS ISSUE</div>
          <div className="grid gap-x-8 sm:grid-cols-2">
            {is.heads.map((h, i) => (
              <div key={i} className="py-4 border-b border-ink-100">
                <div className="ui text-[11px] font-bold tracking-[.12em]" style={{ color: L(h.sport)?.color ?? '#000' }}><span className="ysf-case">{h.topic}</span></div>
                <div className="disp text-[22px] font-extrabold leading-[1.02] mt-1"><span className="ysf-case">{U(h.title)}</span></div>
                <p className="text-[13px] text-ink-500 mt-1.5 leading-snug">{h.dek}</p>
              </div>
            ))}
          </div>
        </section>
      </article>

      <aside className="lg:sticky lg:top-24">
        <div className="ui text-[13px] tracking-[.18em] pb-2 border-b-2 border-black">ARCHIVE</div>
        {[...issues].reverse().map(r => {
          const on = r === pick
          return (
            <Link key={r.n} href={`/leagues/${id}/report?issue=${r.n}`} className={`flex items-baseline justify-between gap-3 py-2.5 border-b border-ink-100 ${on ? 'font-bold' : 'text-ink-500 hover:text-black'}`}>
              <span className="ui text-[13px] tracking-[.08em]">ISSUE {r.n}</span>
              <span className="text-[13px]">{dt(r.published, { month: 'short', day: 'numeric', year: 'numeric' })}{r === issues[issues.length - 1] ? ' · current' : ''}</span>
            </Link>
          )
        })}
        {!isCur && <Link href={`/leagues/${id}/report`} className="ui inline-block mt-4 text-[12px] font-bold tracking-[.1em]">LATEST ISSUE →</Link>}
      </aside>
    </div>
  )
}
