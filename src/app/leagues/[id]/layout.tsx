import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, leagueHistory } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { safeParse, inSeasonNow, orderedSports } from '@/lib/utils'
import { isCommissioner as checkCommissioner } from '@/lib/permissions'
import LeagueNav from './LeagueNav'
import Ticker from './Ticker'

export default async function LeagueLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const { id } = await params

  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()

  const franchises = await db.select({ id: teams.id, userId: teams.userId }).from(teams).where(eq(teams.leagueId, id))
  const myTeamId = session?.user?.id ? franchises.find(f => f.userId === session.user!.id)?.id ?? null : null
  const sportsEnabled = orderedSports(safeParse<string[]>(league.sportsEnabled, []), league.seasonStart)
  const sportNames = safeParse<Record<string, string>>(league.sportNames, {})
  const isCommissioner = await checkCommissioner(id, session?.user?.id)

  // A sport drops out of "in season" once its champion has been crowned this season.
  const crowned = await db.select({ scope: leagueHistory.scope }).from(leagueHistory)
    .where(and(eq(leagueHistory.leagueId, id), eq(leagueHistory.season, league.season)))
  const concluded = new Set(crowned.map(c => c.scope))
  const activeNow = inSeasonNow(sportsEnabled).filter(s => !concluded.has(s))

  const sideGames = safeParse<Record<string, boolean>>(league.sideGames, {})
  const sideGamesEnabled = Object.values(sideGames).some(Boolean)

  return (
    <>
      <Ticker leagueId={id} primary={league.primaryColor ?? '#0f172a'} secondary={league.secondaryColor ?? '#fbbf24'} />
      <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-5">
        {league.logoUrl
          ? <img src={league.logoUrl} alt="" className="w-14 h-14 object-contain bg-slate-100 flex-shrink-0" />
          : <div className="w-14 h-14 rounded-2xl text-white flex items-center justify-center text-2xl flex-shrink-0" style={{ background: league.primaryColor ?? '#0f172a' }}></div>}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900">{league.name}</h1>
            <span className="badge bg-slate-100 text-slate-600">{league.status}</span>
            {activeNow.length > 0 && <span className="text-xs text-green-600 font-medium">{activeNow.join(', ')} in season</span>}
          </div>
          <p className="text-slate-500 text-sm">
            {league.season} · {franchises.length} clubs
            {isCommissioner && league.inviteCode && <> · invite <span className="font-mono font-semibold text-slate-600 tracking-wider">{league.inviteCode}</span></>}
          </p>
        </div>
      </div>

      <LeagueNav leagueId={id} isCommissioner={isCommissioner} sideGamesEnabled={sideGamesEnabled} myTeamId={myTeamId} currentSeason={league.season} />

      {children}
      </div>
    </>
  )
}
