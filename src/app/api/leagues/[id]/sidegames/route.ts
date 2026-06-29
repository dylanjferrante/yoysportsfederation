import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/db'
import { leagues, teams, matchups, leagueMembers, users, sideGamePicks } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'

// Side games: weekly high-score pool (auto), survivor, and pick'em.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const { searchParams } = new URL(req.url)
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const season = league.season
  const sport = searchParams.get('sport') || 'NFL'

  const teamRows = await db.select({ id: teams.id, name: teams.name, abbreviation: teams.abbreviation }).from(teams).where(eq(teams.leagueId, id))
  const tname = Object.fromEntries(teamRows.map(t => [t.id, t.name]))

  const memberRows = await db.select({ userId: leagueMembers.userId, name: users.name })
    .from(leagueMembers).leftJoin(users, eq(leagueMembers.userId, users.id)).where(eq(leagueMembers.leagueId, id))

  const games = await db.select().from(matchups)
    .where(and(eq(matchups.leagueId, id), eq(matchups.sport, sport)))
  const sportGames = games.filter(g => (g.season ?? season) === season && g.homeTeamId && g.awayTeamId)

  const byWeek: Record<number, typeof sportGames> = {}
  for (const g of sportGames) (byWeek[g.week] ??= []).push(g)
  const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b)

  // ── High-score pool: weekly top scorer earns a tally ──────────────────────
  const highTally: Record<string, number> = {}
  for (const wk of weeks) {
    const done = byWeek[wk].filter(g => g.isComplete)
    if (done.length === 0) continue
    let topTeam: string | null = null, topScore = -1
    for (const g of done) {
      if ((g.homeScore ?? 0) > topScore) { topScore = g.homeScore ?? 0; topTeam = g.homeTeamId }
      if ((g.awayScore ?? 0) > topScore) { topScore = g.awayScore ?? 0; topTeam = g.awayTeamId }
    }
    if (topTeam) highTally[topTeam] = (highTally[topTeam] ?? 0) + 1
  }
  const highScore = teamRows.map(t => ({ team: t.name, teamId: t.id, weeks: highTally[t.id] ?? 0 }))
    .filter(r => r.weeks > 0).sort((a, b) => b.weeks - a.weeks)

  // ── Picks ─────────────────────────────────────────────────────────────────
  const allPicks = await db.select().from(sideGamePicks)
    .where(and(eq(sideGamePicks.leagueId, id), eq(sideGamePicks.sport, sport), eq(sideGamePicks.season, season)))
  const myPicks = session ? allPicks.filter(p => p.userId === session.user.id) : []

  // Outcome of a pick: did the picked team win its (completed) matchup?
  const gameById = Object.fromEntries(sportGames.map(g => [g.id, g]))
  const outcome = (pickedTeamId: string, matchupId: string | null): 'win' | 'loss' | 'pending' => {
    const g = matchupId ? gameById[matchupId] : null
    if (!g || !g.isComplete) return 'pending'
    const my = g.homeTeamId === pickedTeamId ? (g.homeScore ?? 0) : (g.awayScore ?? 0)
    const opp = g.homeTeamId === pickedTeamId ? (g.awayScore ?? 0) : (g.homeScore ?? 0)
    return my >= opp ? 'win' : 'loss'
  }

  // Pick'em standings: correct picks per user.
  const pickem = memberRows.map(m => {
    const mine = allPicks.filter(p => p.userId === m.userId && p.game === 'PICKEM')
    let correct = 0, decided = 0
    for (const p of mine) { const o = outcome(p.pickedTeamId, p.matchupId); if (o !== 'pending') { decided++; if (o === 'win') correct++ } }
    return { userId: m.userId, name: m.name, correct, decided, made: mine.length }
  }).filter(r => r.made > 0).sort((a, b) => b.correct - a.correct)

  // Survivor standings: alive until a completed pick loses.
  const survivor = memberRows.map(m => {
    const mine = allPicks.filter(p => p.userId === m.userId && p.game === 'SURVIVOR').sort((a, b) => a.week - b.week)
    let alive = true, survived = 0, outWeek: number | null = null
    for (const p of mine) {
      const o = outcome(p.pickedTeamId, p.matchupId)
      if (o === 'loss') { alive = false; outWeek = p.week; break }
      if (o === 'win') survived++
    }
    return { userId: m.userId, name: m.name, alive, survived, outWeek, picks: mine.map(p => ({ week: p.week, team: tname[p.pickedTeamId], teamId: p.pickedTeamId, outcome: outcome(p.pickedTeamId, p.matchupId) })) }
  }).filter(r => r.picks.length > 0).sort((a, b) => Number(b.alive) - Number(a.alive) || b.survived - a.survived)

  // Per-week matchups for picking.
  const board = weeks.map(wk => ({
    week: wk,
    games: byWeek[wk].map(g => ({ id: g.id, home: g.homeTeamId, homeName: tname[g.homeTeamId ?? ''], away: g.awayTeamId, awayName: tname[g.awayTeamId ?? ''], homeScore: g.homeScore, awayScore: g.awayScore, complete: g.isComplete })),
  }))

  return NextResponse.json({
    sport, season,
    board,
    myPicks: myPicks.map(p => ({ game: p.game, week: p.week, matchupId: p.matchupId, pickedTeamId: p.pickedTeamId })),
    standings: { highScore, pickem, survivor },
    signedIn: !!session,
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [member] = await db.select().from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, session.user.id))).limit(1)
  if (!member) return NextResponse.json({ error: 'Only league members can play' }, { status: 403 })

  const body = await req.json() as { game?: string; sport?: string; week?: number; matchupId?: string; pickedTeamId?: string }
  const { game, sport, week, matchupId, pickedTeamId } = body
  if (!game || !sport || week == null || !matchupId || !pickedTeamId)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // The matchup must exist, belong to this league, and not be locked/complete.
  const [g] = await db.select().from(matchups).where(eq(matchups.id, matchupId)).limit(1)
  if (!g || g.leagueId !== id) return NextResponse.json({ error: 'Invalid matchup' }, { status: 400 })
  if (g.isComplete) return NextResponse.json({ error: 'That matchup is already final' }, { status: 400 })
  if (g.homeTeamId !== pickedTeamId && g.awayTeamId !== pickedTeamId)
    return NextResponse.json({ error: 'Team is not in that matchup' }, { status: 400 })

  const season = league.season

  if (game === 'SURVIVOR') {
    // One pick per week; a franchise may only be used once all season.
    const prior = await db.select().from(sideGamePicks).where(and(
      eq(sideGamePicks.leagueId, id), eq(sideGamePicks.userId, session.user.id),
      eq(sideGamePicks.game, 'SURVIVOR'), eq(sideGamePicks.sport, sport), eq(sideGamePicks.season, season)))
    if (prior.some(p => p.week !== week && p.pickedTeamId === pickedTeamId))
      return NextResponse.json({ error: 'You already used that franchise — pick a different one' }, { status: 400 })
    // Replace this week's survivor pick.
    await db.delete(sideGamePicks).where(and(
      eq(sideGamePicks.leagueId, id), eq(sideGamePicks.userId, session.user.id),
      eq(sideGamePicks.game, 'SURVIVOR'), eq(sideGamePicks.sport, sport), eq(sideGamePicks.season, season), eq(sideGamePicks.week, week)))
    await db.insert(sideGamePicks).values({ id: nanoid(), leagueId: id, userId: session.user.id, game: 'SURVIVOR', sport, season, week, matchupId, pickedTeamId })
    return NextResponse.json({ ok: true })
  }

  // PICK'EM: one pick per matchup; replace if changed.
  await db.delete(sideGamePicks).where(and(
    eq(sideGamePicks.leagueId, id), eq(sideGamePicks.userId, session.user.id),
    eq(sideGamePicks.game, 'PICKEM'), eq(sideGamePicks.matchupId, matchupId)))
  await db.insert(sideGamePicks).values({ id: nanoid(), leagueId: id, userId: session.user.id, game: 'PICKEM', sport, season, week, matchupId, pickedTeamId })
  return NextResponse.json({ ok: true })
}
