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
      <Ticker leagueId={id} primary={primary} secondary={secondary} sportAbbr={sportAbbr} />
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* League header — styled like a club tile: primary fill, secondary ink. */}
        <div className="card overflow-hidden mb-5">
          <div className="p-4 flex items-center gap-4" style={{ background: primary, color: secondary }}>
            {league.logoUrl
              ? <img src={league.logoUrl} alt="" className="w-14 h-14 object-contain rounded-xl flex-shrink-0 p-1.5" />
              : <span className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-black flex-shrink-0" style={{ background: secondary, color: primary }}>{(league.abbreviation || league.name || '?').slice(0, 3).toUpperCase()}</span>}
            <div className="min-w-0 flex-1">
              {league.wordmark
                ? <img src={league.wordmark} alt={league.name} className="h-9 w-auto max-w-[280px] object-contain object-left" />
                : <h1 className="text-2xl font-bold leading-tight truncate">{league.name}</h1>}
              <p className="text-sm font-medium opacity-95 mt-0.5">
                {league.season} · {franchises.length} clubs
                {activeNow.length > 0 && <> · {activeNow.join(', ')} in season</>}
              </p>
            </div>
            <span className="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: secondary, color: primary }}>{league.status}</span>
          </div>
        </div>

        <LeagueNav leagueId={id} isCommissioner={isCommissioner} sideGamesEnabled={sideGamesEnabled} myTeamId={myTeamId} currentSeason={league.season} />

        {children}
      </div>
    </SportNamingProvider>
  )
}
