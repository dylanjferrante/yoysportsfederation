import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, leagueHistory } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { safeParse, inSeasonNow, orderedSports, sportAbbrLabel } from '@/lib/utils'
import { isCommissioner as checkCommissioner } from '@/lib/permissions'
import { SportNamingProvider } from '@/components/SportNaming'
import LeagueNav from './LeagueNav'
import Ticker from './Ticker'
import { U } from '@/lib/ysf'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select({ name: leagues.name, logoSecondary: leagues.logoSecondary, logoUrl: leagues.logoUrl }).from(leagues).where(eq(leagues.id, id)).limit(1)
  const icon = league?.logoSecondary || league?.logoUrl
  return { title: league?.name ?? 'League', ...(icon ? { icons: { icon } } : {}) }
}

export default async function LeagueLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const { id } = await params

  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()

  const franchises = await db.select({ id: teams.id, userId: teams.userId }).from(teams).where(and(eq(teams.leagueId, id), eq(teams.archived, false)))
  const myTeamId = session?.user?.id ? franchises.find(f => f.userId === session.user!.id)?.id ?? null : null
  const sportsEnabled = orderedSports(safeParse<string[]>(league.sportsEnabled, []), league.seasonStart)
  const sportNames = safeParse<Record<string, string>>(league.sportNames, {})
  const sportAbbr = safeParse<Record<string, string>>(league.sportAbbr, {})
  const isCommissioner = await checkCommissioner(id, session?.user?.id)

  // A sport drops out of "in season" once its champion has been crowned this season.
  const crowned = await db.select({ scope: leagueHistory.scope }).from(leagueHistory)
    .where(and(eq(leagueHistory.leagueId, id), eq(leagueHistory.season, league.season)))
  const concluded = new Set(crowned.map(c => c.scope))
  const activeNow = inSeasonNow(sportsEnabled).filter(s => !concluded.has(s)).map(s => sportAbbrLabel(s, sportAbbr))

  const sideGames = safeParse<Record<string, boolean>>(league.sideGames, {})
  const sideGamesEnabled = Object.values(sideGames).some(Boolean)

  const primary = league.primaryColor ?? '#0f172a'
  const secondary = league.secondaryColor ?? '#fbbf24'

  return (
    <SportNamingProvider value={{ sportAbbr, sportNames }}>
      <div className="max-w-6xl mx-auto px-4 py-5 sm:py-8">
        {/* League header — ySF page title: eyebrow, display-face name over a 2px black rule, mark on the right. */}
        <div className="flex items-end justify-between gap-4 border-b-2 border-black pb-3.5 mb-5">
          <div className="min-w-0">
            <div className="eyebrow">{U(`${league.season.replace('-', '–')} season · ${franchises.length} clubs${activeNow.length ? ` · ${activeNow.join(', ')} in season` : ''}`)}</div>
            <h1 className="disp text-[30px] sm:text-[56px] font-extrabold leading-[.9] mt-1.5">{league.name}</h1>
          </div>
          {league.logoUrl && <img src={league.logoUrl} alt="" className="h-10 sm:h-16 w-auto object-contain flex-shrink-0" />}
        </div>

        <LeagueNav leagueId={id} isCommissioner={isCommissioner} sideGamesEnabled={sideGamesEnabled} myTeamId={myTeamId} currentSeason={league.season} />

        {children}
      </div>
      <Ticker leagueId={id} primary={primary} secondary={secondary} sportAbbr={sportAbbr} />
    </SportNamingProvider>
  )
}
