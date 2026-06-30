import { db } from '@/db'
import { leagues, activity, teams, players } from '@/db/schema'
import { eq, desc, and, notInArray, inArray } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { safeParse } from '@/lib/utils'
import TransactionsView from './TransactionsView'

export const metadata = { title: 'Transactions' }

const SPORTS = ['NFL', 'NHL', 'NBA', 'MLB']

export default async function TransactionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()

  // Scores update automatically via the API and are never transactions.
  const rows = await db.select().from(activity)
    .where(and(eq(activity.leagueId, id), notInArray(activity.type, ['SCORES', 'SCORE'])))
    .orderBy(desc(activity.createdAt))
    .limit(300)

  // Team lookup for the "Team" column.
  const teamRows = await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation }).from(teams).where(eq(teams.leagueId, id))
  const teamById = Object.fromEntries(teamRows.map(t => [t.id, t]))

  // Pull player names out of each message and resolve position / pro team / sport.
  const nameRe = /(?:added|dropped|claimed|drafted|traded(?: for| away)?|acquired|released)\s+(.+?)\s*\((NFL|NBA|NHL|MLB)\)/i
  const parsed = rows.map(r => {
    const m = (r.message ?? '').match(nameRe)
    return { row: r, playerName: m?.[1]?.trim() ?? null, sport: m?.[2]?.toUpperCase() ?? (SPORTS.find(s => new RegExp(`\\b${s}\\b`).test(r.message ?? '')) ?? null) }
  })
  const names = [...new Set(parsed.map(p => p.playerName).filter(Boolean) as string[])]
  const playerRows = names.length
    ? await db.select({ name: players.name, position: players.position, realTeamAbbr: players.realTeamAbbr, sport: players.sport })
        .from(players).where(inArray(players.name, names))
    : []
  const playerByName = Object.fromEntries(playerRows.map(p => [p.name, p]))

  const enriched = parsed.map(({ row, playerName, sport }) => {
    const pl = playerName ? playerByName[playerName] : null
    const team = row.teamId ? teamById[row.teamId] : null
    return {
      id: row.id, type: row.type, message: row.message, createdAt: row.createdAt,
      teamName: team?.name ?? null, teamAbbr: team?.abbreviation ?? null,
      player: playerName, position: pl?.position ?? null, proTeam: pl?.realTeamAbbr ?? null,
      sport: sport ?? pl?.sport ?? null,
    }
  })

  return <TransactionsView leagueId={id} leagueName={league.name} rows={enriched as any} sportAbbr={safeParse<Record<string, string>>(league.sportAbbr, {})} />
}
