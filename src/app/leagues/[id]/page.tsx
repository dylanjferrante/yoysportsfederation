import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, teamRecords, matchups, users, activity, leagueHistory } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { safeParse, orderedSports } from '@/lib/utils'
import { advanceLeague } from '@/lib/advance'
import { viewSeasonOf, seasonBranding } from '@/lib/seasons'
import LeagueTabs from './LeagueTabs'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  return { title: league?.name ?? 'League' }
}

export default async function LeaguePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ season?: string }> }) {
  const session = await getServerSession(authOptions)
  const { id } = await params

  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()

  // Which season to render — current, or a past one being browsed (read-only).
  const { season: viewSeason, isPast } = viewSeasonOf(league, await searchParams)

  // Bring the season up to date automatically (skip when viewing a past season).
  if (!isPast) await advanceLeague(league)

  const franchises = await db
    .select({ team: teams, userName: users.name })
    .from(teams)
    .leftJoin(users, eq(teams.userId, users.id))
    .where(and(eq(teams.leagueId, id), isPast ? undefined : eq(teams.archived, false)))
  const branding = isPast ? await seasonBranding(id, viewSeason) : null

  const rawRecords = await db
    .select().from(teamRecords)
    .where(and(eq(teamRecords.leagueId, id), eq(teamRecords.season, viewSeason)))
  // A partially-archived club stays in standings only for sports it's still finishing;
  // hide its records for any sport it has already handed off to a replacement.
  const archivedSportsByTeam: Record<string, string[]> = {}
  const liveTeamIds = new Set<string>()
  for (const f of franchises) {
    liveTeamIds.add(f.team.id)
    archivedSportsByTeam[f.team.id] = safeParse<string[]>(f.team.archivedSports, [])
  }
  const records = isPast
    ? rawRecords
    : rawRecords.filter(r => liveTeamIds.has(r.teamId) && !(archivedSportsByTeam[r.teamId] ?? []).includes(r.sport))

  const allMatchups = await db
    .select().from(matchups)
    .where(and(eq(matchups.leagueId, id), eq(matchups.season, viewSeason)))
    .limit(1000)

  const feed = await db
    .select().from(activity)
    .where(eq(activity.leagueId, id))
    .orderBy(desc(activity.createdAt))
    .limit(12)

  const sportsEnabled = orderedSports(safeParse<string[]>(league.sportsEnabled, []), league.seasonStart)
  const federationScoring = safeParse<any>(league.federationScoring, { placement: [], championBonus: 0, regularSeasonBonus: 0, includedSports: sportsEnabled })
  const rosterSettings = safeParse<Record<string, Record<string, number>>>(league.rosterSettings, {})

  // All-time aggregates for the Teams tab: combined record + titles per franchise.
  const allRecords = await db.select().from(teamRecords).where(eq(teamRecords.leagueId, id))
  const history = await db.select().from(leagueHistory).where(eq(leagueHistory.leagueId, id))
  const teamStats: Record<string, { allTime: { w: number; l: number; t: number }; fedTitles: number; sportTitles: number }> = {}
  for (const f of franchises) teamStats[f.team.id] = { allTime: { w: 0, l: 0, t: 0 }, fedTitles: 0, sportTitles: 0 }
  for (const r of allRecords) {
    const s = teamStats[r.teamId]; if (!s) continue
    s.allTime.w += r.wins ?? 0; s.allTime.l += r.losses ?? 0; s.allTime.t += r.ties ?? 0
  }
  for (const h of history) {
    const s = h.championTeamId ? teamStats[h.championTeamId] : null; if (!s) continue
    if (h.scope === 'OVERALL') s.fedTitles++; else s.sportTitles++
  }

  const teamsLite = franchises.map(f => {
    const b = branding?.[f.team.id]
    return {
      id: f.team.id, name: b?.name ?? f.team.name, abbreviation: b?.abbreviation ?? f.team.abbreviation,
      logo: b ? b.logo : f.team.logo, altLogo: (b as any)?.altLogo ?? f.team.altLogo, logoBg: (b as any)?.logoBg ?? f.team.logoBg, owner: f.userName,
      primaryColor: b?.primaryColor ?? f.team.primaryColor, secondaryColor: b?.secondaryColor ?? f.team.secondaryColor, division: f.team.division ?? null,
    }
  })

  return (
    <>
      <LeagueTabs
        leagueId={id}
        sportsEnabled={sportsEnabled}
        teams={teamsLite}
        records={records as any}
        matchups={allMatchups as any}
        federationScoring={federationScoring}
        rosterSettings={rosterSettings}
        playoffTeams={league.playoffTeams ?? 6}
        divisions={league.divisions ?? 0}
        divisionNames={safeParse<Record<string, string>>(league.divisionNames, {})}
        currentUserId={session?.user?.id}
        teamStats={teamStats}
        sportNames={safeParse<Record<string, string>>(league.sportNames, {})}
        sportAbbr={safeParse<Record<string, string>>(league.sportAbbr, {})}
        divisionLogos={safeParse<Record<string, string>>(league.divisionLogos, {})}
        divisionLogosAlt={safeParse<Record<string, string>>(league.divisionLogosAlt, {})}
        divisionLogoBg={safeParse<Record<string, boolean>>(league.divisionLogoBg, {})}
        championshipColors={safeParse<Record<string, { p?: string; s?: string }>>(league.championshipColors, {})}
      />

      {/* League activity feed */}
      <div className="card mt-8">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">League Activity</h2>
          <Link href={`/leagues/${id}/transactions`} className="text-xs font-medium text-blue-600 hover:underline">View all transactions →</Link>
        </div>
        {feed.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-400">No recent activity.</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {feed.map(a => {
              const icon = a.type === 'TRADE' ? '' : a.type === 'SCORES' ? '' : a.type === 'WAIVER' ? '' : a.type === 'DRAFT' ? '' : '•'
              return (
                <li key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="text-base leading-5">{icon}</span>
                  <div className="flex-1">
                    <p className="text-sm text-slate-700">{a.message}</p>
                    <p className="text-[11px] text-slate-400">{a.createdAt ? new Date(a.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
