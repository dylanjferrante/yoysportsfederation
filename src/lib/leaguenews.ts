import { db } from '@/db'
import { rosters, teams, players, playerNews } from '@/db/schema'
import { eq, inArray, desc } from 'drizzle-orm'

export type NewsClub = { id: string; name: string; abbreviation: string; logo: string | null; altLogo: string | null; primaryColor: string | null; secondaryColor: string | null; logoBg: boolean | null }
export type NewsItem = {
  id: string; playerId: string; playerName: string; sport: string; position: string; realTeam: string | null; photoUrl: string | null
  category: string; headline: string; body: string | null; createdAt: string | null; club: NewsClub | null
}

// A league-wide news feed for the players a league actually rosters: real
// playerNews rows plus a synthesized item for any player currently carrying a
// non-active (injured/out) status, so the feed is useful even before a news
// provider is wired up. Each item is attributed to the club that rosters him.
export async function buildLeagueNews(leagueId: string, limit = 60): Promise<NewsItem[]> {
  const clubs = await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation, logo: teams.logo, altLogo: teams.altLogo, primaryColor: teams.primaryColor, secondaryColor: teams.secondaryColor, logoBg: teams.logoBg })
    .from(teams).where(eq(teams.leagueId, leagueId))
  const clubById = new Map(clubs.map(c => [c.id, c]))
  const clubIds = clubs.map(c => c.id)
  if (!clubIds.length) return []

  const roster = await db.select({ playerId: rosters.playerId, teamId: rosters.teamId }).from(rosters).where(inArray(rosters.teamId, clubIds))
  const clubOfPlayer = new Map<string, string>()
  for (const r of roster) if (!clubOfPlayer.has(r.playerId)) clubOfPlayer.set(r.playerId, r.teamId)
  const pids = [...clubOfPlayer.keys()]
  if (!pids.length) return []

  const pls = await db.select({ id: players.id, name: players.name, sport: players.sport, position: players.position, realTeamAbbr: players.realTeamAbbr, realTeam: players.realTeam, photoUrl: players.photoUrl, status: players.status, injuryNote: players.injuryNote })
    .from(players).where(inArray(players.id, pids))
  const plById = new Map(pls.map(p => [p.id, p]))
  const newsRows = await db.select().from(playerNews).where(inArray(playerNews.playerId, pids)).orderBy(desc(playerNews.createdAt)).limit(200)

  const clubOf = (pid: string) => clubById.get(clubOfPlayer.get(pid) ?? '') ?? null
  const items: NewsItem[] = []
  const newsPlayerIds = new Set<string>()

  for (const n of newsRows) {
    const p = plById.get(n.playerId); if (!p) continue
    newsPlayerIds.add(n.playerId)
    items.push({ id: n.id, playerId: p.id, playerName: p.name, sport: p.sport, position: p.position, realTeam: p.realTeamAbbr ?? p.realTeam, photoUrl: p.photoUrl, category: n.category ?? 'NOTE', headline: n.headline, body: n.body, createdAt: n.createdAt, club: clubOf(p.id) })
  }

  // Standing injury items for anyone not already covered by a fresh news row.
  for (const p of pls) {
    if (p.status && p.status !== 'ACTIVE' && !newsPlayerIds.has(p.id)) {
      const label = p.status.charAt(0) + p.status.slice(1).toLowerCase()
      items.push({ id: `inj-${p.id}`, playerId: p.id, playerName: p.name, sport: p.sport, position: p.position, realTeam: p.realTeamAbbr ?? p.realTeam, photoUrl: p.photoUrl, category: 'INJURY', headline: `${p.name} listed ${label}`, body: p.injuryNote || null, createdAt: null, club: clubOf(p.id) })
    }
  }

  // Dated news first (newest → oldest), standing injuries after.
  items.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  return items.slice(0, limit)
}
