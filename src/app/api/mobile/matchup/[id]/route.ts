import { NextResponse } from 'next/server'
import { db } from '@/db'
import { leagues, teams, matchups, rosters, players, playerGameStats } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { RESERVE_SLOTS } from '@/lib/defaults'
import { weekGameStatus, type GameStatus } from '@/lib/schedule'
import { playerKickoff } from '@/lib/locks'
import { bearerUserId } from '@/lib/mobileAuth'

const isStarter = (slot: string) => !RESERVE_SLOTS.includes(slot)
const FINAL_RE = /final|completed|closed/i
const LIVE_RE = /in.?progress|live|q[1-4]\b|\bhalf\b|inning|period|\bot\b|delay|active|top\b|bot\b|\bmid\b|\bend\b/i

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!bearerUserId(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const [m] = await db.select().from(matchups).where(eq(matchups.id, id)).limit(1)
  if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [league] = await db.select().from(leagues).where(eq(leagues.id, m.leagueId)).limit(1)
  const season = m.season ?? league?.season ?? ''
  const now = Date.now()
  const statusMap = await weekGameStatus(m.sport, season, m.week)

  async function side(teamId: string | null) {
    if (!teamId) return null
    const [team] = await db.select({ name: teams.name, abbr: teams.abbreviation }).from(teams).where(eq(teams.id, teamId)).limit(1)
    const rows = await db.select({ slot: rosters.slot, name: players.name, position: players.position, abbr: players.realTeamAbbr, projected: players.projectedPoints, points: playerGameStats.points })
      .from(rosters).innerJoin(players, eq(rosters.playerId, players.id))
      .leftJoin(playerGameStats, and(eq(playerGameStats.playerId, rosters.playerId), eq(playerGameStats.leagueId, m.leagueId), eq(playerGameStats.season, season), eq(playerGameStats.week, m.week)))
      .where(and(eq(rosters.teamId, teamId), eq(rosters.sport, m.sport)))
    const starters = rows.filter(r => isStarter(r.slot))
    const out = starters.map(r => {
      const gs: GameStatus | undefined = r.abbr ? statusMap?.[r.abbr] : undefined
      const kickoff = gs?.kickoff ?? playerKickoff(m.sport, r.abbr, season, m.week)
      const status = gs?.status ?? null
      let bucket: 'final' | 'live' | 'pending'
      if (m.isComplete || r.points != null) bucket = 'final'
      else if (status && FINAL_RE.test(status)) bucket = 'final'
      else if (status && LIVE_RE.test(status)) bucket = 'live'
      else if (kickoff != null && now >= kickoff) bucket = 'live'
      else bucket = 'pending'
      const label = bucket === 'final' ? 'Final'
        : bucket === 'live' ? (status && !FINAL_RE.test(status) ? status : 'In progress')
        : kickoff != null ? new Date(kickoff).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'Scheduled'
      return { slot: r.slot, name: r.name, position: r.position, abbr: r.abbr, points: r.points, projected: r.projected ?? 0, bucket, label }
    }).sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    return {
      team: team?.name ?? '—', abbr: team?.abbr ?? '',
      players: out,
      final: out.filter(p => p.bucket === 'final').length,
      live: out.filter(p => p.bucket === 'live').length,
      pending: out.filter(p => p.bucket === 'pending').length,
      ptsIn: +out.reduce((s, p) => s + (p.points ?? 0), 0).toFixed(1),
      projLeft: +out.filter(p => p.bucket !== 'final').reduce((s, p) => s + (p.projected ?? 0), 0).toFixed(1),
    }
  }

  return NextResponse.json({
    sport: m.sport, week: m.week, isComplete: !!m.isComplete,
    homeScore: +(m.homeScore ?? 0).toFixed(1), awayScore: +(m.awayScore ?? 0).toFixed(1),
    home: await side(m.homeTeamId), away: await side(m.awayTeamId),
  })
}
