import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, matchups } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { buildSchedule, buildWeeklyPairings, sportsActiveInWeek, scheduleWeeks, type ScheduleEntry } from '@/lib/defaults'
import { safeParse } from '@/lib/utils'

// Fill out the current season's matchups for the (possibly edited) schedule:
// add games for any sport/week that's now active but has none, and remove
// not-yet-played games that fall outside a sport's new window. Completed games
// are always preserved.
async function syncSeasonMatchups(leagueId: string, season: string, schedule: ScheduleEntry[], breaks: Record<string, number[]> = {}) {
  const isBreak = (sport: string, week: number) => (breaks[sport] ?? []).includes(week)
  const teamRows = await db.select({ id: teams.id }).from(teams).where(eq(teams.leagueId, leagueId))
  const teamIds = teamRows.map(t => t.id)
  if (teamIds.length < 2) return
  const pairings = buildWeeklyPairings(teamIds)
  if (!pairings.length) return
  const maxWeek = scheduleWeeks(schedule)

  const existing = await db.select().from(matchups).where(and(eq(matchups.leagueId, leagueId), eq(matchups.season, season)))
  const have = new Set(existing.map(m => `${m.sport}:${m.week}`))

  // Remove stale, unplayed games outside the new windows or on break weeks.
  for (const m of existing) {
    if (!m.isComplete && (!sportsActiveInWeek(schedule, m.week).includes(m.sport) || isBreak(m.sport, m.week))) {
      await db.delete(matchups).where(eq(matchups.id, m.id))
    }
  }

  // Add games for newly-active sport/weeks (skipping break weeks).
  const rows: any[] = []
  for (let week = 1; week <= maxWeek; week++) {
    const active = sportsActiveInWeek(schedule, week)
    if (!active.length) continue
    const pairs = pairings[(week - 1) % pairings.length]
    for (const sport of active) {
      if (isBreak(sport, week) || have.has(`${sport}:${week}`)) continue
      for (const [home, away] of pairs) {
        rows.push({ id: nanoid(), leagueId, sport, season, week, homeTeamId: home, awayTeamId: away, homeScore: 0, awayScore: 0, isComplete: false })
      }
    }
  }
  if (rows.length) await db.insert(matchups).values(rows)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (league.commissionerId !== session.user.id) return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })

  const body = await req.json()

  const allowed = [
    'name', 'description', 'isPublic', 'maxTeams', 'season',
    'logoUrl', 'divisionLogos', 'sportsEnabled', 'seasonStart', 'sportSchedule',
    'rosterSettings', 'scoringSettings', 'draftRounds', 'federationScoring',
    'draftType', 'draftDate', 'auctionBudget', 'secondsPerPick', 'autoPickEnabled', 'draftOrderMethod',
    'rookieDraftMode', 'rookieDraftRounds', 'tradeablePickYears', 'rookieDraftDates',
    'tradeDeadline', 'tradeDeadlines', 'tradeReview', 'tradeReviewHours', 'vetoVotesRequired',
    'waiverType', 'faabBudget', 'faabMode', 'waiverDay', 'waiverHour', 'waiverSchedule', 'irEligibleDesignations', 'defenseMode', 'lockDay',
    'playoffTeams', 'playoffStartWeek', 'regularSeasonWeeks', 'playoffRounds', 'playoffFormat', 'weeksPerRound', 'positionLimits', 'mlbSpCap',
    'duesAmount', 'divisions', 'sportNames', 'championshipNames', 'championshipLogos', 'breakWeeks',
    'keeperEnabled', 'keeperCount', 'salaryCapEnabled', 'salaryCap', 'capMode',
  ] as const

  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  // Serialize JSON object/array fields.
  for (const k of ['divisionLogos', 'sportsEnabled', 'rosterSettings', 'scoringSettings', 'draftRounds', 'federationScoring', 'sportSchedule', 'rookieDraftRounds', 'regularSeasonWeeks', 'tradeDeadlines', 'waiverSchedule', 'irEligibleDesignations', 'positionLimits', 'rookieDraftDates', 'sportNames', 'championshipNames', 'championshipLogos', 'breakWeeks']) {
    if (k in update && typeof update[k] !== 'string') update[k] = JSON.stringify(update[k])
  }

  // Recompute the schedule if sports, the season anchor, or any sport's
  // regular-season length changed (so per-sport playoff start stays correct) —
  // unless the client sent an explicit, fully-edited schedule, which wins.
  if (!('sportSchedule' in update) && ('sportsEnabled' in update || 'seasonStart' in update || 'regularSeasonWeeks' in update)) {
    const sportsEnabled = 'sportsEnabled' in update
      ? safeParse<string[]>(update.sportsEnabled as string, [])
      : safeParse<string[]>(league.sportsEnabled, [])
    const seasonStart = (update.seasonStart as string) ?? league.seasonStart ?? 'FOOTBALL'
    const seasonWeeks = safeParse<Record<string, number>>((update.regularSeasonWeeks as string) ?? league.regularSeasonWeeks, {})
    update.sportSchedule = JSON.stringify(buildSchedule(seasonStart, sportsEnabled, seasonWeeks))
  }

  const [updated] = await db.update(leagues).set(update).where(eq(leagues.id, id)).returning()

  // If the schedule or break weeks changed, fill out the season's matchups to match.
  if ('sportSchedule' in update || 'breakWeeks' in update) {
    const schedule = safeParse<ScheduleEntry[]>((update.sportSchedule as string) ?? updated.sportSchedule, [])
    const breaks = safeParse<Record<string, number[]>>(updated.breakWeeks, {})
    if (schedule.length) await syncSeasonMatchups(id, updated.season, schedule, breaks)
  }

  return NextResponse.json(updated)
}
