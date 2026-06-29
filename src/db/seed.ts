/**
 * Seed the database with demo leagues, teams, and realistic player data.
 * Run: npx tsx src/db/seed.ts
 */
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import path from 'path'
import fs from 'fs'

const DB_DIR = path.join(process.cwd(), 'data')
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })

const db = new Database(path.join(DB_DIR, 'nexus.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const hash = (pw: string) => bcrypt.hashSync(pw, 10)
const id = () => nanoid()

// ── Default settings ────────────────────────────────────────────────────

const NFL_ROSTER = JSON.stringify({ QB:1, RB:2, WR:3, TE:1, 'RB/WR/TE':1, K:1, DEF:1, BN:7, IR:2 })
const NBA_ROSTER = JSON.stringify({ PG:1, SG:1, SF:1, PF:1, C:1, G:1, F:1, UTIL:1, BN:4, IL:2 })
const NHL_ROSTER = JSON.stringify({ C:2, LW:2, RW:2, D:4, G:2, UTIL:1, BN:4, IR:2 })
const MLB_ROSTER = JSON.stringify({ C:1, '1B':1, '2B':1, '3B':1, SS:1, OF:3, UTIL:1, SP:4, RP:2, BN:5, DL:2 })

const NFL_SCORING = JSON.stringify({ passingYards:0.04, passingTD:4, passingInt:-2, receptions:1, receivingYards:0.1, receivingTD:6, rushingYards:0.1, rushingTD:6, fumbleLost:-2 })
const NBA_SCORING = JSON.stringify({ points:1, rebounds:1.2, assists:1.5, steals:3, blocks:3, turnovers:-1, threesMade:0.5 })
const NHL_SCORING = JSON.stringify({ goals:8, assists:5, plusMinus:2, shots:0.9, wins:10, saves:0.4, goalsAllowed:-1.5, shutout:5 })
const MLB_SCORING = JSON.stringify({ runs:1, homeRuns:4, rbi:2, stolenBases:2, strikeoutsAsPitcher:1, wins:4, saves:5, earnedRunsAllowed:-1 })

// ── Users ────────────────────────────────────────────────────────────────

const pw = hash('password123')

const userIds = {
  admin: id(), alex: id(), sam: id(), jordan: id(), taylor: id(), morgan: id(),
}

db.prepare(`INSERT OR IGNORE INTO users (id,name,email,password) VALUES (?,?,?,?)`).run(userIds.admin,  'Admin User',      'admin@nexusfantasy.com', pw)
db.prepare(`INSERT OR IGNORE INTO users (id,name,email,password) VALUES (?,?,?,?)`).run(userIds.alex,   'Alex Rivera',     'alex@example.com',       pw)
db.prepare(`INSERT OR IGNORE INTO users (id,name,email,password) VALUES (?,?,?,?)`).run(userIds.sam,    'Sam Chen',        'sam@example.com',        pw)
db.prepare(`INSERT OR IGNORE INTO users (id,name,email,password) VALUES (?,?,?,?)`).run(userIds.jordan, 'Jordan Williams', 'jordan@example.com',     pw)
db.prepare(`INSERT OR IGNORE INTO users (id,name,email,password) VALUES (?,?,?,?)`).run(userIds.taylor, 'Taylor Brooks',   'taylor@example.com',     pw)
db.prepare(`INSERT OR IGNORE INTO users (id,name,email,password) VALUES (?,?,?,?)`).run(userIds.morgan, 'Morgan Davis',    'morgan@example.com',     pw)

// ── Players ──────────────────────────────────────────────────────────────

type PlayerSeed = { id: string; name: string; sport: string; pos: string; team: string; pts: number; proj: number; status?: string }

const insertPlayer = db.prepare(
  `INSERT OR IGNORE INTO players (id,name,sport,position,eligible_positions,real_team,real_team_abbr,status,season_points,weekly_avg,projected_points)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`
)

function addPlayers(players: PlayerSeed[]) {
  for (const p of players) {
    insertPlayer.run(p.id, p.name, p.sport, p.pos, JSON.stringify([p.pos]), p.team, p.team, p.status ?? 'ACTIVE', p.pts, +(p.pts/17).toFixed(1), p.proj)
  }
}

const NFL: PlayerSeed[] = [
  { id:'nfl-mahomes', name:'Patrick Mahomes',    sport:'NFL', pos:'QB',  team:'KC',  pts:542.4, proj:30.1 },
  { id:'nfl-allen',   name:'Josh Allen',         sport:'NFL', pos:'QB',  team:'BUF', pts:498.8, proj:28.5 },
  { id:'nfl-jackson', name:'Lamar Jackson',      sport:'NFL', pos:'QB',  team:'BAL', pts:476.2, proj:26.9 },
  { id:'nfl-hurts',   name:'Jalen Hurts',        sport:'NFL', pos:'QB',  team:'PHI', pts:445.7, proj:25.4 },
  { id:'nfl-burrow',  name:'Joe Burrow',         sport:'NFL', pos:'QB',  team:'CIN', pts:398.3, proj:24.1 },
  { id:'nfl-mccaff',  name:'Christian McCaffrey',sport:'NFL', pos:'RB',  team:'SF',  pts:391.3, proj:27.2 },
  { id:'nfl-bijan',   name:'Bijan Robinson',     sport:'NFL', pos:'RB',  team:'ATL', pts:334.4, proj:21.1 },
  { id:'nfl-hall',    name:'Breece Hall',        sport:'NFL', pos:'RB',  team:'NYJ', pts:311.7, proj:19.5 },
  { id:'nfl-achane',  name:"De'Von Achane",      sport:'NFL', pos:'RB',  team:'MIA', pts:319.3, proj:20.0 },
  { id:'nfl-barkley', name:'Saquon Barkley',     sport:'NFL', pos:'RB',  team:'PHI', pts:358.1, proj:21.8 },
  { id:'nfl-henry',   name:'Derrick Henry',      sport:'NFL', pos:'RB',  team:'TEN', pts:298.4, proj:18.9 },
  { id:'nfl-lamb',    name:'CeeDee Lamb',        sport:'NFL', pos:'WR',  team:'DAL', pts:378.2, proj:22.9 },
  { id:'nfl-hill',    name:'Tyreek Hill',        sport:'NFL', pos:'WR',  team:'MIA', pts:335.1, proj:20.8 },
  { id:'nfl-jjeff',   name:'Justin Jefferson',   sport:'NFL', pos:'WR',  team:'MIN', pts:328.8, proj:20.3 },
  { id:'nfl-stbrown', name:'Amon-Ra St. Brown',  sport:'NFL', pos:'WR',  team:'DET', pts:304.9, proj:19.6 },
  { id:'nfl-nacua',   name:'Puka Nacua',         sport:'NFL', pos:'WR',  team:'LAR', pts:268.4, proj:17.2 },
  { id:'nfl-addison', name:'Jordan Addison',     sport:'NFL', pos:'WR',  team:'MIN', pts:247.1, proj:16.1 },
  { id:'nfl-kelce',   name:'Travis Kelce',       sport:'NFL', pos:'TE',  team:'KC',  pts:287.7, proj:17.4 },
  { id:'nfl-laporta', name:'Sam LaPorta',        sport:'NFL', pos:'TE',  team:'DET', pts:214.2, proj:13.1 },
  { id:'nfl-andrews', name:'Mark Andrews',       sport:'NFL', pos:'TE',  team:'BAL', pts:193.8, proj:12.9, status:'INJURED' },
  { id:'nfl-engram',  name:'Evan Engram',        sport:'NFL', pos:'TE',  team:'JAC', pts:182.9, proj:11.8 },
  { id:'nfl-tucker',  name:'Justin Tucker',      sport:'NFL', pos:'K',   team:'BAL', pts:167.3, proj:10.1 },
  { id:'nfl-49ers',   name:'49ers D/ST',         sport:'NFL', pos:'DEF', team:'SF',  pts:142.1, proj:9.4 },
  { id:'nfl-cowboys', name:'Cowboys D/ST',       sport:'NFL', pos:'DEF', team:'DAL', pts:138.7, proj:9.1 },
]

const NBA: PlayerSeed[] = [
  { id:'nba-jokic',   name:'Nikola Jokic',              sport:'NBA', pos:'C',  team:'DEN', pts:1748.2, proj:55.9 },
  { id:'nba-luka',    name:'Luka Doncic',               sport:'NBA', pos:'PG', team:'LAL', pts:1641.7, proj:52.3 },
  { id:'nba-giannis', name:'Giannis Antetokounmpo',     sport:'NBA', pos:'PF', team:'MIL', pts:1593.1, proj:50.8 },
  { id:'nba-sga',     name:'Shai Gilgeous-Alexander',   sport:'NBA', pos:'PG', team:'OKC', pts:1542.4, proj:49.2 },
  { id:'nba-embiid',  name:'Joel Embiid',               sport:'NBA', pos:'C',  team:'PHI', pts:1494.8, proj:47.6 },
  { id:'nba-tatum',   name:'Jayson Tatum',              sport:'NBA', pos:'SF', team:'BOS', pts:1419.3, proj:45.1 },
  { id:'nba-ad',      name:'Anthony Davis',             sport:'NBA', pos:'PF', team:'LAL', pts:1407.9, proj:44.7 },
  { id:'nba-curry',   name:'Stephen Curry',             sport:'NBA', pos:'PG', team:'GSW', pts:1356.2, proj:43.0 },
  { id:'nba-lebron',  name:'LeBron James',              sport:'NBA', pos:'SF', team:'LAL', pts:1338.6, proj:42.4 },
  { id:'nba-durant',  name:'Kevin Durant',              sport:'NBA', pos:'SF', team:'PHX', pts:1314.8, proj:41.6 },
  { id:'nba-wemby',   name:'Victor Wembanyama',         sport:'NBA', pos:'C',  team:'SAS', pts:1449.3, proj:46.1 },
  { id:'nba-ant',     name:'Anthony Edwards',           sport:'NBA', pos:'SG', team:'MIN', pts:1305.5, proj:41.3 },
  { id:'nba-hali',    name:'Tyrese Haliburton',         sport:'NBA', pos:'PG', team:'IND', pts:1221.2, proj:38.5 },
  { id:'nba-booker',  name:'Devin Booker',              sport:'NBA', pos:'SG', team:'PHX', pts:1182.4, proj:37.2 },
  { id:'nba-dm',      name:'Donovan Mitchell',          sport:'NBA', pos:'SG', team:'CLE', pts:1167.9, proj:36.8 },
  { id:'nba-jjr',     name:'Jaren Jackson Jr.',         sport:'NBA', pos:'PF', team:'MEM', pts:1113.1, proj:35.0 },
  { id:'nba-banchero',name:'Paolo Banchero',            sport:'NBA', pos:'PF', team:'ORL', pts:1104.8, proj:34.7 },
  { id:'nba-chet',    name:'Chet Holmgren',             sport:'NBA', pos:'C',  team:'OKC', pts:1062.4, proj:33.3 },
  { id:'nba-lillard', name:'Damian Lillard',            sport:'NBA', pos:'PG', team:'MIL', pts:1236.2, proj:39.0 },
  { id:'nba-trae',    name:'Trae Young',                sport:'NBA', pos:'PG', team:'ATL', pts:1158.6, proj:36.5 },
  { id:'nba-fox',     name:'De\'Aaron Fox',             sport:'NBA', pos:'PG', team:'SAC', pts:1141.3, proj:36.0 },
  { id:'nba-kawhi',   name:'Kawhi Leonard',             sport:'NBA', pos:'SF', team:'LAC', pts:890.2,  proj:28.2, status:'INJURED' },
]

const NHL: PlayerSeed[] = [
  { id:'nhl-mcdavid',  name:'Connor McDavid',   sport:'NHL', pos:'C',  team:'EDM', pts:386.4, proj:17.6 },
  { id:'nhl-mackinnon',name:'Nathan MacKinnon', sport:'NHL', pos:'C',  team:'COL', pts:375.9, proj:17.1 },
  { id:'nhl-draisaitl',name:'Leon Draisaitl',   sport:'NHL', pos:'C',  team:'EDM', pts:352.8, proj:16.0 },
  { id:'nhl-pastrnak', name:'David Pastrnak',   sport:'NHL', pos:'RW', team:'BOS', pts:329.7, proj:15.0 },
  { id:'nhl-matthews', name:'Auston Matthews',  sport:'NHL', pos:'C',  team:'TOR', pts:319.2, proj:14.5 },
  { id:'nhl-makar',    name:'Cale Makar',       sport:'NHL', pos:'D',  team:'COL', pts:310.8, proj:14.1 },
  { id:'nhl-shesterkin',name:'Igor Shesterkin', sport:'NHL', pos:'G',  team:'NYR', pts:291.9, proj:13.2 },
  { id:'nhl-rantanen', name:'Mikko Rantanen',   sport:'NHL', pos:'RW', team:'CAR', pts:280.4, proj:12.8 },
  { id:'nhl-kaprizov', name:'Kirill Kaprizov',  sport:'NHL', pos:'LW', team:'MIN', pts:274.1, proj:12.5 },
  { id:'nhl-mtkachuk', name:'Matthew Tkachuk',  sport:'NHL', pos:'LW', team:'FLA', pts:268.8, proj:12.2 },
  { id:'nhl-point',    name:'Brayden Point',    sport:'NHL', pos:'C',  team:'TBL', pts:260.4, proj:11.8 },
  { id:'nhl-josi',     name:'Roman Josi',       sport:'NHL', pos:'D',  team:'NSH', pts:252.0, proj:11.4 },
  { id:'nhl-fox',      name:'Adam Fox',         sport:'NHL', pos:'D',  team:'NYR', pts:245.7, proj:11.1 },
  { id:'nhl-pettersson',name:'Elias Pettersson',sport:'NHL', pos:'C',  team:'VAN', pts:237.3, proj:10.7 },
  { id:'nhl-robertson',name:'Jason Robertson',  sport:'NHL', pos:'LW', team:'DAL', pts:231.0, proj:10.4 },
  { id:'nhl-barkov',   name:'Aleksander Barkov',sport:'NHL', pos:'C',  team:'FLA', pts:247.8, proj:11.2 },
  { id:'nhl-btkachuk', name:'Brady Tkachuk',    sport:'NHL', pos:'LW', team:'OTT', pts:228.9, proj:10.3 },
  { id:'nhl-aho',      name:'Sebastian Aho',    sport:'NHL', pos:'C',  team:'CAR', pts:210.0, proj:9.5 },
  { id:'nhl-huberdeau',name:'Jonathan Huberdeau',sport:'NHL',pos:'LW', team:'CGY', pts:196.4, proj:8.9 },
  { id:'nhl-vasilevskiy',name:'Andrei Vasilevskiy',sport:'NHL',pos:'G',team:'TBL', pts:278.3, proj:12.6 },
]

const MLB: PlayerSeed[] = [
  { id:'mlb-ohtani',   name:'Shohei Ohtani',       sport:'MLB', pos:'SP',  team:'LAD', pts:714.1, proj:40.3 },
  { id:'mlb-acuna',    name:'Ronald Acuna Jr.',     sport:'MLB', pos:'OF',  team:'ATL', pts:657.7, proj:37.0, status:'INJURED' },
  { id:'mlb-judge',    name:'Aaron Judge',          sport:'MLB', pos:'OF',  team:'NYY', pts:669.4, proj:37.7 },
  { id:'mlb-alvarez',  name:'Yordan Alvarez',       sport:'MLB', pos:'OF',  team:'HOU', pts:625.8, proj:35.2 },
  { id:'mlb-freeman',  name:'Freddie Freeman',      sport:'MLB', pos:'1B',  team:'LAD', pts:598.2, proj:33.6 },
  { id:'mlb-soto',     name:'Juan Soto',            sport:'MLB', pos:'OF',  team:'NYM', pts:579.1, proj:32.5 },
  { id:'mlb-ramirez',  name:'Jose Ramirez',         sport:'MLB', pos:'3B',  team:'CLE', pts:571.6, proj:32.0 },
  { id:'mlb-wittjr',   name:'Bobby Witt Jr.',       sport:'MLB', pos:'SS',  team:'KC',  pts:559.9, proj:31.3 },
  { id:'mlb-betts',    name:'Mookie Betts',         sport:'MLB', pos:'SS',  team:'LAD', pts:591.8, proj:33.2 },
  { id:'mlb-henderson',name:'Gunnar Henderson',     sport:'MLB', pos:'SS',  team:'BAL', pts:529.2, proj:29.7 },
  { id:'mlb-vladjr',   name:'Vladimir Guerrero Jr.',sport:'MLB', pos:'1B',  team:'TOR', pts:502.6, proj:28.1 },
  { id:'mlb-alonso',   name:'Pete Alonso',          sport:'MLB', pos:'1B',  team:'NYM', pts:491.3, proj:27.4 },
  { id:'mlb-rutschman',name:'Adley Rutschman',      sport:'MLB', pos:'C',   team:'BAL', pts:448.8, proj:25.0 },
  { id:'mlb-wheeler',  name:'Zack Wheeler',         sport:'MLB', pos:'SP',  team:'PHI', pts:487.9, proj:27.2 },
  { id:'mlb-cole',     name:'Gerrit Cole',          sport:'MLB', pos:'SP',  team:'NYY', pts:464.3, proj:25.9 },
  { id:'mlb-strider',  name:'Spencer Strider',      sport:'MLB', pos:'SP',  team:'ATL', pts:494.7, proj:27.6, status:'INJURED' },
  { id:'mlb-webb',     name:'Logan Webb',           sport:'MLB', pos:'SP',  team:'SF',  pts:411.4, proj:22.8 },
  { id:'mlb-valdez',   name:'Framber Valdez',       sport:'MLB', pos:'SP',  team:'HOU', pts:421.6, proj:23.4 },
  { id:'mlb-díaz',     name:'Edwin Díaz',           sport:'MLB', pos:'RP',  team:'NYM', pts:287.3, proj:16.0 },
  { id:'mlb-hader',    name:'Josh Hader',           sport:'MLB', pos:'RP',  team:'HOU', pts:271.8, proj:15.1 },
]

addPlayers(NFL)
addPlayers(NBA)
addPlayers(NHL)
addPlayers(MLB)

// ── Leagues ──────────────────────────────────────────────────────────────

const leagueIds = {
  nfl: id(), nba: id(), nhl: id(), mlb: id(),
}

const insertLeague = db.prepare(`
  INSERT OR IGNORE INTO leagues
  (id,name,sport,season,commissioner_id,status,max_teams,roster_settings,scoring_settings,
   draft_type,draft_status,playoff_teams,playoff_start_week,regular_season_weeks)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`)

insertLeague.run(leagueIds.nfl, 'Premier Fantasy Football', 'NFL', '2025-26', userIds.admin, 'ACTIVE', 12, NFL_ROSTER, NFL_SCORING, 'SNAKE', 'COMPLETED', 4, 15, 14)
insertLeague.run(leagueIds.nba, 'Elite Hoops Fantasy',      'NBA', '2025-26', userIds.admin, 'ACTIVE', 10, NBA_ROSTER, NBA_SCORING, 'SNAKE', 'COMPLETED', 4, 20, 19)
insertLeague.run(leagueIds.nhl, 'Pro Hockey Fantasy',       'NHL', '2025-26', userIds.admin, 'ACTIVE', 10, NHL_ROSTER, NHL_SCORING, 'SNAKE', 'COMPLETED', 4, 20, 19)
insertLeague.run(leagueIds.mlb, 'Diamond Fantasy Baseball', 'MLB', '2025',    userIds.admin, 'ACTIVE', 12, MLB_ROSTER, MLB_SCORING, 'SNAKE', 'COMPLETED', 4, 22, 21)

// Add commissioner as member
const insertMember = db.prepare(`INSERT OR IGNORE INTO league_members (id,league_id,user_id,role) VALUES (?,?,?,?)`)
for (const lid of Object.values(leagueIds)) {
  insertMember.run(id(), lid, userIds.admin, 'COMMISSIONER')
}

// ── Teams ────────────────────────────────────────────────────────────────

type TeamSeed = { uid: string; name: string; abbr: string; w: number; l: number; pf: number; pa: number }

const insertTeam = db.prepare(`
  INSERT OR IGNORE INTO teams (id,name,abbreviation,user_id,league_id,wins,losses,points_for,points_against)
  VALUES (?,?,?,?,?,?,?,?,?)
`)
const insertRoster = db.prepare(`INSERT OR IGNORE INTO rosters (id,team_id,player_id,slot,acquisition_type) VALUES (?,?,?,?,?)`)
const insertPick = db.prepare(`INSERT OR IGNORE INTO draft_picks (id,sport,round,year,league_id,original_team_id,current_team_id) VALUES (?,?,?,?,?,?,?)`)

function buildTeams(sport: string, leagueId: string, playerIds: string[], teams: TeamSeed[]) {
  const teamIds: string[] = []
  for (const t of teams) {
    const tid = id()
    teamIds.push(tid)
    insertTeam.run(tid, t.name, t.abbr, t.uid, leagueId, t.w, t.l, t.pf, t.pa)
    insertMember.run(id(), leagueId, t.uid, 'MEMBER')
  }

  // Distribute players evenly across teams
  const perTeam = Math.floor(playerIds.length / teams.length)
  for (let i = 0; i < teamIds.length; i++) {
    const slice = playerIds.slice(i * perTeam, (i + 1) * perTeam)
    slice.forEach((pid, idx) => {
      insertRoster.run(id(), teamIds[i], pid, idx === 0 ? 'QB' : 'BN', 'DRAFT')
    })
    // Give each team draft picks for next 3 rounds
    for (let r = 1; r <= 3; r++) {
      const pickId = id()
      insertPick.run(pickId, sport, r, 2026, leagueId, teamIds[i], teamIds[i])
    }
  }

  return teamIds
}

const nflTeamDefs: TeamSeed[] = [
  { uid: userIds.admin,  name: 'The Mahomes Effect',  abbr: 'TME', w:9,  l:4, pf:1847.2, pa:1620.1 },
  { uid: userIds.alex,   name: 'Buffalo Stampede',    abbr: 'BUF', w:8,  l:5, pf:1720.5, pa:1698.3 },
  { uid: userIds.sam,    name: 'Gridiron Generals',   abbr: 'GGN', w:7,  l:6, pf:1680.1, pa:1671.2 },
  { uid: userIds.jordan, name: 'End Zone Enforcers',  abbr: 'EZE', w:6,  l:7, pf:1590.4, pa:1614.5 },
  { uid: userIds.taylor, name: 'Touchdown Factory',   abbr: 'TDF', w:5,  l:8, pf:1510.7, pa:1598.8 },
  { uid: userIds.morgan, name: 'Blitz Battalion',     abbr: 'BLZ', w:4,  l:9, pf:1420.3, pa:1567.9 },
]
const nbaTeamDefs: TeamSeed[] = [
  { uid: userIds.admin,  name: 'Nikola\'s Nuggets',   abbr: 'NNG', w:15, l:4, pf:5841.6, pa:5200.1 },
  { uid: userIds.alex,   name: 'Laker Nation',        abbr: 'LKN', w:12, l:7, pf:5580.2, pa:5410.3 },
  { uid: userIds.sam,    name: 'Three Point Clinic',  abbr: 'TPC', w:10, l:9, pf:5240.8, pa:5190.7 },
  { uid: userIds.jordan, name: 'Rim Rockers',         abbr: 'RMR', w:9,  l:10,pf:5110.3, pa:5144.2 },
  { uid: userIds.taylor, name: 'Paint Predators',     abbr: 'PPR', w:7,  l:12,pf:4890.1, pa:4997.3 },
]
const nhlTeamDefs: TeamSeed[] = [
  { uid: userIds.admin,  name: 'McDavid Machine',     abbr: 'MCM', w:18, l:4,  pf:824.3, pa:701.2 },
  { uid: userIds.alex,   name: 'Hat Trick Heroes',    abbr: 'HTH', w:15, l:7,  pf:790.1, pa:741.6 },
  { uid: userIds.sam,    name: 'Power Play Pros',     abbr: 'PPP', w:13, l:9,  pf:761.5, pa:749.8 },
  { uid: userIds.jordan, name: 'Puck Dominators',     abbr: 'PKD', w:10, l:12, pf:720.8, pa:744.1 },
  { uid: userIds.taylor, name: 'Blue Line Blitz',     abbr: 'BLB', w:7,  l:15, pf:688.2, pa:780.3 },
]
const mlbTeamDefs: TeamSeed[] = [
  { uid: userIds.admin,  name: 'Ohtani Universe',     abbr: 'OTN', w:55, l:35, pf:1924.7, pa:1710.3 },
  { uid: userIds.alex,   name: 'Diamond Dogs',        abbr: 'DMD', w:50, l:40, pf:1845.3, pa:1798.9 },
  { uid: userIds.sam,    name: 'Slugger Society',     abbr: 'SLG', w:46, l:44, pf:1780.9, pa:1764.2 },
  { uid: userIds.jordan, name: 'ERA Kings',           abbr: 'ERK', w:42, l:48, pf:1690.2, pa:1720.7 },
  { uid: userIds.taylor, name: 'RBI Royals',          abbr: 'RBI', w:38, l:52, pf:1598.4, pa:1643.1 },
  { uid: userIds.morgan, name: 'Strikeout Squad',     abbr: 'STK', w:32, l:58, pf:1480.1, pa:1601.4 },
]

const nflPlayerIds = NFL.map(p => p.id)
const nbaPlayerIds = NBA.map(p => p.id)
const nhlPlayerIds = NHL.map(p => p.id)
const mlbPlayerIds = MLB.map(p => p.id)

const nflTeamIds = buildTeams('NFL', leagueIds.nfl, nflPlayerIds, nflTeamDefs)
const nbaTeamIds = buildTeams('NBA', leagueIds.nba, nbaPlayerIds, nbaTeamDefs)
const nhlTeamIds = buildTeams('NHL', leagueIds.nhl, nhlPlayerIds, nhlTeamDefs)
const mlbTeamIds = buildTeams('MLB', leagueIds.mlb, mlbPlayerIds, mlbTeamDefs)

// ── Sample Cross-Sport Trade ─────────────────────────────────────────────

// Get a pick that belongs to nflTeamIds[0]
const nflPick = db.prepare(`SELECT id FROM draft_picks WHERE sport='NFL' AND round=1 AND current_team_id=? LIMIT 1`).get(nflTeamIds[0]) as {id:string} | undefined

if (nflPick) {
  const tradeId = id()
  db.prepare(`INSERT OR IGNORE INTO trades (id,initiator_id,recipient_id,status,note) VALUES (?,?,?,?,?)`).run(
    tradeId, nflTeamIds[0], nbaTeamIds[0],
    'PENDING',
    'Cross-sport blockbuster: my NFL 1st round pick for your NBA star. Let\'s make a deal!'
  )
  db.prepare(`INSERT OR IGNORE INTO trade_items (id,trade_id,direction,pick_id) VALUES (?,?,?,?)`).run(id(), tradeId, 'GIVING', nflPick.id)
  db.prepare(`INSERT OR IGNORE INTO trade_items (id,trade_id,direction,player_id) VALUES (?,?,?,?)`).run(id(), tradeId, 'RECEIVING', 'nba-luka')
}

// ── Sample Matchups (current week) ──────────────────────────────────────

const insertMatchup = db.prepare(`INSERT OR IGNORE INTO matchups (id,league_id,week,home_team_id,away_team_id,home_score,away_score,is_complete) VALUES (?,?,?,?,?,?,?,?)`)

insertMatchup.run(id(), leagueIds.nfl, 11, nflTeamIds[0], nflTeamIds[1], 142.4, 138.2, 0)
insertMatchup.run(id(), leagueIds.nfl, 11, nflTeamIds[2], nflTeamIds[3], 119.7, 127.8, 0)
insertMatchup.run(id(), leagueIds.nba, 12, nbaTeamIds[0], nbaTeamIds[1], 389.1, 362.4, 0)
insertMatchup.run(id(), leagueIds.nhl, 10, nhlTeamIds[0], nhlTeamIds[2], 62.4,  58.1,  0)
insertMatchup.run(id(), leagueIds.mlb, 14, mlbTeamIds[0], mlbTeamIds[1], 88.7,  91.2,  1)

db.close()
console.log('✅ Database seeded successfully!')
console.log('   Login: admin@nexusfantasy.com / password123')
console.log('   Or any user: alex@example.com, sam@example.com, etc.')
