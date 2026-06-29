/**
 * Seed the database with demo leagues, teams, and realistic player data.
 * Run: npx tsx src/db/seed.ts
 */
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import path from 'path'
import fs from 'fs'
import { buildPerSportSettings, buildSchedule, buildWeeklyPairings, sportsActiveInWeek, scheduleWeeks, dynastyDraftRounds, defaultWaiverSchedule, defaultIrDesignations, DEFAULT_ROSTER, DEFAULT_ROOKIE_ROUNDS, DEFAULT_SEASON_WEEKS, RESERVE_SLOTS } from '../lib/defaults'
import { defaultFederationScoring } from '../lib/federation'
import { scorePlayer, generateStatLine } from '../lib/scoring'

const DB_DIR = path.join(process.cwd(), 'data')
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })

const db = new Database(path.join(DB_DIR, 'nexus.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const hash = (pw: string) => bcrypt.hashSync(pw, 10)
const id = () => nanoid()

// ── Users & franchise owners (12-team league) ──────────────────────────────

const pw = hash('password123')

const OWNERS = [
  { name: 'Admin User',       email: 'admin@nexusfantasy.com', team: 'Apex Dynasty',      abbr: 'APX' },
  { name: 'Alex Rivera',      email: 'alex@example.com',       team: 'Iron Wolves',       abbr: 'IRN' },
  { name: 'Sam Chen',         email: 'sam@example.com',        team: 'Thunderhawks',      abbr: 'THK' },
  { name: 'Jordan Williams',  email: 'jordan@example.com',     team: 'Vortex United',     abbr: 'VTX' },
  { name: 'Taylor Brooks',    email: 'taylor@example.com',     team: 'Crimson Titans',    abbr: 'CRM' },
  { name: 'Morgan Davis',     email: 'morgan@example.com',     team: 'Phantom Syndicate', abbr: 'PHM' },
  { name: 'Casey Nguyen',     email: 'casey@example.com',      team: 'Steel Mavericks',   abbr: 'STL' },
  { name: 'Riley Parker',     email: 'riley@example.com',      team: 'Neon Raptors',      abbr: 'NRP' },
  { name: 'Jamie Foster',     email: 'jamie@example.com',      team: 'Granite Guardians', abbr: 'GRG' },
  { name: 'Drew Bennett',     email: 'drew@example.com',       team: 'Solar Kings',       abbr: 'SOL' },
  { name: 'Quinn Murphy',     email: 'quinn@example.com',      team: 'Frost Giants',      abbr: 'FRG' },
  { name: 'Avery Bishop',     email: 'avery@example.com',      team: 'Obsidian Order',    abbr: 'OBS' },
]

const ownerIds = OWNERS.map(() => id())
const insertUser = db.prepare(`INSERT OR IGNORE INTO users (id,name,email,password) VALUES (?,?,?,?)`)
OWNERS.forEach((o, i) => insertUser.run(ownerIds[i], o.name, o.email, pw))

// ── Players ──────────────────────────────────────────────────────────────

type PlayerSeed = {
  id: string; name: string; sport: string; pos: string; team: string; pts: number; proj: number; status?: string
  externalId?: string; injuryNote?: string; photoUrl?: string | null; isRookie?: boolean; stats?: Record<string, number>
}

const insertPlayer = db.prepare(
  `INSERT OR IGNORE INTO players (id,external_id,name,sport,position,eligible_positions,real_team,real_team_abbr,status,injury_note,photo_url,is_rookie,season_points,weekly_avg,projected_points,stats)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
)

function addPlayers(players: PlayerSeed[]) {
  for (const p of players) {
    insertPlayer.run(
      p.id, p.externalId ?? null, p.name, p.sport, p.pos, JSON.stringify([p.pos]), p.team, p.team,
      p.status ?? 'ACTIVE', p.injuryNote ?? null, p.photoUrl ?? null, p.isRookie ? 1 : 0,
      p.pts, +(p.pts / 17).toFixed(1), p.proj, JSON.stringify(p.stats ?? {}),
    )
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

// ── Generated filler players ──────────────────────────────────────────────
// Real stars (above) sit at the top of each pool; we generate a deep pool of
// additional players so every team can roster 80+ players (like Fantrax).

const FIRST_NAMES = [
  'Jalen','Mason','Caleb','Trey','Brock','Dawson','Kade','Tank','Marvin','Rome',
  'Drake','Xavier','Quinn','Tyson','Bryce','Cooper','Hunter','Easton','Jaxon','Cole',
  'Malik','Deshaun','Tariq','Isaiah','Elijah','Amari','Jamal','Darius','Keenan','Devon',
  'Logan','Carter','Brady','Garrett','Connor','Riley','Cameron','Bennett','Spencer','Grant',
  'Diego','Mateo','Andres','Rafael','Carlos','Luis','Miguel','Javier','Emilio','Hugo',
  'Anton','Viktor','Niklas','Mikael','Henrik','Patrik','Erik','Oskar','Lukas','Filip',
  'Owen','Wyatt','Brennan','Tucker','Knox','Beau','Reid','Asher','Maddox','Jonah',
  'Demarcus','Tyrell','Donte','Marquise','Jaylen','Kobe','Trevon','Daquan','Rashad','Cordell',
  'Nolan','Declan','Finn','Sawyer','Holden','Pierce','Graham','Walker','Porter','Hayes',
]

const LAST_NAMES = [
  'Anderson','Brooks','Carter','Donovan','Ellis','Foster','Grayson','Hawkins','Ingram','Jennings',
  'Knox','Lawson','Mercer','Nash','Owens','Porter','Quinn','Reyes','Sutton','Tate',
  'Underwood','Vance','Walters','Yates','Zimmerman','Abbott','Boone','Castillo','Dalton','Easton',
  'Fletcher','Gibson','Hartman','Irwin','Jacobs','Keller','Larkin','Mathis','Norris','Osborne',
  'Pearson','Ramsey','Sloan','Thornton','Upton','Vaughn','Whitaker','Yorke','Ackerman','Bowers',
  'Calloway','Driscoll','Everett','Fairbanks','Goodwin','Hollis','Iverson','Jablonski','Koenig','Lindgren',
  'Maddox','Novak','Pratt','Rasmussen','Sandoval','Trevino','Vega','Westbrook','Zamora','Becker',
  'Cervantes','Delgado','Fuentes','Galvan','Herrera','Ibarra','Juarez','Lozano','Montoya','Nieves',
  'Okafor','Petrov','Quintana','Rojas','Salas','Tovar','Ulloa','Varga','Wozniak','Yashin',
]

const TEAMS: Record<string, string[]> = {
  NFL: ['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAC','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WAS'],
  NBA: ['ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GSW','HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NYK','OKC','ORL','PHI','PHX','POR','SAC','SAS','TOR','UTA','WAS'],
  NHL: ['ANA','BOS','BUF','CGY','CAR','CHI','COL','CBJ','DAL','DET','EDM','FLA','LAK','MIN','MTL','NSH','NJD','NYI','NYR','OTT','PHI','PIT','SJS','SEA','STL','TBL','TOR','VAN','VGK','WSH','WPG','UTA'],
  MLB: ['ARI','ATL','BAL','BOS','CHC','CWS','CIN','CLE','COL','DET','HOU','KC','LAA','LAD','MIA','MIL','MIN','NYM','NYY','OAK','PHI','PIT','SD','SF','SEA','STL','TB','TEX','TOR','WSH'],
}

const POS_POOL: Record<string, string[]> = {
  NFL: ['QB','QB','RB','RB','RB','WR','WR','WR','WR','TE','TE','K'],
  NBA: ['PG','PG','SG','SG','SF','SF','PF','PF','C','C'],
  NHL: ['C','C','LW','LW','RW','RW','D','D','D','D','G'],
  MLB: ['C','1B','2B','3B','SS','OF','OF','OF','SP','SP','SP','SP','RP','RP'],
}

// Base season points per sport — generated players descend from here with jitter.
const BASE_PTS: Record<string, number> = { NFL: 230, NBA: 1040, NHL: 190, MLB: 430 }
const GAMES: Record<string, number> = { NFL: 17, NBA: 70, NHL: 70, MLB: 90 }

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const usedNames = new Set<string>()
function genName(): string {
  for (let i = 0; i < 300; i++) {
    const f = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]
    const l = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]
    const base = `${f} ${l}`
    if (!usedNames.has(base)) { usedNames.add(base); return base }
    // Expand the namespace ~26x with a middle initial before giving up.
    const mid = LETTERS[Math.floor(Math.random() * 26)]
    const withMid = `${f} ${mid}. ${l}`
    if (!usedNames.has(withMid)) { usedNames.add(withMid); return withMid }
  }
  let n = `${FIRST_NAMES[0]} ${LAST_NAMES[0]}`, k = 2
  while (usedNames.has(n)) n = `${FIRST_NAMES[0]} ${LAST_NAMES[0]} ${k++}`
  usedNames.add(n)
  return n
}

function generatePlayers(sport: string, count: number): PlayerSeed[] {
  const teams = TEAMS[sport]
  const posPool = POS_POOL[sport]
  const base = BASE_PTS[sport]
  const games = GAMES[sport]
  const out: PlayerSeed[] = []
  for (let i = 0; i < count; i++) {
    const pts = +Math.max(base * (1 - i / (count * 1.3)) + (Math.random() - 0.5) * base * 0.12, base * 0.08).toFixed(1)
    out.push({
      id: `${sport.toLowerCase()}-gen-${i}`,
      name: genName(),
      sport,
      pos: posPool[Math.floor(Math.random() * posPool.length)],
      team: teams[Math.floor(Math.random() * teams.length)],
      pts,
      proj: +(pts / games).toFixed(1),
      status: Math.random() < 0.05 ? 'INJURED' : 'ACTIVE',
    })
  }
  return out
}

// Seed the curated star names first so genName never collides with them.
for (const p of [...NFL, ...NBA, ...NHL, ...MLB]) usedNames.add(p.name)

// Each franchise fills its roster slots per sport (~20 players/sport → ~80 total),
// plus a healthy free-agent pool for waivers.
const NUM_TEAMS = 12
const FREE_AGENTS = 150
const ROSTER_FILL: Record<string, number> = Object.fromEntries(
  Object.entries(DEFAULT_ROSTER).map(([s, slots]) => [s, Object.values(slots).reduce((a, b) => a + b, 0)])
)
const poolSize = (sport: string, curated: number) => NUM_TEAMS * ROSTER_FILL[sport] + FREE_AGENTS - curated

// Real players from Tank01 fixtures (created by `npm run tank01:pull`) take
// precedence over generated ones. Falls back to generated when no file exists.
type PulledPlayer = { externalId: string; name: string; sport: string; position: string; team: string; status: string; injuryNote: string; photoUrl: string | null; isRookie: boolean; projectedPoints: number; stats: Record<string, number> }

function loadRealPool(sport: string): PlayerSeed[] | null {
  const file = path.resolve(process.cwd(), 'src/fixtures', `tank01-${sport}.json`)
  if (!fs.existsSync(file)) return null
  let rows: PulledPlayer[]
  try { rows = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
  if (!Array.isArray(rows) || rows.length === 0) return null
  const games = GAMES[sport] ?? 17
  // Keep the ENTIRE real pool so every player is an available free agent; the
  // fixture is sorted by projection, so the draft still takes the best first.
  return rows.map((p, i) => {
    const proj = p.projectedPoints || 0
    return {
      id: `${sport.toLowerCase()}-${p.externalId || i}`,
      externalId: p.externalId,
      name: p.name, sport, pos: p.position || 'UTIL', team: p.team || '',
      status: p.status || 'ACTIVE', injuryNote: p.injuryNote || '', photoUrl: p.photoUrl, isRookie: p.isRookie,
      proj: +proj.toFixed(1), pts: +(proj * games).toFixed(1), stats: p.stats || {},
    }
  })
}

function buildPool(sport: string, curated: PlayerSeed[]): PlayerSeed[] {
  const real = loadRealPool(sport)
  if (real) { console.log(`  ${sport}: using ${real.length} real players from Tank01 fixture (full free-agent pool)`); return real }
  return [...curated, ...generatePlayers(sport, poolSize(sport, curated.length))]
}

const NFL_ALL = buildPool('NFL', NFL)
const NBA_ALL = buildPool('NBA', NBA)
const NHL_ALL = buildPool('NHL', NHL)
const MLB_ALL = buildPool('MLB', MLB)

addPlayers(NFL_ALL)
addPlayers(NBA_ALL)
addPlayers(NHL_ALL)
addPlayers(MLB_ALL)

// ── One unified federation league ──────────────────────────────────────────

const SPORT_LIST = ['NFL', 'NBA', 'NHL', 'MLB']
const POOLS: Record<string, PlayerSeed[]> = { NFL: NFL_ALL, NBA: NBA_ALL, NHL: NHL_ALL, MLB: MLB_ALL }
const CURRENT_SEASON = '2025-26'
const PRIOR_SEASONS = ['2024-25', '2023-24']
const PICK_YEARS = [2027, 2028, 2029]
const NEXT_DRAFT_YEAR = 2027
const CURRENT_WEEK = 17 // a week where all four sports overlap
const ROOKIE_ROUNDS = 4

const randInt = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1))
const shuffled = <T,>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5)

const LEAGUE_LOGO = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0f172a"/><circle cx="32" cy="26" r="13" fill="none" stroke="#3b82f6" stroke-width="3"/><text x="32" y="31" font-size="13" font-family="Arial" font-weight="bold" fill="#3b82f6" text-anchor="middle">NF</text><text x="32" y="52" font-size="10" font-family="Arial" font-weight="bold" fill="#e2e8f0" text-anchor="middle">FED</text></svg>'
)

const leagueId = id()
const { roster, scoring, draftRounds, rookieRounds, seasonWeeks } = buildPerSportSettings(SPORT_LIST)
const schedule = buildSchedule('FOOTBALL', SPORT_LIST, seasonWeeks)
const fedScoring = defaultFederationScoring(12, SPORT_LIST)

const insertLeague = db.prepare(`
  INSERT INTO leagues
  (id,name,season,commissioner_id,status,max_teams,invite_code,description,logo_url,division_logos,
   sports_enabled,season_start,sport_schedule,roster_settings,scoring_settings,draft_rounds,
   federation_scoring,draft_type,draft_status,draft_order_method,rookie_draft_mode,rookie_draft_rounds,tradeable_pick_years,
   trade_review,trade_deadlines,waiver_type,faab_budget,faab_mode,waiver_schedule,ir_eligible_designations,defense_mode,playoff_format,weeks_per_round,position_limits,mlb_sp_cap,rookie_draft_dates,playoff_teams,playoff_start_week,regular_season_weeks,dues_amount)
  VALUES
  (@id,@name,@season,@commissioner_id,@status,@max_teams,@invite_code,@description,@logo_url,@division_logos,
   @sports_enabled,@season_start,@sport_schedule,@roster_settings,@scoring_settings,@draft_rounds,
   @federation_scoring,@draft_type,@draft_status,@draft_order_method,@rookie_draft_mode,@rookie_draft_rounds,@tradeable_pick_years,
   @trade_review,@trade_deadlines,@waiver_type,@faab_budget,@faab_mode,@waiver_schedule,@ir_eligible_designations,@defense_mode,@playoff_format,@weeks_per_round,@position_limits,@mlb_sp_cap,@rookie_draft_dates,@playoff_teams,@playoff_start_week,@regular_season_weeks,@dues_amount)
`)

insertLeague.run({
  id: leagueId,
  name: 'Nexus Federation',
  season: CURRENT_SEASON,
  commissioner_id: ownerIds[0],
  status: 'ACTIVE',
  max_teams: 14,
  invite_code: 'NEXUS2026',
  description: 'A cross-sport dynasty federation — one franchise, four sports, one champion.',
  logo_url: LEAGUE_LOGO,
  division_logos: '{}',
  sports_enabled: JSON.stringify(SPORT_LIST),
  season_start: 'FOOTBALL',
  sport_schedule: JSON.stringify(schedule),
  roster_settings: JSON.stringify(roster),
  scoring_settings: JSON.stringify(scoring),
  draft_rounds: JSON.stringify(draftRounds),
  federation_scoring: JSON.stringify(fedScoring),
  draft_type: 'SNAKE',
  draft_status: 'COMPLETED',
  draft_order_method: 'REVERSE_STANDINGS',
  rookie_draft_mode: 'PER_SPORT',
  rookie_draft_rounds: JSON.stringify(rookieRounds),
  tradeable_pick_years: 3,
  trade_review: 'COMMISSIONER',
  // Varied per-sport deadlines to showcase the modes.
  trade_deadlines: JSON.stringify({
    NFL: { mode: 'WEEK', week: 11 },
    NBA: { mode: 'SPORT_CHAMPIONSHIP' },
    NHL: { mode: 'FEDERATION_CHAMPIONSHIP' },
    MLB: { mode: 'NONE' },
  }),
  waiver_type: 'FAAB',
  faab_budget: 100,
  faab_mode: 'TOTAL',
  waiver_schedule: JSON.stringify(defaultWaiverSchedule(SPORT_LIST)),
  ir_eligible_designations: JSON.stringify(defaultIrDesignations(SPORT_LIST)),
  defense_mode: 'TEAM',
  playoff_format: 'H2H',
  weeks_per_round: 1,
  position_limits: '{}',
  mlb_sp_cap: 0,
  rookie_draft_dates: JSON.stringify(Object.fromEntries(SPORT_LIST.map(s => [s, '2026-08-15T18:00']))),
  playoff_teams: 4,
  playoff_start_week: 15,
  regular_season_weeks: JSON.stringify(seasonWeeks),
  dues_amount: 50,
})

// ── Franchises (one per owner, same name across all sports) ─────────────────

const FRANCHISES = OWNERS.map((o, i) => ({ uid: ownerIds[i], name: o.team, abbr: o.abbr }))

const insertMember = db.prepare(`INSERT OR IGNORE INTO league_members (id,league_id,user_id,role,dues_paid,dues_paid_at) VALUES (?,?,?,?,?,?)`)
const insertTeam = db.prepare(`INSERT INTO teams (id,name,abbreviation,user_id,league_id,wordmark,primary_color,secondary_color) VALUES (?,?,?,?,?,?,?,?)`)
const TEAM_COLORS: [string, string][] = [
  ['#0f172a', '#3b82f6'], ['#7c2d12', '#f97316'], ['#064e3b', '#10b981'], ['#581c87', '#a855f7'],
  ['#7f1d1d', '#ef4444'], ['#1e3a8a', '#60a5fa'], ['#374151', '#9ca3af'], ['#9d174d', '#ec4899'],
  ['#134e4a', '#2dd4bf'], ['#713f12', '#eab308'], ['#1e293b', '#38bdf8'], ['#3b0764', '#c084fc'],
]
const insertRoster = db.prepare(`INSERT OR IGNORE INTO rosters (id,team_id,player_id,sport,slot,acquisition_type) VALUES (?,?,?,?,?,?)`)
const insertRecord = db.prepare(`INSERT INTO team_records (id,team_id,league_id,season,sport,wins,losses,ties,points_for,points_against,finish_position,is_champion,faab_remaining,waiver_priority) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
const insertDraft = db.prepare(`INSERT INTO drafts (id,league_id,kind,scope,season,type,rounds,status,starts_at) VALUES (?,?,?,?,?,?,?,?,?)`)
const insertPick = db.prepare(`INSERT INTO draft_picks (id,league_id,draft_id,sport,round,year,original_team_id,current_team_id) VALUES (?,?,?,?,?,?,?,?)`)
const insertMatchup = db.prepare(`INSERT INTO matchups (id,league_id,sport,season,week,home_team_id,away_team_id,home_score,away_score,is_complete) VALUES (?,?,?,?,?,?,?,?,?,?)`)
const insertHistory = db.prepare(`INSERT INTO league_history (id,league_id,season,scope,champion_team_id,runner_up_team_id,note) VALUES (?,?,?,?,?,?,?)`)
const insertTrade = db.prepare(`INSERT INTO trades (id,league_id,initiator_id,recipient_id,status,note) VALUES (?,?,?,?,?,?)`)
const insertTradeItemPick = db.prepare(`INSERT INTO trade_items (id,trade_id,from_team_id,to_team_id,direction,pick_id) VALUES (?,?,?,?,?,?)`)
const insertTradeItemPlayer = db.prepare(`INSERT INTO trade_items (id,trade_id,from_team_id,to_team_id,direction,player_id) VALUES (?,?,?,?,?,?)`)
const insertApproval = db.prepare(`INSERT INTO trade_approvals (id,trade_id,team_id,user_id,status) VALUES (?,?,?,?,?)`)

const teamIds: string[] = []
FRANCHISES.forEach((f, i) => {
  const tid = id()
  teamIds.push(tid)
  const [primary, secondary] = TEAM_COLORS[i % TEAM_COLORS.length]
  insertTeam.run(tid, f.name, f.abbr, f.uid, leagueId, f.name, primary, secondary)
  const paid = i % 3 !== 2 // most franchises have paid their dues
  insertMember.run(id(), leagueId, f.uid, i === 0 ? 'COMMISSIONER' : 'MEMBER', paid ? 1 : 0, paid ? new Date().toISOString() : null)
})

// ── Rosters: distribute each sport's deep pool across the franchises ────────

const RESERVE = ['BN', 'TAXI', 'IR', 'IL', 'DL']

// Place a player into the best available slot, respecting per-slot capacity.
function pickSlot(pos: string, remaining: Record<string, number>): string | null {
  if ((remaining[pos] ?? 0) > 0) return pos
  const flex = Object.keys(remaining).find(k => remaining[k] > 0 && k.includes('/') && k.split('/').includes(pos))
  if (flex) return flex
  if ((remaining['UTIL'] ?? 0) > 0) return 'UTIL'
  if ((remaining['G'] ?? 0) > 0 && ['PG', 'SG'].includes(pos)) return 'G'
  if ((remaining['F'] ?? 0) > 0 && ['SF', 'PF'].includes(pos)) return 'F'
  for (const r of RESERVE) if ((remaining[r] ?? 0) > 0) return r
  return null
}

for (const sport of SPORT_LIST) {
  const pool = POOLS[sport]
  const slots = roster[sport] ?? {}
  const perTeam = ROSTER_FILL[sport]
  // Snake-deal the pool so talent spreads evenly; rotate the start per sport so
  // each sport's #1 lands on a different franchise.
  const sportIdx = Math.max(0, SPORT_LIST.indexOf(sport))
  const base = [...teamIds.slice(sportIdx), ...teamIds.slice(0, sportIdx)]
  const remaining: Record<string, Record<string, number>> = Object.fromEntries(teamIds.map(t => [t, { ...slots }]))
  let idx = 0
  for (let r = 0; r < perTeam; r++) {
    const order = r % 2 === 0 ? base : [...base].reverse()
    for (const tid of order) {
      const p = pool[idx++]
      if (!p) continue
      const slot = pickSlot(p.pos, remaining[tid]) ?? 'BN'
      if (remaining[tid][slot] != null) remaining[tid][slot]--
      insertRoster.run(id(), tid, p.id, sport, slot, 'DRAFT')
    }
  }
}

// ── Standings: current season + 2 prior completed seasons + history ─────────

const PF_BASE: Record<string, number> = { NFL: 1700, NBA: 5400, NHL: 780, MLB: 1850 }
const GAMES_BY: Record<string, number> = { NFL: 14, NBA: 19, NHL: 22, MLB: 26 }

function seedSeason(season: string, completed: boolean) {
  const fedPoints: Record<string, number> = {}
  teamIds.forEach(t => { fedPoints[t] = 0 })

  for (const sport of SPORT_LIST) {
    const order = shuffled(teamIds) // this sport's standings this season
    const G = GAMES_BY[sport]
    order.forEach((tid, rank) => {
      const wins = Math.max(1, Math.round(G * 0.72 - rank * (G * 0.5 / order.length)) + randInt(-1, 1))
      const losses = Math.max(0, G - wins)
      const pf = +(PF_BASE[sport] * (1 - rank * 0.05) + (Math.random() - 0.5) * PF_BASE[sport] * 0.04).toFixed(1)
      const pa = +(PF_BASE[sport] * 0.95 + (rank - 2.5) * PF_BASE[sport] * 0.03).toFixed(1)
      const finishPosition = rank + 1
      const isChampion = completed && rank === 0
      insertRecord.run(id(), tid, leagueId, season, sport, wins, losses, 0, pf, pa, finishPosition, isChampion ? 1 : 0, randInt(0, 100), rank + 1)
      fedPoints[tid] += (order.length - rank) + (isChampion ? fedScoring.championBonus : 0)
    })
    if (completed) {
      insertHistory.run(id(), leagueId, season, sport, order[0], order[1], null)
    }
  }

  if (completed) {
    const byFed = teamIds.slice().sort((a, b) => fedPoints[b] - fedPoints[a])
    insertHistory.run(id(), leagueId, season, 'OVERALL', byFed[0], byFed[1], 'Federation champion')
  }
}

seedSeason(CURRENT_SEASON, false)
for (const s of PRIOR_SEASONS) seedSeason(s, true)

// ── Drafts: completed dynasty draft + upcoming rookie drafts ────────────────

const dynastyId = id()
insertDraft.run(dynastyId, leagueId, 'DYNASTY', 'OVERALL', CURRENT_SEASON, 'SNAKE', dynastyDraftRounds(roster), 'COMPLETED', null)

// Default rookie-draft mode is PER_SPORT → one rookie draft per sport for next year.
// Seed the NFL rookie draft as IN_PROGRESS so the live draft room is demoable.
const rookieDraftId: Record<string, string> = {}
for (const sport of SPORT_LIST) {
  const did = id()
  rookieDraftId[sport] = did
  const status = sport === 'NFL' ? 'IN_PROGRESS' : 'PENDING'
  // NBA rookie draft uses an auction format to showcase nomination + bidding.
  const type = sport === 'NBA' ? 'AUCTION' : 'SNAKE'
  insertDraft.run(did, leagueId, 'ROOKIE', sport, String(NEXT_DRAFT_YEAR), type, rookieRounds[sport] ?? 4, status, '2026-08-15T18:00')
  if (status === 'IN_PROGRESS') db.prepare('UPDATE drafts SET current_pick=1 WHERE id=?').run(did)
}

// Tradeable future picks (per-sport, rounds match each sport's rookie-draft length).
for (const tid of teamIds) {
  for (const year of PICK_YEARS) {
    for (const sport of SPORT_LIST) {
      const rounds = rookieRounds[sport] ?? 4
      for (let round = 1; round <= rounds; round++) {
        const did = year === NEXT_DRAFT_YEAR ? rookieDraftId[sport] : null
        insertPick.run(id(), leagueId, did, sport, round, year, tid, tid)
      }
    }
  }
}

// ── Overlapping schedule: same pairing across all sports active each week ────

const SCORE_RANGE: Record<string, [number, number]> = { NFL: [85, 150], NBA: [310, 430], NHL: [42, 78], MLB: [55, 105] }
const pairings = buildWeeklyPairings(teamIds)
const maxWeek = scheduleWeeks(schedule)

function genScore(sport: string, played: boolean) {
  if (!played) return 0
  const [lo, hi] = SCORE_RANGE[sport]
  return +(lo + Math.random() * (hi - lo)).toFixed(1)
}

// Seed an overlapping schedule for a season. Prior seasons are fully complete
// (for all-time head-to-head + opponent history); the current season is live.
function seedMatchups(season: string, completed: boolean) {
  if (!pairings.length) return
  for (let week = 1; week <= maxWeek; week++) {
    const active = sportsActiveInWeek(schedule, week)
    if (!active.length) continue
    const pairs = pairings[(week - 1) % pairings.length]
    const played = completed || week <= CURRENT_WEEK
    const isComplete = completed ? 1 : (week < CURRENT_WEEK ? 1 : 0)
    for (const sport of active) {
      for (const [home, away] of pairs) {
        insertMatchup.run(id(), leagueId, sport, season, week, home, away,
          genScore(sport, played), genScore(sport, played), isComplete)
      }
    }
  }
}

seedMatchups(CURRENT_SEASON, false)
for (const s of PRIOR_SEASONS) seedMatchups(s, true)

// ── Stat lines (real scoring) for the last ~6 played weeks of each sport ─────
// Gives every player a real game log and makes recent scores derive from stats.
const insertPGS = db.prepare(`INSERT OR IGNORE INTO player_game_stats (id,league_id,season,week,sport,player_id,team_id,stats,points) VALUES (?,?,?,?,?,?,?,?,?)`)
const updMatchup = db.prepare(`UPDATE matchups SET home_score=?, away_score=? WHERE id=?`)
const isStarterSlot = (slot: string) => !RESERVE_SLOTS.includes(slot)
const scheduleMap: Record<string, any> = Object.fromEntries(schedule.map((e: any) => [e.sport, e]))
for (const sport of SPORT_LIST) {
  const w = scheduleMap[sport]; if (!w) continue
  const played = Math.min(CURRENT_WEEK, w.endWeek)       // latest week that has been played
  if (played < w.startWeek) continue
  const firstLog = Math.max(w.startWeek, played - 5)
  const rs = db.prepare(`SELECT r.player_id pid, r.team_id tid, r.slot slot, p.position pos, p.projected_points proj FROM rosters r JOIN players p ON p.id=r.player_id WHERE r.sport=?`).all(sport) as any[]
  const avg = rs.reduce((a, x) => a + (x.proj || 0), 0) / (rs.length || 1)
  for (let week = firstLog; week <= played; week++) {
    const games = db.prepare(`SELECT id, home_team_id h, away_team_id a FROM matchups WHERE league_id=? AND sport=? AND week=?`).all(leagueId, sport, week) as any[]
    if (!games.length) continue
    const pts: Record<string, number> = {}
    for (const x of rs) {
      const stats = generateStatLine(sport, x.pos, (x.proj || avg) / avg)
      const pp = scorePlayer(stats, (scoring as any)[sport] || {})
      pts[x.pid] = pp
      insertPGS.run(id(), leagueId, CURRENT_SEASON, week, sport, x.pid, x.tid, JSON.stringify(stats), pp)
    }
    const totals: Record<string, number> = {}
    for (const x of rs) if (isStarterSlot(x.slot)) totals[x.tid] = +(((totals[x.tid] || 0) + (pts[x.pid] || 0)).toFixed(1))
    for (const g of games) updMatchup.run(totals[g.h] || 0, totals[g.a] || 0, g.id)
  }
}

// ── Reconstruct the inaugural combined dynasty-draft board ──────────────────
// All players from every sport sit in one pool, ordered by cross-sport value
// (normalized to each sport's max), so e.g. the top MLB/NHL/NFL/NBA stars go early.
const sportMax: Record<string, number> = {}
for (const sport of SPORT_LIST) {
  sportMax[sport] = ((db.prepare('SELECT MAX(season_points) m FROM players WHERE sport=?').get(sport) as any).m) || 1
}
const dynastyRounds = SPORT_LIST.reduce((s, sp) => s + ROSTER_FILL[sp], 0)
db.prepare('UPDATE drafts SET rounds=? WHERE id=?').run(dynastyRounds, dynastyId)

const rostered = db.prepare(`
  SELECT r.player_id pid, r.team_id tid, r.sport sport, p.season_points sp
  FROM rosters r JOIN players p ON p.id = r.player_id
`).all() as { pid: string; tid: string; sport: string; sp: number }[]
rostered.forEach((x: any) => { x.val = (x.sp ?? 0) / (sportMax[x.sport] || 1) })
rostered.sort((a: any, b: any) => b.val - a.val)

const insertDynPick = db.prepare(
  `INSERT INTO draft_picks (id,league_id,draft_id,sport,round,year,original_team_id,current_team_id,is_used,picked_player_id,pick_number)
   VALUES (?,?,?,?,?,?,?,?,1,?,?)`
)
rostered.forEach((x, i) => {
  const pickNo = i + 1
  const round = Math.ceil(pickNo / teamIds.length)
  insertDynPick.run(id(), leagueId, dynastyId, x.sport, round, 2025, x.tid, x.tid, x.pid, pickNo)
})
db.prepare("UPDATE drafts SET status='COMPLETED' WHERE id=?").run(dynastyId)

// ── Sample cross-sport trade (real roster + real pick) ──────────────────────

const giftPick = db.prepare(
  `SELECT id FROM draft_picks WHERE current_team_id=? AND sport='NFL' AND round=1 AND year=? LIMIT 1`
).get(teamIds[0], NEXT_DRAFT_YEAR) as { id: string } | undefined

const wantPlayer = db.prepare(
  `SELECT r.player_id pid, p.name FROM rosters r JOIN players p ON p.id=r.player_id
   WHERE r.team_id=? AND r.sport='NBA' ORDER BY p.season_points DESC LIMIT 1`
).get(teamIds[1]) as { pid: string; name: string } | undefined

if (giftPick && wantPlayer) {
  const tradeId = id()
  insertTrade.run(tradeId, leagueId, teamIds[0], teamIds[1], 'PENDING',
    `Cross-sport blockbuster: my ${NEXT_DRAFT_YEAR} NFL 1st-round pick for ${wantPlayer.name}. Deal?`)
  // team[0] gives the pick to team[1]; team[1] gives the player to team[0]
  insertTradeItemPick.run(id(), tradeId, teamIds[0], teamIds[1], 'GIVING', giftPick.id)
  insertTradeItemPlayer.run(id(), tradeId, teamIds[1], teamIds[0], 'RECEIVING', wantPlayer.pid)
  // recipient must approve
  insertApproval.run(id(), tradeId, teamIds[1], ownerIds[1], 'PENDING')
}

// ── Seed league activity feed ───────────────────────────────────────────────

const insertActivity = db.prepare(
  `INSERT INTO activity (id, league_id, type, message, team_id, created_at) VALUES (?,?,?,?,?,datetime('now', ?))`
)
const fName = (i: number) => FRANCHISES[i].name
// Real free-agent names (players not on any roster) per sport, for lifelike add/drop messages.
const freeAgentsBySport = (sport: string, n: number) =>
  (db.prepare(
    `SELECT p.name FROM players p WHERE p.sport=? AND p.id NOT IN (SELECT player_id FROM rosters) ORDER BY p.season_points DESC LIMIT ?`
  ).all(sport, n) as { name: string }[]).map(r => r.name)
const faNBA = freeAgentsBySport('NBA', 4)
const faNFL = freeAgentsBySport('NFL', 4)
const faNHL = freeAgentsBySport('NHL', 2)
// Scores update automatically via the API, so they are never logged as transactions.
const seedActivity: [string, string, string | null, string][] = [
  ['TRADE',  `${fName(0)} proposed a trade to ${fName(1)}`, teamIds[0], '-5 hours'],
  ['WAIVER', `${fName(2)} claimed ${faNBA[0] ?? 'a guard'} (NBA) for $17, dropped ${faNBA[1] ?? 'a wing'}`, teamIds[2], '-1 days'],
  ['ROSTER', `${fName(3)} added ${faNFL[0] ?? 'a running back'} (NFL)`, teamIds[3], '-1 days'],
  ['ROSTER', `${fName(3)} dropped ${faNFL[1] ?? 'a tight end'} (NFL)`, teamIds[3], '-1 days'],
  ['WAIVER', `${fName(1)} claimed ${faNHL[0] ?? 'a winger'} (NHL), dropped ${faNHL[1] ?? 'a defenseman'}`, teamIds[1], '-2 days'],
  ['TRADE',  `Trade completed: ${fName(4)} / ${fName(5)}`, teamIds[4], '-3 days'],
  ['DRAFT',  `Rookie draft scheduled for ${NEXT_DRAFT_YEAR}`, null, '-4 days'],
]
for (const [type, msg, tid, when] of seedActivity) insertActivity.run(id(), leagueId, type, msg, tid, when)

// ── Seed league chat ────────────────────────────────────────────────────────

const insertMessage = db.prepare(
  `INSERT INTO league_messages (id, league_id, user_id, body, created_at) VALUES (?,?,?,?,datetime('now', ?))`
)
const seedChat: [number, string, string][] = [
  [0, 'Who else is starting their hockey goalie this week? Mine has a brutal schedule.', '-2 days'],
  [1, 'Just dropped a stinker in NBA, time to make some moves. Anyone selling a center?', '-2 days'],
  [2, "Don't trade with @Alex, he fleeced me last year 😂", '-1 days'],
  [0, "That's slander. It was a perfectly fair deal.", '-1 days'],
  [3, 'Waivers run tonight — good luck everyone, I want that RB.', '-20 hours'],
  [4, 'Federation standings are tight this year. May the best franchise win.', '-5 hours'],
  [1, 'Anyone want to talk a cross-sport deal? I have NFL picks to move.', '-2 hours'],
]
for (const [ownerIdx, body, when] of seedChat) insertMessage.run(id(), leagueId, ownerIds[ownerIdx], body, when)

// ── Seed player news + injuries ─────────────────────────────────────────────

const insertNews = db.prepare(
  `INSERT INTO player_news (id, player_id, headline, body, category, created_at) VALUES (?,?,?,?,?,datetime('now', ?))`
)
const updPlayerStatus = db.prepare(`UPDATE players SET status=?, injury_note=? WHERE id=?`)

for (const sp of SPORT_LIST) {
  const top = db.prepare(`SELECT id, name FROM players WHERE sport=? ORDER BY season_points DESC LIMIT 3`).all(sp) as { id: string; name: string }[]
  top.forEach((p, i) => {
    insertNews.run(id(), p.id, `${p.name} stays red-hot`, `Posted another strong line and remains a top-tier ${sp} fantasy option heading into the week.`, 'PERFORMANCE', `-${i + 1} hours`)
  })
  // A couple of injuries among mid-tier players per sport.
  const injuries: [string, string, string][] = [
    ['INJURED', 'Questionable (ankle)', 'is dealing with a sprained ankle and is questionable for the upcoming slate.'],
    ['IR', 'Out (hamstring)', 'was placed on injured reserve with a hamstring strain; no timetable to return.'],
  ]
  const mids = (db.prepare(`SELECT id, name FROM players WHERE sport=? ORDER BY season_points DESC LIMIT 16`).all(sp) as { id: string; name: string }[]).slice(12, 14)
  mids.forEach((p, i) => {
    const [status, note, blurb] = injuries[i % injuries.length]
    updPlayerStatus.run(status, note, p.id)
    insertNews.run(id(), p.id, `${p.name}: ${note}`, `${p.name} ${blurb}`, 'INJURY', `-${i + 2} hours`)
  })
}

// ── Seed pending waiver claims (FAAB) ───────────────────────────────────────

const insertClaim = db.prepare(
  `INSERT INTO waiver_claims (id, league_id, team_id, sport, add_player_id, drop_player_id, bid_amount, priority, status) VALUES (?,?,?,?,?,?,?,?,?)`
)
for (const sp of ['NFL', 'NBA', 'NHL'] as const) {
  // Two different franchises bidding on the same top free agent → a contested claim.
  const freeAgents = db.prepare(
    `SELECT p.id FROM players p WHERE p.sport=? AND p.id NOT IN (SELECT player_id FROM rosters) ORDER BY p.season_points DESC LIMIT 2`
  ).all(sp) as { id: string }[]
  if (!freeAgents.length) continue
  const bidders = [1, 2, 3]
  freeAgents.forEach((fa, i) => {
    const t = teamIds[bidders[i % bidders.length]]
    const pr = db.prepare(`SELECT waiver_priority p, faab_remaining f FROM team_records WHERE team_id=? AND season=? AND sport=?`).get(t, CURRENT_SEASON, sp) as { p: number; f: number } | undefined
    insertClaim.run(id(), leagueId, t, sp, fa.id, null, Math.min((pr?.f ?? 50), 10 + i * 7), pr?.p ?? 1, 'PENDING')
  })
  // A second franchise contests the first free agent.
  const t2 = teamIds[4]
  const pr2 = db.prepare(`SELECT waiver_priority p, faab_remaining f FROM team_records WHERE team_id=? AND season=? AND sport=?`).get(t2, CURRENT_SEASON, sp) as { p: number; f: number } | undefined
  insertClaim.run(id(), leagueId, t2, sp, freeAgents[0].id, null, Math.min((pr2?.f ?? 50), 14), pr2?.p ?? 1, 'PENDING')
}

db.close()
console.log('✅ Database seeded successfully!')
console.log('   League: Nexus Federation (NFL · NBA · NHL · MLB)')
console.log('   Login: admin@nexusfantasy.com / password123')
console.log('   Or any user: alex@example.com, sam@example.com, etc.')
