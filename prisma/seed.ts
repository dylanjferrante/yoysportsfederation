import { PrismaClient, Sport, PlayerStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const nflPlayers = [
  { name: 'Patrick Mahomes', position: 'QB', realTeam: 'KC', points: 32.4, projected: 30.1 },
  { name: 'Josh Allen', position: 'QB', realTeam: 'BUF', points: 30.8, projected: 28.5 },
  { name: 'Lamar Jackson', position: 'QB', realTeam: 'BAL', points: 28.6, projected: 26.9 },
  { name: 'Jalen Hurts', position: 'QB', realTeam: 'PHI', points: 27.1, projected: 25.4 },
  { name: 'Dak Prescott', position: 'QB', realTeam: 'DAL', points: 24.3, projected: 22.8 },
  { name: 'Christian McCaffrey', position: 'RB', realTeam: 'SF', points: 28.9, projected: 27.2 },
  { name: 'Bijan Robinson', position: 'RB', realTeam: 'ATL', points: 22.4, projected: 21.1 },
  { name: 'Breece Hall', position: 'RB', realTeam: 'NYJ', points: 20.7, projected: 19.5 },
  { name: 'De\'Von Achane', position: 'RB', realTeam: 'MIA', points: 21.3, projected: 20.0 },
  { name: 'Saquon Barkley', position: 'RB', realTeam: 'PHI', points: 23.1, projected: 21.8 },
  { name: 'CeeDee Lamb', position: 'WR', realTeam: 'DAL', points: 24.6, projected: 22.9 },
  { name: 'Tyreek Hill', position: 'WR', realTeam: 'MIA', points: 22.1, projected: 20.8 },
  { name: 'Justin Jefferson', position: 'WR', realTeam: 'MIN', points: 21.8, projected: 20.3 },
  { name: 'Amon-Ra St. Brown', position: 'WR', realTeam: 'DET', points: 20.9, projected: 19.6 },
  { name: 'Puka Nacua', position: 'WR', realTeam: 'LAR', points: 18.4, projected: 17.2 },
  { name: 'Travis Kelce', position: 'TE', realTeam: 'KC', points: 18.7, projected: 17.4 },
  { name: 'Sam LaPorta', position: 'TE', realTeam: 'DET', points: 14.2, projected: 13.1 },
  { name: 'Mark Andrews', position: 'TE', realTeam: 'BAL', points: 13.8, projected: 12.9, status: 'INJURED' as const },
  { name: 'Evan Engram', position: 'TE', realTeam: 'JAC', points: 12.9, projected: 11.8 },
  { name: 'Jake Ferguson', position: 'TE', realTeam: 'DAL', points: 11.4, projected: 10.6 },
]

const nbaPlayers = [
  { name: 'Nikola Jokic', position: 'C', realTeam: 'DEN', points: 58.2, projected: 55.9 },
  { name: 'Luka Doncic', position: 'PG', realTeam: 'LAL', points: 54.7, projected: 52.3 },
  { name: 'Giannis Antetokounmpo', position: 'PF', realTeam: 'MIL', points: 53.1, projected: 50.8 },
  { name: 'Shai Gilgeous-Alexander', position: 'PG', realTeam: 'OKC', points: 51.4, projected: 49.2 },
  { name: 'Joel Embiid', position: 'C', realTeam: 'PHI', points: 49.8, projected: 47.6 },
  { name: 'Jayson Tatum', position: 'SF', realTeam: 'BOS', points: 47.3, projected: 45.1 },
  { name: 'Anthony Davis', position: 'PF', realTeam: 'LAL', points: 46.9, projected: 44.7 },
  { name: 'Stephen Curry', position: 'PG', realTeam: 'GSW', points: 45.2, projected: 43.0 },
  { name: 'LeBron James', position: 'SF', realTeam: 'LAL', points: 44.6, projected: 42.4 },
  { name: 'Kevin Durant', position: 'SF', realTeam: 'PHX', points: 43.8, projected: 41.6 },
  { name: 'Damian Lillard', position: 'PG', realTeam: 'MIL', points: 41.2, projected: 39.0 },
  { name: 'Tyrese Haliburton', position: 'PG', realTeam: 'IND', points: 40.7, projected: 38.5 },
  { name: 'Devin Booker', position: 'SG', realTeam: 'PHX', points: 39.4, projected: 37.2 },
  { name: 'Donovan Mitchell', position: 'SG', realTeam: 'CLE', points: 38.9, projected: 36.8 },
  { name: 'Jaren Jackson Jr.', position: 'PF', realTeam: 'MEM', points: 37.1, projected: 35.0 },
  { name: 'Paolo Banchero', position: 'PF', realTeam: 'ORL', points: 36.8, projected: 34.7 },
  { name: 'Chet Holmgren', position: 'C', realTeam: 'OKC', points: 35.4, projected: 33.3 },
  { name: 'Victor Wembanyama', position: 'C', realTeam: 'SAS', points: 48.3, projected: 46.1 },
  { name: 'Anthony Edwards', position: 'SG', realTeam: 'MIN', points: 43.5, projected: 41.3 },
  { name: 'Trae Young', position: 'PG', realTeam: 'ATL', points: 38.6, projected: 36.5 },
]

const nhlPlayers = [
  { name: 'Connor McDavid', position: 'C', realTeam: 'EDM', points: 18.4, projected: 17.6 },
  { name: 'Nathan MacKinnon', position: 'C', realTeam: 'COL', points: 17.9, projected: 17.1 },
  { name: 'Leon Draisaitl', position: 'C', realTeam: 'EDM', points: 16.8, projected: 16.0 },
  { name: 'David Pastrnak', position: 'RW', realTeam: 'BOS', points: 15.7, projected: 15.0 },
  { name: 'Auston Matthews', position: 'C', realTeam: 'TOR', points: 15.2, projected: 14.5 },
  { name: 'Cale Makar', position: 'D', realTeam: 'COL', points: 14.8, projected: 14.1 },
  { name: 'Igor Shesterkin', position: 'G', realTeam: 'NYR', points: 13.9, projected: 13.2 },
  { name: 'Mikko Rantanen', position: 'RW', realTeam: 'CAR', points: 13.4, projected: 12.8 },
  { name: 'Kirill Kaprizov', position: 'LW', realTeam: 'MIN', points: 13.1, projected: 12.5 },
  { name: 'Matthew Tkachuk', position: 'LW', realTeam: 'FLA', points: 12.8, projected: 12.2 },
  { name: 'Brayden Point', position: 'C', realTeam: 'TB', points: 12.4, projected: 11.8 },
  { name: 'Roman Josi', position: 'D', realTeam: 'NSH', points: 12.0, projected: 11.4 },
  { name: 'Adam Fox', position: 'D', realTeam: 'NYR', points: 11.7, projected: 11.1 },
  { name: 'Elias Pettersson', position: 'C', realTeam: 'VAN', points: 11.3, projected: 10.7 },
  { name: 'Jason Robertson', position: 'LW', realTeam: 'DAL', points: 11.0, projected: 10.4 },
  { name: 'Anze Kopitar', position: 'C', realTeam: 'LAK', points: 10.6, projected: 10.0 },
  { name: 'Brad Marchand', position: 'LW', realTeam: 'BOS', points: 10.3, projected: 9.8 },
  { name: 'Sebastian Aho', position: 'C', realTeam: 'CAR', points: 10.0, projected: 9.5 },
  { name: 'Aleksander Barkov', position: 'C', realTeam: 'FLA', points: 11.8, projected: 11.2 },
  { name: 'Brady Tkachuk', position: 'LW', realTeam: 'OTT', points: 10.9, projected: 10.3 },
]

const mlbPlayers = [
  { name: 'Shohei Ohtani', position: 'DH/SP', realTeam: 'LAD', points: 42.1, projected: 40.3 },
  { name: 'Ronald Acuna Jr.', position: 'OF', realTeam: 'ATL', points: 38.7, projected: 37.0, status: 'INJURED' as const },
  { name: 'Freddie Freeman', position: '1B', realTeam: 'LAD', points: 35.2, projected: 33.6 },
  { name: 'Mookie Betts', position: 'SS', realTeam: 'LAD', points: 34.8, projected: 33.2 },
  { name: 'Juan Soto', position: 'OF', realTeam: 'NYM', points: 34.1, projected: 32.5 },
  { name: 'Aaron Judge', position: 'OF', realTeam: 'NYY', points: 39.4, projected: 37.7 },
  { name: 'Yordan Alvarez', position: 'DH', realTeam: 'HOU', points: 36.8, projected: 35.2 },
  { name: 'Jose Ramirez', position: '3B', realTeam: 'CLE', points: 33.6, projected: 32.0 },
  { name: 'Bobby Witt Jr.', position: 'SS', realTeam: 'KC', points: 32.9, projected: 31.3 },
  { name: 'Corbin Carroll', position: 'OF', realTeam: 'ARI', points: 30.4, projected: 28.9 },
  { name: 'Zack Wheeler', position: 'SP', realTeam: 'PHI', points: 28.7, projected: 27.2 },
  { name: 'Gerrit Cole', position: 'SP', realTeam: 'NYY', points: 27.3, projected: 25.9 },
  { name: 'Spencer Strider', position: 'SP', realTeam: 'ATL', points: 29.1, projected: 27.6, status: 'INJURED' as const },
  { name: 'Framber Valdez', position: 'SP', realTeam: 'HOU', points: 24.8, projected: 23.4 },
  { name: 'Logan Webb', position: 'SP', realTeam: 'SF', points: 24.2, projected: 22.8 },
  { name: 'Adley Rutschman', position: 'C', realTeam: 'BAL', points: 26.4, projected: 25.0 },
  { name: 'William Contreras', position: 'C', realTeam: 'MIL', points: 22.1, projected: 20.8 },
  { name: 'Pete Alonso', position: '1B', realTeam: 'NYM', points: 28.9, projected: 27.4 },
  { name: 'Gunnar Henderson', position: 'SS', realTeam: 'BAL', points: 31.2, projected: 29.7 },
  { name: 'Vladimir Guerrero Jr.', position: '1B', realTeam: 'TOR', points: 29.6, projected: 28.1 },
]

async function main() {
  console.log('Seeding database...')

  // Create users
  const passwordHash = await bcrypt.hash('password123', 10)

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'commissioner@ysf.com' },
      update: {},
      create: { name: 'Commissioner Mike', email: 'commissioner@ysf.com', password: passwordHash },
    }),
    prisma.user.upsert({
      where: { email: 'alex@ysf.com' },
      update: {},
      create: { name: 'Alex Rivera', email: 'alex@ysf.com', password: passwordHash },
    }),
    prisma.user.upsert({
      where: { email: 'sam@ysf.com' },
      update: {},
      create: { name: 'Sam Chen', email: 'sam@ysf.com', password: passwordHash },
    }),
    prisma.user.upsert({
      where: { email: 'jordan@ysf.com' },
      update: {},
      create: { name: 'Jordan Williams', email: 'jordan@ysf.com', password: passwordHash },
    }),
    prisma.user.upsert({
      where: { email: 'taylor@ysf.com' },
      update: {},
      create: { name: 'Taylor Brooks', email: 'taylor@ysf.com', password: passwordHash },
    }),
    prisma.user.upsert({
      where: { email: 'morgan@ysf.com' },
      update: {},
      create: { name: 'Morgan Davis', email: 'morgan@ysf.com', password: passwordHash },
    }),
  ])

  // Create players
  const createPlayers = async (players: typeof nflPlayers, sport: Sport) => {
    return Promise.all(
      players.map((p) =>
        prisma.player.upsert({
          where: { id: `${sport}-${p.name.replace(/\s/g, '-').toLowerCase()}` },
          update: {},
          create: {
            id: `${sport}-${p.name.replace(/\s/g, '-').toLowerCase()}`,
            name: p.name,
            sport,
            position: p.position,
            realTeam: p.realTeam,
            status: (p.status as PlayerStatus) ?? PlayerStatus.ACTIVE,
            points: p.points,
            projected: p.projected,
          },
        })
      )
    )
  }

  const allNflPlayers = await createPlayers(nflPlayers, Sport.NFL)
  const allNbaPlayers = await createPlayers(nbaPlayers, Sport.NBA)
  const allNhlPlayers = await createPlayers(nhlPlayers, Sport.NHL)
  const allMlbPlayers = await createPlayers(mlbPlayers, Sport.MLB)

  // Create leagues
  const nflLeague = await prisma.league.upsert({
    where: { id: 'league-nfl-2025' },
    update: {},
    create: { id: 'league-nfl-2025', name: 'YSFFL Premier League', sport: Sport.NFL, season: '2025-26', maxTeams: 12 },
  })
  const nbaLeague = await prisma.league.upsert({
    where: { id: 'league-nba-2025' },
    update: {},
    create: { id: 'league-nba-2025', name: 'YSFBA Elite Association', sport: Sport.NBA, season: '2025-26', maxTeams: 12 },
  })
  const nhlLeague = await prisma.league.upsert({
    where: { id: 'league-nhl-2025' },
    update: {},
    create: { id: 'league-nhl-2025', name: 'YSFHL Premier League', sport: Sport.NHL, season: '2025-26', maxTeams: 10 },
  })
  const mlbLeague = await prisma.league.upsert({
    where: { id: 'league-mlb-2025' },
    update: {},
    create: { id: 'league-mlb-2025', name: 'YSFLB Grand League', sport: Sport.MLB, season: '2025', maxTeams: 12 },
  })

  // Team definitions per league
  const nflTeams = [
    { userId: users[0].id, name: 'Mahomes Magic', abbr: 'MAH', w: 8, l: 3, pts: 1847.2 },
    { userId: users[1].id, name: 'Buffalo Bombers', abbr: 'BUF', w: 7, l: 4, pts: 1720.5 },
    { userId: users[2].id, name: 'Gridiron Gods', abbr: 'GRD', w: 6, l: 5, pts: 1680.1 },
    { userId: users[3].id, name: 'End Zone Elite', abbr: 'EZE', w: 5, l: 6, pts: 1590.4 },
    { userId: users[4].id, name: 'Touchdown Kings', abbr: 'TDK', w: 4, l: 7, pts: 1510.7 },
    { userId: users[5].id, name: 'Blitz Brigade', abbr: 'BBR', w: 3, l: 8, pts: 1420.3 },
  ]
  const nbaTeams = [
    { userId: users[0].id, name: 'Nikola\'s Nuggets', abbr: 'NNN', w: 9, l: 2, pts: 2841.6 },
    { userId: users[1].id, name: 'Laker Loyalists', abbr: 'LAL', w: 7, l: 4, pts: 2680.2 },
    { userId: users[2].id, name: 'Three Point Club', abbr: 'TPC', w: 6, l: 5, pts: 2540.8 },
    { userId: users[3].id, name: 'Rim Rockers', abbr: 'RMR', w: 5, l: 6, pts: 2410.3 },
    { userId: users[4].id, name: 'Paint Predators', abbr: 'PPR', w: 4, l: 7, pts: 2290.1 },
    { userId: users[5].id, name: 'Swish Squad', abbr: 'SWS', w: 3, l: 8, pts: 2140.9 },
  ]
  const nhlTeams = [
    { userId: users[0].id, name: 'McDavid Machine', abbr: 'MCH', w: 10, l: 2, pts: 824.3 },
    { userId: users[1].id, name: 'Hat Trick Heroes', abbr: 'HTH', w: 8, l: 4, pts: 790.1 },
    { userId: users[2].id, name: 'Power Play Pros', abbr: 'PPP', w: 7, l: 5, pts: 761.5 },
    { userId: users[3].id, name: 'Puck Dominators', abbr: 'PKD', w: 5, l: 7, pts: 720.8 },
    { userId: users[4].id, name: 'Blue Line Blitz', abbr: 'BLB', w: 4, l: 8, pts: 688.2 },
  ]
  const mlbTeams = [
    { userId: users[0].id, name: 'Ohtani Universe', abbr: 'OTN', w: 7, l: 3, pts: 1924.7 },
    { userId: users[1].id, name: 'Diamond Dogs', abbr: 'DMD', w: 6, l: 4, pts: 1845.3 },
    { userId: users[2].id, name: 'Slugger Society', abbr: 'SLG', w: 5, l: 5, pts: 1780.9 },
    { userId: users[3].id, name: 'ERA Kings', abbr: 'ERK', w: 4, l: 6, pts: 1690.2 },
    { userId: users[4].id, name: 'RBI Royals', abbr: 'RBI', w: 3, l: 7, pts: 1598.4 },
    { userId: users[5].id, name: 'Strikeout Squad', abbr: 'STK', w: 2, l: 8, pts: 1480.1 },
  ]

  const createTeams = async (
    teams: typeof nflTeams,
    leagueId: string,
    sport: Sport,
    players: { id: string }[]
  ) => {
    const created = []
    for (const t of teams) {
      const team = await prisma.team.upsert({
        where: { id: `team-${sport}-${t.abbr}` },
        update: {},
        create: {
          id: `team-${sport}-${t.abbr}`,
          name: t.name,
          abbreviation: t.abbr,
          userId: t.userId,
          leagueId,
          wins: t.w,
          losses: t.l,
          points: t.pts,
        },
      })
      created.push(team)
    }

    // Distribute players among teams (3-4 players per team)
    const chunkSize = Math.floor(players.length / teams.length)
    for (let i = 0; i < created.length; i++) {
      const slice = players.slice(i * chunkSize, (i + 1) * chunkSize)
      for (const player of slice) {
        await prisma.roster.upsert({
          where: { teamId_playerId: { teamId: created[i].id, playerId: player.id } },
          update: {},
          create: { teamId: created[i].id, playerId: player.id, isStarter: true },
        })
      }
    }

    return created
  }

  const createdNflTeams = await createTeams(nflTeams, nflLeague.id, Sport.NFL, allNflPlayers)
  const createdNbaTeams = await createTeams(nbaTeams, nbaLeague.id, Sport.NBA, allNbaPlayers)
  const createdNhlTeams = await createTeams(nhlTeams, nhlLeague.id, Sport.NHL, allNhlPlayers)
  const createdMlbTeams = await createTeams(mlbTeams, mlbLeague.id, Sport.MLB, allMlbPlayers)

  // Create draft picks for each league
  const createPicks = async (teams: typeof createdNflTeams, leagueId: string, sport: Sport) => {
    for (let round = 1; round <= 3; round++) {
      for (const team of teams) {
        await prisma.draftPick.upsert({
          where: { id: `pick-${sport}-${team.id}-r${round}-2026` },
          update: {},
          create: {
            id: `pick-${sport}-${team.id}-r${round}-2026`,
            sport,
            round,
            year: 2026,
            leagueId,
            originalTeamId: team.id,
            currentTeamId: team.id,
            isUsed: false,
          },
        })
      }
    }
  }

  await createPicks(createdNflTeams, nflLeague.id, Sport.NFL)
  await createPicks(createdNbaTeams, nbaLeague.id, Sport.NBA)
  await createPicks(createdNhlTeams, nhlLeague.id, Sport.NHL)
  await createPicks(createdMlbTeams, mlbLeague.id, Sport.MLB)

  // Create a sample pending cross-sport trade
  const trade = await prisma.trade.upsert({
    where: { id: 'trade-sample-001' },
    update: {},
    create: {
      id: 'trade-sample-001',
      initiatorId: createdNflTeams[0].id,
      recipientId: createdNbaTeams[1].id,
      status: 'PENDING',
      note: 'Cross-sport blockbuster: trading NFL picks for NBA star power!',
    },
  })

  // Giving: NFL 1st round pick
  const nflFirstPick = await prisma.draftPick.findFirst({
    where: { sport: Sport.NFL, round: 1, currentTeamId: createdNflTeams[0].id },
  })
  // Receiving: NBA player
  const nbaPlayer = allNbaPlayers[1] // Luka Doncic from team[1]'s roster

  if (nflFirstPick) {
    await prisma.tradeItem.upsert({
      where: { id: 'item-sample-001-give' },
      update: {},
      create: {
        id: 'item-sample-001-give',
        tradeId: trade.id,
        direction: 'GIVING',
        pickId: nflFirstPick.id,
      },
    })
  }

  await prisma.tradeItem.upsert({
    where: { id: 'item-sample-001-recv' },
    update: {},
    create: {
      id: 'item-sample-001-recv',
      tradeId: trade.id,
      direction: 'RECEIVING',
      playerId: nbaPlayer.id,
    },
  })

  console.log('Seeding complete!')
  console.log(`Created ${users.length} users`)
  console.log(`Created ${allNflPlayers.length + allNbaPlayers.length + allNhlPlayers.length + allMlbPlayers.length} players`)
  console.log('Login with any user: password is "password123"')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
