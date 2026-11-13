import { db } from '@/db'
import { teams } from '@/db/schema'
import { and, eq, asc } from 'drizzle-orm'
import { YSF_LEAGUE_ID } from '@/lib/ysf'
import NavbarClient from './NavbarClient'
import ScoreStrip from './ysf/ScoreStrip'

// Server half of the ySF header: loads the 12 clubs for the Clubs dropdown.
export default async function Navbar() {
  let clubs: { id: string; name: string; abbreviation: string; logo: string | null }[] = []
  try {
    clubs = await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation, logo: teams.logo })
      .from(teams).where(and(eq(teams.leagueId, YSF_LEAGUE_ID), eq(teams.archived, false))).orderBy(asc(teams.name))
  } catch { /* league not imported yet */ }
  return <NavbarClient clubs={clubs} leagueId={YSF_LEAGUE_ID} strip={<ScoreStrip />} />
}
