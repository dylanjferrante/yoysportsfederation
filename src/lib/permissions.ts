import { db } from '@/db'
import { teamManagers } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

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
