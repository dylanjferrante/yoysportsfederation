// ySF app — More (from the AppMore board): every Federation, League Office and Account screen.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { teams, drafts } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { YSF_LEAGUE_ID, YSF_LEAGUES, YSF_ART } from '@/lib/ysf'
import { siteCupProjection } from '@/lib/ysf-data'
import { pct } from '@/lib/ysf-stories'

export const metadata = { title: 'ySF · More' }

const GLY: Record<string, React.ReactNode> = {
  clubs: <path d="M12 6.5l-4 1.6v3.1c0 2.4 1.7 4.4 4 5 2.3-.6 4-2.6 4-5V8.1z" />,
  moves: <path d="M8 10h8l-2.2-2.2M16 14H8l2.2 2.2" />,
  cup: <path d="M9 7h6v2.5a3 3 0 0 1-6 0zM9 8H7.5a1.5 1.5 0 0 0 1.6 2M15 8h1.5a1.5 1.5 0 0 1-1.6 2M12 12.5V15M9.8 16.5h4.4" />,
  rank: <path d="M8.5 16v-3.5M12 16V8M15.5 16v-5.5" />,
  history: <><path d="M12 8v4l2.6 1.6" /><path d="M8.3 9.6A4.3 4.3 0 1 1 7.9 12" /><path d="M7.4 7.9v1.9h1.9" /></>,
  report: <><path d="M9 7.2h4.5L15.5 9v7.8H9z" /><path d="M10.7 11.3h3M10.7 13.4h3" /></>,
  live: <><circle cx="12" cy="12" r="1.6" fill="#fff" /><path d="M8.6 8.6a4.8 4.8 0 0 0 0 6.8M15.4 8.6a4.8 4.8 0 0 1 0 6.8" /></>,
  const: <><path d="M8 7.5h5.5a2 2 0 0 1 2 2v7H10a2 2 0 0 1-2-2z" /><path d="M8 14.5a2 2 0 0 1 2-2h5.5" /></>,
  prop: <><path d="M9 15.8l.6-2.4 5.2-5.2 1.8 1.8-5.2 5.2z" /><path d="M13.6 9.4l1.8 1.8" /></>,
  memo: <><path d="M7.6 8.6h8.8v6.8H7.6z" /><path d="M7.8 8.9l4.2 3.3 4.2-3.3" /></>,
  draft: <><path d="M8 8h8M8 12h8M8 16h5" /><circle cx="16" cy="16" r="1" fill="#fff" /></>,
  trade: <path d="M8 9.5h7.5l-2-2M16 14.5H8.5l2 2" />,
  players: <><circle cx="12" cy="10" r="2.2" /><path d="M8.3 16.2a3.9 3.9 0 0 1 7.4 0" /></>,
  user: <><circle cx="12" cy="10" r="2.2" /><path d="M8.3 16.2a3.9 3.9 0 0 1 7.4 0" /></>,
}
function Icon({ bg, k }: { bg: string; k: string }) {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" className="flex-none">
      <circle cx="12" cy="12" r="12" fill={bg} /><circle cx="12" cy="12" r="9.6" fill="none" stroke="#fff" strokeWidth="1.5" />
      <g fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{GLY[k]}</g>
    </svg>
  )
}
type Item = { href: string; label: string; extra?: string; icon: React.ReactNode }
function Group({ title, items }: { title: string; items: Item[] }) {
  return (
    <section>
      <div className="ui text-[12px] tracking-[.14em] text-ink-500 px-1 pb-2">{title}</div>
      <div className="card overflow-hidden">
        {items.map((it, i) => (
          <Link key={it.href + i} href={it.href} className={`flex items-center gap-3 px-3.5 py-[11px] hover:bg-ink-50 ${i ? 'border-t border-ink-50' : ''}`}>
            {it.icon}
            <span className="flex-1 text-[15px] min-w-0"><span className="ysf-case">{it.label}</span></span>
            {it.extra && <span className="text-[13px] text-ink-400 mr-1.5 whitespace-nowrap"><span className="ysf-case">{it.extra}</span></span>}
            <span className="text-ink-200 text-[18px] leading-none">›</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default async function MorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (id !== YSF_LEAGUE_ID) redirect(`/leagues/${id}`)
  const session = await getServerSession(authOptions)
  const clubs = await db.select({ id: teams.id, abbreviation: teams.abbreviation, userId: teams.userId }).from(teams).where(and(eq(teams.leagueId, id), eq(teams.archived, false)))
  const mine = clubs.find(c => c.userId === session?.user?.id)
  const site = await siteCupProjection()
  const fav = [...(site?.teams ?? [])].sort((a: any, b: any) => b.p_win_fed_cup - a.p_win_fed_cup)[0]
  const next = (await db.select({ sport: drafts.scope, scheduledAt: drafts.startsAt, status: drafts.status }).from(drafts).where(eq(drafts.leagueId, id)))
    .filter(d => ['PENDING', 'IN_PROGRESS', 'PAUSED'].includes(String(d.status))).sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)))[0]
  const nextL: any = next ? YSF_LEAGUES.find(l => l.sport === next.sport) : null
  const b = `/leagues/${id}`
  const fmt = (d: any) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })

  return (
    <>
      <h1 className="disp text-[40px] sm:text-[64px] font-extrabold leading-[.85] border-b-2 border-black pb-3.5">MORE</h1>
      <div className="grid gap-6 md:grid-cols-2 items-start">
        <Group title="FEDERATION" items={[
          { href: `${b}/teams`, label: 'All Clubs', extra: String(clubs.length), icon: <Icon bg="#00333F" k="clubs" /> },
          { href: `${b}/transactions`, label: 'Moves', icon: <Icon bg="#000" k="moves" /> },
          { href: `${b}/cup`, label: 'Cup Race', extra: fav ? `${fav.abbr} ${pct(fav.p_win_fed_cup)}` : undefined, icon: <Icon bg="#B8860B" k="cup" /> },
          { href: `${b}/power`, label: 'Rankings', icon: <Icon bg="#7700B5" k="rank" /> },
          { href: `${b}/playoffs`, label: 'Playoffs', icon: <Icon bg="#B8860B" k="cup" /> },
          { href: `${b}/history`, label: 'History', icon: <Icon bg="#0D00B2" k="history" /> },
          { href: `${b}/records`, label: 'Records', icon: <Icon bg="#0D00B2" k="history" /> },
          { href: `${b}/report`, label: 'Federation Report', icon: <Icon bg="#4A4A4A" k="report" /> },
        ]} />
        <Group title="LEAGUES" items={YSF_LEAGUES.map(l => ({ href: `${b}/sports/${l.sport}`, label: l.name, icon: <span className="w-8 h-8 inline-flex items-center justify-center flex-none"><img src={YSF_ART.leagueSymbol(l.key, 'white')} alt="" className="w-8 h-8 object-contain" /></span> }))} />
        <Group title="LEAGUE OFFICE" items={[
          { href: `${b}/rules`, label: 'Constitution & Resolutions', icon: <Icon bg="#177245" k="const" /> },
          { href: `${b}/proposals`, label: 'Votes', icon: <Icon bg="#3A6B9E" k="prop" /> },
          { href: `${b}/draft`, label: 'Rookie Drafts', extra: next && nextL ? `${nextL.code} ${fmt(next.scheduledAt)}` : undefined, icon: <Icon bg="#ba0c2f" k="draft" /> },
        ]} />
        <Group title="MARKET" items={[
          { href: `${b}/waivers`, label: 'Players', icon: <Icon bg="#000" k="players" /> },
          { href: `${b}/trade`, label: 'Trades', icon: <Icon bg="#00333F" k="trade" /> },
        ]} />
        <Group title="ACCOUNT" items={[
          { href: `${b}/chat`, label: 'Chat', icon: <Icon bg="#e86100" k="memo" /> },
          { href: '/account', label: session?.user?.name ?? 'Sign in', extra: mine?.abbreviation, icon: <Icon bg="#00333F" k="user" /> },
        ]} />
      </div>
    </>
  )
}
