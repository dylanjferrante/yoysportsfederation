import { db } from '@/db'
import { teamManagers, leagues, leagueMembers } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

// Is this user a commissioner of the league — the primary commissioner OR a
// member granted the CO_COMMISSIONER role? Use this for commissioner-gated
// actions so co-commissioners are honored, not just leagues.commissionerId.
export async function isCommissioner(leagueId: string, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  const [lg] = await db.select({ c: leagues.commissionerId }).from(leagues).where(eq(leagues.id, leagueId)).limit(1)
  if (lg?.c === userId) return true
  const [m] = await db.select({ role: leagueMembers.role }).from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId))).limit(1)
  return m?.role === 'CO_COMMISSIONER'
}

// Co-managers: additional users a franchise's owner (or the commissioner) has
// granted full management rights — lineups, adds/drops, trades. The primary
// owner is still `teams.userId`; co-managers live in `team_managers`.
export async function isTeamManager(teamId: string, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  const rows = await db.select({ id: teamManagers.id }).from(teamManagers)
    .where(and(eq(teamManagers.teamId, teamId), eq(teamManagers.userId, userId))).limit(1)
  return rows.length > 0
}

// Can this user manage this franchise? Owner, a co-manager, or the commissioner.
export async function canManageTeam(
  team: { id: string; userId: string | null },
  league: { commissionerId: string | null } | null | undefined,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false
  if (team.userId === userId) return true
  if (league?.commissionerId === userId) return true
  return isTeamManager(team.id, userId)
}
