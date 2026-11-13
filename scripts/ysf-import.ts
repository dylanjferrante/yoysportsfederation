/**
 * Import the real yoy Sports Federation (ySF) into Nexus from ysffantasy.com.
 *
 * Read-only against ysffantasy.com (public feeds + the public portal API). Builds one
 * Nexus league, id "ysf", with:
 *   - the 12 clubs and owners (names, abbreviations, colors, logos)
 *   - the four leagues as sports (ySFFL=NFL, ySFHL=NHL, ySFBA=NBA, ySFLB=MLB) with the
 *     ySF roster shapes, taxi sizes (Comm. Res. VII), FAAB budgets and 6-team playoffs
 *   - every current roster (starters by slot, bench, IR, taxi)
 *   - the full 2026-27 schedule and every result so far
 *   - standings, FAAB remaining, waiver order
 *   - trades and transactions (as trades + activity), future draft picks
 *   - 2025-26 champions
 * then checks the standings it rebuilt from the imported matchups against the feed.
 *
 * Re-runnable: the "ysf" league is deleted and rebuilt each run. Other leagues are untouched.
 *
 *   npx tsx scripts/ysf-import.ts            # import + parity check
 *   YSF_BASE=https://beta.ysffantasy.com npx tsx scripts/ysf-import.ts
 *
 * Owner accounts are created as <club>@ysf.local. Set YSF_IMPORT_PASSWORD to choose their
 * local password; otherwise a random one is generated and printed once.
 */
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { seasonAnchor, defaultWaiverSchedule, defaultIrDesignations, DEFAULT_SCORING } from '../src/lib/defaults'

const BASE = (process.env.YSF_BASE || 'https://ysffantasy.com').replace(/\/$/, '')
const LEAGUE_ID = 'ysf'
const SEASON = '2026-27'
const COMMISSIONER = 'ferrante'

const SPORTS = [
  { key: 'ysf_fl', code: 'ySFFL', sport: 'NFL', phase: 'FOOTBALL', champ: 'Supper Bowl II', taxi: 3 },
  { key: 'ysf_hl', code: 'ySFHL', sport: 'NHL', phase: 'WINTER', champ: "The 2027 Gordo's Cup Finals", taxi: 4 },
  { key: 'ysf_ba', code: 'ySFBA', sport: 'NBA', phase: 'WINTER', champ: 'The 2027 Syllys', taxi: 3 },
  { key: 'ysf_lb', code: 'ySFLB', sport: 'MLB', phase: 'BASEBALL', champ: 'The 2027 Simulation Series', taxi: 5 },
] as const
type SportDef = typeof SPORTS[number]

// Fantrax slot labels -> Nexus slot keys
const SLOT_MAP: Record<string, Record<string, string>> = {
  NFL: { DST: 'DEF', RWT: 'RB/WR/TE' },
  NBA: { Flx: 'UTIL' },
  NHL: { Skt: 'UTIL' },
  MLB: { UT: 'UTIL' },
}
const STATUS_SLOT: Record<string, string> = { RESERVE: 'BN', MINORS: 'TAXI', INJURED_RESERVE: 'IR' }
const LEAGUE_COLORS: Record<string, string> = { NFL: '#177245', NHL: '#6da7ee', NBA: '#e86100', MLB: '#ba0c2f' }
// 2026-27 refresh artwork, served from public/ysf (copied from the brand pack). File suffix = the background it sits on.
const LG_KEY: Record<string, string> = { NFL: 'fl', NHL: 'hl', NBA: 'ba', MLB: 'lb' }
const perSport = (f: (k: string) => string) => JSON.stringify(Object.fromEntries(Object.entries(LG_KEY).map(([s, k]) => [s, f(k)])))
// owner overrides on top of the brand file
const COLOR_OVERRIDE: Record<string, string> = { SSU: '#FF8C24', KMU: '#19B9EE' }

// ── ySF scoring (constitution "Scoring" section, ysffantasy.com/data/constitution.json) ──
// Every Nexus scoring key for the sport is listed; anything ySF doesn't score is 0.
const zero = (sport: string) => Object.fromEntries(Object.keys(DEFAULT_SCORING[sport]).map(k => [k, 0]))
const YSF_SCORING: Record<string, Record<string, unknown>> = {
  // ySFFL — 0.5 PPR, FG by distance (0.1/yd), custom D/ST points- and yards-allowed tiers (Comm. Res. IV)
  NFL: {
    ...zero('NFL'),
    passingYards: 0.04, passingTD: 4, passingInt: -2, passing2pt: 2,
    rushingYards: 0.1, rushingTD: 6, rushing2pt: 2,
    receptions: 0.5, receivingYards: 0.1, receivingTD: 6, receiving2pt: 2,
    fumbleLost: -2, fumbleRecoveryTD: 6, returnTD: 6,
    fgPointsPerYard: 0.1, fgMinPoints: 0, fgMissed: -1, xpMade: 1, xpMissed: -1,
    sack: 1, interception: 2, fumbleRecovery: 2, safeties: 2, safety: 2, defensiveTD: 6, specialTeamsTD: 6, blockedKick: 0,
    ptsAllowedTiers: [
      { min: 0, max: 0, points: 5 }, { min: 1, max: 6, points: 4 }, { min: 7, max: 13, points: 3 }, { min: 14, max: 27, points: 1 },
      { min: 28, max: 34, points: -1 }, { min: 35, max: 45, points: -3 }, { min: 46, max: null, points: -5 },
    ],
    // Yards allowed per the Commission (Nov 12, 2026): 300-349 = 0, 400-499 = -3. Note: Fantrax's
    // ranges leave a 300-349 gap that it scores as +2 (the previous range), so its results differ.
    yardsAllowedTiers: [
      { min: -100, max: -1, points: 5 }, { min: 0, max: 99, points: 5 }, { min: 100, max: 199, points: 3 }, { min: 200, max: 299, points: 2 }, { min: 300, max: 349, points: 0 },
      { min: 350, max: 399, points: -1 }, { min: 400, max: 499, points: -3 },
      { min: 500, max: 549, points: -6 }, { min: 550, max: null, points: -7 },
    ],
  },
  // ySFBA — FGM +2 / FGA -1 and FTM +1 / FTA -1 are expressed as made/missed: FGM +1, FG miss -1; FTM 0, FT miss -1
  NBA: {
    ...zero('NBA'),
    points: 1, rebounds: 1, assists: 2, steals: 4, blocks: 4, threesMade: 1,
    fieldGoalsMade: 1, fieldGoalsMissed: -1, freeThrowsMade: 0, freeThrowsMissed: -1, turnovers: -2,
  },
  // ySFHL — PPP/SHP +0.5 credited on top of the goal/assist; goalie goals and assists score as skater goals/assists
  NHL: {
    ...zero('NHL'),
    goals: 2, assists: 1, ppGoals: 0.5, ppAssists: 0.5, shGoals: 0.5, shAssists: 0.5,
    shotsOnGoal: 0.1, hits: 0.1, blockedShots: 0.5,
    wins: 4, saves: 0.2, goalsAllowed: -2, shutout: 3, overtimeLoss: 1,
  },
  // ySFLB — TB +1, XBH +1, HR +1 folded into per-hit values: 1B 1, 2B 3, 3B 4, HR 6
  MLB: {
    ...zero('MLB'),
    singles: 1, doubles: 3, triples: 4, homeRuns: 6,
    runs: 1, rbi: 1, stolenBases: 1, walks: 1, strikeoutsAsBatter: -1, caughtStealing: -0.5, gidp: -1, cycle: 15,
    inningsPitched: 3, strikeoutsAsPitcher: 1, wins: 3, saves: 5, holds: 2, losses: -2,
    earnedRunsAllowed: -1, hitsAllowed: -1, walksAllowed: -1, homeRunsAllowed: -2,
    pickoffs: 1, outfieldAssists: 2, errors: -1, noHitter: 30, perfectGame: 50,
  },
}

async function getJson(p: string) {
  const r = await fetch(BASE + p, { headers: { 'User-Agent': 'nexus-ysf-import/1.0' } })
  if (!r.ok) throw new Error(`${p} -> HTTP ${r.status}`)
  return r.json()
}
const firstLast = (n: string) => (n.includes(', ') ? n.split(', ').reverse().join(' ') : n).trim()
const norm = (n: string) => firstLast(n).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').replace(/\s+(jr|sr|ii|iii|iv)$/, '').trim()

async function main() {
  console.log(`Fetching ySF from ${BASE} …`)
  const [teamsApi, txAll, trades, picksAll, ...leagueFeeds] = await Promise.all([
    getJson('/api/v1/data/teams'), getJson('/data/transactions_2026-27.json'), getJson('/data/trades_2026-27.json'),
    getJson('/data/draft_picks_by_team.json'), ...SPORTS.map(s => getJson(`/data/league_${s.key}.json`)),
  ])
  const fedFeed = await getJson('/data/federation.json').catch(() => null)
  // club artwork + secondary colors from the live brand file (logo variants named by the background they sit on)
  const brandJs = await fetch(BASE + '/js/brand.js').then(r => (r.ok ? r.text() : '')).catch(() => '')
  const brand: Record<string, Record<string, string>> = {}
  for (const m of brandJs.matchAll(/(\w+): club\(\{([\s\S]*?)\}\)/g)) {
    const f = (k: string) => (new RegExp(`\\b${k}: '([^']+)'`).exec(m[2]) ?? [])[1]
    brand[m[1]] = { crest: f('crest'), onPrimary: f('crestOnPrimary'), wordmark: f('wordmark'), secondary: f('secondary') }
  }
  const archives = await Promise.all(SPORTS.map(s => getJson(`/data/archives/2025-26/${s.key}.json`).catch(() => null)))
  const feeds = Object.fromEntries(SPORTS.map((s, i) => [s.sport, leagueFeeds[i]])) as Record<string, any>
  const clubs: Record<string, any> = teamsApi

  const db = new Database(path.join(process.cwd(), 'data', 'nexus.db'))
  db.pragma('foreign_keys = ON')
  const id = () => nanoid()

  // Never rebuild mid-draft: the import recreates the league and would erase picks in progress.
  const liveDraft = db.prepare(`SELECT id FROM drafts WHERE league_id=? AND status IN ('IN_PROGRESS','PAUSED') LIMIT 1`).get(LEAGUE_ID) as any
  if (liveDraft) { console.error(`A draft is in progress (${liveDraft.id}). Finish or reset it before re-importing.`); process.exit(1) }
  // Keep commissioner draft settings (pick timer, start time) across re-imports.
  const draftSettings = new Map((db.prepare(`SELECT id, pick_seconds, starts_at FROM drafts WHERE league_id=?`).all(LEAGUE_ID) as any[]).map(r => [r.id, r]))

  // ── wipe the previous ySF import (other leagues untouched) ──
  const wipe = db.transaction(() => {
    const L = LEAGUE_ID
    db.prepare(`DELETE FROM trades WHERE league_id=?`).run(L)
    db.prepare(`DELETE FROM matchups WHERE league_id=?`).run(L)
    db.prepare(`DELETE FROM waiver_claims WHERE league_id=?`).run(L)
    db.prepare(`DELETE FROM draft_picks WHERE league_id=?`).run(L)
    db.prepare(`DELETE FROM commissioner_actions WHERE league_id=?`).run(L)
    db.prepare(`DELETE FROM leagues WHERE id=?`).run(L)
  })
  wipe()

  // ── owners ──
  const pwPlain = process.env.YSF_IMPORT_PASSWORD || crypto.randomBytes(9).toString('base64url')
  const pw = bcrypt.hashSync(pwPlain, 10)
  const userId: Record<string, string> = {}
  let newAccounts = 0
  for (const [k, c] of Object.entries(clubs)) {
    const email = `${k}@ysf.local`
    const ex = db.prepare(`SELECT id FROM users WHERE email=?`).get(email) as { id: string } | undefined
    if (ex) { userId[k] = ex.id; db.prepare(`UPDATE users SET name=? WHERE id=?`).run(c.owner, ex.id) }
    else { userId[k] = id(); newAccounts++; db.prepare(`INSERT INTO users (id,name,email,password) VALUES (?,?,?,?)`).run(userId[k], c.owner, email, pw) }
  }

  // ── schedule: map each sport's periods onto federation weeks ──
  const anchor = seasonAnchor(SEASON, 'FOOTBALL')
  const fedWeek = (iso: string) => Math.floor((new Date(iso + 'T12:00:00').getTime() - anchor) / (7 * 86_400_000)) + 1
  const sched: { sport: string; phase: string; startWeek: number; endWeek: number }[] = []
  const weekOf: Record<string, (period: number) => number> = {}
  const regWeeks: Record<string, number> = {}, playoffStart: Record<string, number> = {}
  for (const s of SPORTS) {
    const pm = feeds[s.sport].schedule_meta.periods as Record<string, any>
    const pids = Object.keys(pm).map(Number).sort((a, b) => a - b)
    const start = Math.max(1, fedWeek(pm[String(pids[0])].start))
    weekOf[s.sport] = (p: number) => start + p - 1
    sched.push({ sport: s.sport, phase: s.phase, startWeek: start, endWeek: start + pids.length - 1 })
    regWeeks[s.sport] = pids.filter(p => !pm[String(p)].is_playoff).length
    playoffStart[s.sport] = regWeeks[s.sport] + 1
  }

  // ── league settings from the ySF rules ──
  const rosterSettings: Record<string, Record<string, number>> = {}
  for (const s of SPORTS) {
    const rc = feeds[s.sport].roster_constraints
    const shape: Record<string, number> = {}
    for (const [pos, v] of Object.entries<any>(rc.position_constraints)) {
      if (!v.maxActive) continue
      shape[SLOT_MAP[s.sport][pos] ?? pos] = v.maxActive
    }
    const irMax = Math.max(1, ...Object.values<any>(feeds[s.sport].rosters).map(r => r.players.filter((p: any) => p.status === 'INJURED_RESERVE').length))
    rosterSettings[s.sport] = { ...shape, BN: rc.max_reserve_players, IR: irMax, TAXI: s.taxi }
  }
  const sportsEnabled = SPORTS.map(s => s.sport)
  const faab = Math.max(...SPORTS.map(s => Math.max(...feeds[s.sport].standings.map((r: any) => (r.faab_remaining ?? 0) + (r.faab_spent ?? 0)))))
  db.prepare(`INSERT INTO leagues (id,name,abbreviation,season,commissioner_id,status,max_teams,description,primary_color,secondary_color,
      sports_enabled,season_start,sport_schedule,roster_settings,scoring_settings,federation_scoring,regular_season_weeks,playoff_teams,playoff_start_week,
      playoff_rounds,playoff_reseed,sport_names,sport_abbr,championship_names,championship_colors,waiver_type,faab_budget,faab_mode,waiver_schedule,
      ir_eligible_designations,rookie_draft_mode,rookie_draft_rounds,trade_review,proposal_settings,draft_status)
      VALUES (@id,@name,@abbr,@season,@comm,'ACTIVE',12,@desc,'#000000','#0D00B2',@sports,'FOOTBALL',@sched,@roster,@scoring,@fed,@reg,6,@pstart,3,1,
      @names,@abbrs,@champs,@ccolors,'FAAB',@faab,'PER_SPORT',@wsched,@ir,'PER_SPORT',@rookie,'COMMISSIONER',@props,'COMPLETED')`).run({
    id: LEAGUE_ID, name: 'yoy Sports Federation', abbr: 'ySF', season: SEASON, comm: userId[COMMISSIONER],
    desc: 'Twelve clubs, four leagues, one Federation Cup. Imported from ysffantasy.com.',
    sports: JSON.stringify(sportsEnabled), sched: JSON.stringify(sched), roster: JSON.stringify(rosterSettings),
    scoring: JSON.stringify(YSF_SCORING),
    fed: JSON.stringify({ placement: Array.from({ length: 12 }, (_, i) => 12 - i), championBonus: 0, regularSeasonBonus: 0, includedSports: sportsEnabled }),
    reg: JSON.stringify(regWeeks), pstart: playoffStart.NFL,
    names: JSON.stringify(Object.fromEntries(SPORTS.map(s => [s.sport, s.code]))), abbrs: JSON.stringify(Object.fromEntries(SPORTS.map(s => [s.sport, s.code]))),
    champs: JSON.stringify(Object.fromEntries(SPORTS.map(s => [s.sport, s.champ]))), ccolors: JSON.stringify(Object.fromEntries(Object.entries(LEAGUE_COLORS).map(([sp, hex]) => [sp, { p: hex, s: '#ffffff' }]))),
    faab, wsched: JSON.stringify(defaultWaiverSchedule(sportsEnabled)), ir: JSON.stringify(defaultIrDesignations(sportsEnabled)),
    rookie: JSON.stringify(Object.fromEntries(SPORTS.map(s => [s.sport, s.taxi]))),
    // Constitution: new rules / rule changes 51%, amendments 75% (of all 12 clubs)
    props: JSON.stringify({ policy: 'ANY', threshold: 51, quorum: 12, durationDays: 7 }),
  })

  db.prepare(`UPDATE leagues SET logo_url=?, logo_secondary=?, wordmark=?, division_logos=?, division_logos_alt=?, division_wordmarks=?, championship_logos=?, championship_colors=? WHERE id=?`).run(
    '/ysf/fed/primary_white.svg', '/ysf/fed/favicon.svg', '/ysf/fed/wordmark_white.svg',
    perSport(k => `/ysf/leagues/${k}_symbol_white.svg`), perSport(k => `/ysf/leagues/${k}_symbol_color.svg`),
    perSport(k => `/ysf/leagues/${k}_primary_white.svg`), perSport(k => `/ysf/champ/${k}.svg`),
    JSON.stringify(Object.fromEntries(Object.entries(LEAGUE_COLORS).map(([sp, hex]) => [sp, { p: hex, s: '#ffffff' }]))), LEAGUE_ID)

  // ySFHL, ySFBA and ySFLB set lineups daily within each scoring period; ySFFL weekly
  db.prepare(`UPDATE leagues SET lineup_cadence=? WHERE id=?`).run(JSON.stringify({ NFL: 'WEEKLY', NHL: 'DAILY', NBA: 'DAILY', MLB: 'DAILY' }), LEAGUE_ID)

  // ── clubs ──
  const teamId: Record<string, string> = {}
  const insMember = db.prepare(`INSERT OR IGNORE INTO league_members (id,league_id,user_id,role) VALUES (?,?,?,?)`)
  const insTeam = db.prepare(`INSERT INTO teams (id,name,abbreviation,logo,alt_logo,wordmark,user_id,league_id,primary_color,secondary_color) VALUES (?,?,?,?,?,?,?,?,?,?)`)
  for (const [k, c] of Object.entries(clubs)) {
    teamId[k] = id()
    insMember.run(id(), LEAGUE_ID, userId[k], k === COMMISSIONER ? 'COMMISSIONER' : 'MEMBER')
    const b = brand[k] ?? {}
    const art = (f?: string) => (f ? `${BASE}/logos/clubs/${f}` : null)
    const local = (v: string) => { const f = `/ysf/clubs/${String(c.abbr).toLowerCase()}_${v}.svg`; return fs.existsSync(path.join(process.cwd(), 'public', f)) ? f : null }
    insTeam.run(teamId[k], c.name, c.abbr, local('crest') ?? art(b.crest), local('onp') ?? art(b.onPrimary ?? b.crest), art(b.wordmark), userId[k], LEAGUE_ID,
      COLOR_OVERRIDE[c.abbr] ?? c.color, b.secondary ?? '#ffffff')
  }

  // ── players: reuse the Tank01 player rows when the name matches, else create ──
  const byName = new Map<string, string>()
  for (const r of db.prepare(`SELECT id, sport, name FROM players`).all() as any[]) byName.set(r.sport + '|' + norm(r.name), r.id)
  const insPlayer = db.prepare(`INSERT OR IGNORE INTO players (id,external_id,name,sport,position,eligible_positions,real_team,real_team_abbr,status) VALUES (?,?,?,?,?,?,?,?,?)`)
  const playerFor = (sport: string, name: string, pos: string, team: string, fxId?: string) => {
    const key = sport + '|' + norm(name)
    let pid = byName.get(key)
    if (!pid) {
      pid = 'fx_' + (fxId || nanoid())
      const real = pos && !['Flx', 'UT', 'Skt', 'RWT'].includes(pos) ? pos : 'UTIL'
      insPlayer.run(pid, null, firstLast(name), sport, real, JSON.stringify([real]), team || 'FA', team || null, 'ACTIVE')
      byName.set(key, pid)
    }
    return pid
  }

  // ── rosters ──
  const insRoster = db.prepare(`INSERT OR IGNORE INTO rosters (id,team_id,player_id,sport,slot,acquisition_type) VALUES (?,?,?,?,?,?)`)
  let rostered = 0, created = 0
  const before = (db.prepare(`SELECT COUNT(*) n FROM players`).get() as any).n
  for (const s of SPORTS) {
    for (const r of Object.values<any>(feeds[s.sport].rosters)) {
      const tid = teamId[r.ysf_id]; if (!tid) continue
      for (const p of r.players) {
        const slot = p.status === 'ACTIVE' ? (SLOT_MAP[s.sport][p.position] ?? p.position) : (STATUS_SLOT[p.status] ?? 'BN')
        const pid = playerFor(s.sport, p.name, p.position, p.real_team, p.fantrax_player_id)
        insRoster.run(id(), tid, pid, s.sport, slot, 'IMPORT')
        // Positional eligibility: Nexus keeps one position per player, but ySF clubs slot players at every
        // position Fantrax allows (e.g. a C/LW playing LW). Record each real position a player is listed or slotted at.
        if (p.position && !['Flx', 'UT', 'Skt', 'RWT', 'P'].includes(p.position)) {
          const cur = db.prepare(`SELECT position, eligible_positions e FROM players WHERE id=?`).get(pid) as any
          const set = new Set<string>([cur.position, ...JSON.parse(cur.e || '[]'), p.position === 'DST' ? 'DEF' : p.position])
          db.prepare(`UPDATE players SET eligible_positions=? WHERE id=?`).run(JSON.stringify([...set].filter(Boolean)), pid)
        }
        rostered++
      }
    }
  }
  created = (db.prepare(`SELECT COUNT(*) n FROM players`).get() as any).n - before

  // ── schedule + results ──
  const insMatch = db.prepare(`INSERT INTO matchups (id,league_id,sport,season,week,home_team_id,away_team_id,home_score,away_score,is_complete,is_playoff) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
  let nMatch = 0
  for (const s of SPORTS) {
    for (const m of feeds[s.sport].matchups) {
      if (!m.home_ysf_id || !m.away_ysf_id) continue
      insMatch.run(id(), LEAGUE_ID, s.sport, SEASON, weekOf[s.sport](m.period), teamId[m.home_ysf_id], teamId[m.away_ysf_id],
        m.home_score ?? 0, m.away_score ?? 0, m.complete ? 1 : 0, m.is_playoff ? 1 : 0)
      nMatch++
    }
  }

  // ── standings, FAAB, waiver order ──
  const insRec = db.prepare(`INSERT INTO team_records (id,team_id,league_id,season,sport,wins,losses,ties,points_for,points_against,finish_position,faab_remaining,waiver_priority) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  for (const s of SPORTS) {
    const st = feeds[s.sport].standings as any[]
    // A league that hasn't played yet has no finishing order, so it awards no Cup points (ySFLB before Opening Day).
    const started = feeds[s.sport].matchups.some((m: any) => m.complete)
    st.forEach((r, i) => insRec.run(id(), teamId[r.ysf_id], LEAGUE_ID, SEASON, s.sport, r.w, r.l, r.t ?? 0, r.pf, r.pa ?? 0, started ? r.rank : null, r.faab_remaining ?? 0, st.length - i))
  }

  // ── trades ──
  const sportOf: Record<string, string> = Object.fromEntries(SPORTS.map(s => [s.code, s.sport]))
  const insTrade = db.prepare(`INSERT INTO trades (id,league_id,initiator_id,recipient_id,status,note,processed_at,created_at) VALUES (?,?,?,?,'ACCEPTED',?,?,?)`)
  const insItem = db.prepare(`INSERT INTO trade_items (id,trade_id,from_team_id,to_team_id,direction,player_id) VALUES (?,?,?,?,'RECEIVING',?)`)
  const actCols = (db.prepare(`PRAGMA table_info(activity)`).all() as any[]).map(c => c.name)
  if (!actCols.includes('data')) db.exec(`ALTER TABLE activity ADD COLUMN data TEXT`)
  const insAct = db.prepare(`INSERT INTO activity (id,league_id,type,message,team_id,created_at,data) VALUES (?,?,?,?,?,?,?)`)
  // pro-team abbreviation + positions for a player, from the Nexus player row when there is one
  const proOf = (sport: string, name: string, fallbackTeam: string) => {
    const pid = byName.get(sport + '|' + norm(name))
    const r = pid ? db.prepare(`SELECT real_team_abbr t, position p, eligible_positions e FROM players WHERE id=?`).get(pid) as any : null
    const e = r ? JSON.parse(r.e || '[]') : []
    return { team: r?.t || fallbackTeam || 'FA', pos: r ? (e.length > 1 ? e : [r.p]).join('/') : '' }
  }
  for (const t of trades.trades) {
    const sides = t.sides.filter((x: any) => teamId[x.ysf_id]); if (sides.length < 2) continue
    const tid = id(), when = t.date.replace('T', ' ')
    insTrade.run(tid, LEAGUE_ID, teamId[sides[0].ysf_id], teamId[sides[1].ysf_id], t.id, when, when)
    const parts: string[] = []
    const gets: Record<string, any[]> = {}
    for (const sd of sides) {
      const other = sides.find((o: any) => o.ysf_id !== sd.ysf_id)
      const got: string[] = []
      for (const a of sd.acquires) {
        const mm = /^(.+?), (.+?) \((\w+), (\w+)\) \[(ySF\w+)\]/.exec(a.name)
        if (!mm || !sportOf[mm[5]]) continue
        insItem.run(id(), tid, teamId[other.ysf_id], teamId[sd.ysf_id], playerFor(sportOf[mm[5]], `${mm[1]}, ${mm[2]}`, mm[3], mm[4]))
        got.push(`${mm[2]} ${mm[1]}`)
        ;(gets[sd.ysf_id] ??= []).push({ name: `${mm[2]} ${mm[1]}`, sport: sportOf[mm[5]], team: mm[4], pos: mm[3] })
      }
      if (got.length) parts.push(`${clubs[sd.ysf_id].abbr} gets ${got.join(', ')}`)
    }
    insAct.run(id(), LEAGUE_ID, 'TRADE', 'Trade: ' + parts.join('; '), teamId[sides[0].ysf_id], when,
      JSON.stringify({ kind: 'TRADE', sides: sides.map((sd: any) => ({ teamId: teamId[sd.ysf_id], gets: gets[sd.ysf_id] ?? [] })), season: SEASON }))
  }

  // ── signings, claims, releases ──
  const VERB: Record<string, string> = { FA: 'signed', WW: 'claimed', DROP: 'released' }
  let nTx = 0
  for (const s of SPORTS) {
    const lg = txAll.leagues?.[s.key]; if (!lg) continue
    for (const t of lg.transactions) {
      if (!teamId[t.ysf_id]) continue
      for (const p of t.players) {
        const bid = t.bid && p.type === 'WW' ? ` ($${Math.round(t.bid)})` : ''
        const pro = proOf(s.sport, p.name, '')
        insAct.run(id(), LEAGUE_ID, 'WAIVER', `${clubs[t.ysf_id].abbr} ${VERB[p.type] ?? p.type.toLowerCase()} ${p.name} (${s.code}, ${p.position})${bid}`, teamId[t.ysf_id], t.date.replace('T', ' '),
          JSON.stringify({ kind: ({ FA: 'SIGNED', WW: 'CLAIMED', DROP: 'RELEASED' } as Record<string, string>)[p.type] ?? String(p.type).toUpperCase(), sport: s.sport, player: firstLast(p.name),
            team: pro.team, pos: p.position && /[,/]/.test(p.position) ? p.position.replace(/,/g, '/') : (pro.pos || p.position), bid: t.bid && p.type === 'WW' ? Math.round(t.bid) : null, season: SEASON }))
        nTx++
      }
    }
  }

  // ── 2025-26 moves and trades (ysffantasy.com's scrape of Fantrax; Fantrax's public API has no transaction log) ──
  const PRO = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts', 'data', 'pro-teams.json'), 'utf8')) as Record<string, Record<string, string>>
  const proAbbr = (sport: string, t: string) => String(t || '').split('/').map(x => { const c = x.trim().replace(/(?<=[A-Z]{2,3})[a-z]+$/, ''); return PRO[sport]?.[c] ?? c }).filter(Boolean).join('/') || 'FA'
  const PREV_KEY: Record<string, string> = { ysf_fl_prev: 'NFL', ysf_fl: 'NFL', ysf_hl: 'NHL', ysf_ba: 'NBA', ysf_lb: 'MLB' }
  const KIND: Record<string, string> = { FA: 'SIGNED', WW: 'CLAIMED', DROP: 'RELEASED', DRAFT: 'DRAFTED' }
  const txPrev = await getJson('/data/transactions_2025-26.json').catch(() => null)
  let nPrevTx = 0
  for (const [lk, lg] of Object.entries<any>(txPrev?.leagues ?? {})) {
    const sport = PREV_KEY[lk]; if (!sport) continue
    const codeOf = SPORTS.find(x => x.sport === sport)!.code
    for (const t of lg.transactions ?? []) {
      if (!teamId[t.ysf_id]) continue
      for (const p of t.players ?? []) {
        if (p.type === 'LINEUP_CHANGE') continue
        const kind = KIND[p.type] ?? String(p.type).toUpperCase()
        const pos = String(p.position || '').replace(/,/g, '/')
        insAct.run(id(), LEAGUE_ID, p.type === 'DRAFT' ? 'DRAFT' : 'WAIVER', `${clubs[t.ysf_id].abbr} ${kind.toLowerCase()} ${p.name} (${codeOf}, ${pos})`, teamId[t.ysf_id], String(t.date).replace('T', ' '),
          JSON.stringify({ kind, sport, player: firstLast(p.name), team: proAbbr(sport, p.real_team), pos, bid: t.bid && p.type === 'WW' ? Math.round(t.bid) : null, season: '2025-26', ...(p.type === 'DRAFT' && t.pick_info ? { pick: t.pick_info } : {}) }))
        nPrevTx++
      }
    }
  }
  const trPrev = await getJson('/data/trades_2025-26.json').catch(() => null)
  const sportOfName = (name: string) => SPORTS.map(x => x.sport).find(sp => byName.has(sp + '|' + norm(name))) ?? ''
  for (const t of trPrev?.trades ?? []) {
    const sides = (t.sides ?? []).filter((x: any) => teamId[x.ysf_id]); if (sides.length < 2) continue
    const gets: any[] = sides.map((sd: any) => ({ teamId: teamId[sd.ysf_id], gets: (sd.acquires ?? []).map((a: any) => {
      const lgm = /\b(ySF\w\w)\b/.exec(a.name ?? '')
      if (!a.position && !a.real_team) return { name: a.name, sport: lgm ? sportOf[lgm[1]] ?? '' : 'PICK', team: '', pos: '' }   // draft pick
      const sp = sportOfName(a.name)
      return { name: firstLast(a.name), sport: sp, team: sp ? proAbbr(sp, a.real_team) : a.real_team, pos: String(a.position || '').replace(/,/g, '/') }
    }) }))
    const text = 'Trade: ' + gets.map(g => `${Object.entries(teamId).find(([, v]) => v === g.teamId)?.[0] ? clubs[Object.entries(teamId).find(([, v]) => v === g.teamId)![0]].abbr : ''} gets ${g.gets.map((x: any) => x.name).join(', ')}`).join('; ')
    insAct.run(id(), LEAGUE_ID, 'TRADE', text, gets[0].teamId, String(t.date).replace('T', ' '), JSON.stringify({ kind: 'TRADE', sides: gets, season: '2025-26' }))
  }

  // ── future draft picks (owned now, by original club) ──
  const insPick = db.prepare(`INSERT INTO draft_picks (id,league_id,sport,round,year,original_team_id,current_team_id,is_used) VALUES (?,?,?,?,?,?,?,?)`)
  let nPicks = 0
  const keyToSport: Record<string, string> = Object.fromEntries(SPORTS.map(s => [s.key, s.sport]))
  for (const [owner, seasons] of Object.entries<any>(picksAll.draft_picks_by_team ?? picksAll)) {
    if (!teamId[owner]) continue
    for (const [season, byLeague] of Object.entries<any>(seasons)) {
      const year = parseInt(season.slice(0, 4))
      for (const [lk, picks] of Object.entries<any>(byLeague)) {
        for (const p of picks) {
          if (!teamId[p.original_ysf_id] || !keyToSport[lk]) continue
          // 2026-27 ySFFL/ySFHL/ySFBA rookie drafts are done; the ySFLB draft is Nov 22, 2026
          const used = year === 2026 && keyToSport[lk] !== 'MLB' ? 1 : 0
          insPick.run(id(), LEAGUE_ID, keyToSport[lk], p.round, year, teamId[p.original_ysf_id], teamId[owner], used); nPicks++
        }
      }
    }
  }

  // ── upcoming rookie drafts: the exact Fantrax pick order (traded picks under their owners) ──
  // and the eligible pool (2026 MLB draftees, scripts/data/mlb-draft-2026.json). A draft whose
  // picks are pre-numbered runs off that order in the Nexus draft engine (non-snake).
  let draftsMade = 0
  for (const s of SPORTS) {
    const rd = await getJson(`/data/rookie_drafts/${SEASON}/${s.key}.json`).catch(() => null)
    if (!rd || !rd.picks?.length) continue
    const draftId = `${LEAGUE_ID}-${SEASON}-${s.sport.toLowerCase()}-rookie`
    if (rd.state === 'completed') {
      // finished draft: keep its results (who picked whom, in order) for History and the draft room
      db.prepare(`INSERT INTO drafts (id,league_id,kind,scope,season,type,rounds,status,starts_at,current_pick,pick_seconds) VALUES (?,?,?,?,?,?,?,?,?,?,300)`)
        .run(draftId, LEAGUE_ID, 'ROOKIE', s.sport, SEASON, 'LINEAR', rd.rounds, 'COMPLETED', rd.draft_date ? new Date(rd.draft_date.replace(/\.\d+(?=[+-])/, '').replace(/([+-]\d\d)(\d\d)$/, '$1:$2')).toISOString() : null, rd.picks.length + 1)
      const year = parseInt(SEASON.slice(0, 4))
      for (const p of rd.picks) {
        const owner = teamId[p.ysf_id], orig = teamId[p.via_ysf_id ?? p.ysf_id]
        if (!owner || !orig) continue
        const pid = p.name && !p.skipped ? playerFor(s.sport, p.name, p.position ?? '', p.real_team ?? '', p.player_id) : null
        const row = db.prepare(`SELECT id FROM draft_picks WHERE league_id=? AND sport=? AND year=? AND round=? AND original_team_id=? AND draft_id IS NULL LIMIT 1`).get(LEAGUE_ID, s.sport, year, p.round, orig) as any
        if (row) db.prepare(`UPDATE draft_picks SET draft_id=?, pick_number=?, current_team_id=?, is_used=1, picked_player_id=? WHERE id=?`).run(draftId, p.pick, owner, pid, row.id)
        else db.prepare(`INSERT INTO draft_picks (id,league_id,draft_id,sport,round,year,original_team_id,current_team_id,is_used,pick_number,picked_player_id) VALUES (?,?,?,?,?,?,?,?,1,?,?)`)
          .run(id(), LEAGUE_ID, draftId, s.sport, p.round, year, orig, owner, p.pick, pid)
      }
      continue
    }
    const startsAt = rd.draft_date ? new Date(rd.draft_date.replace(/\.\d+(?=[+-])/, '').replace(/([+-]\d\d)(\d\d)$/, '$1:$2')).toISOString() : null
    const prev = draftSettings.get(draftId)
    // ySF default pick timer: 5 minutes (commissioners can change it in the draft room)
    db.prepare(`INSERT INTO drafts (id,league_id,kind,scope,season,type,rounds,status,starts_at,current_pick,pick_seconds) VALUES (?,?,?,?,?,?,?,?,?,0,?)`)
      .run(draftId, LEAGUE_ID, 'ROOKIE', s.sport, SEASON, 'LINEAR', rd.rounds, 'PENDING', prev?.starts_at ?? startsAt, prev?.pick_seconds ?? 300)
    const year = parseInt(SEASON.slice(0, 4))
    for (const p of rd.picks) {
      const owner = teamId[p.ysf_id], orig = teamId[p.via_ysf_id ?? p.ysf_id]
      if (!owner || !orig) continue
      const row = db.prepare(`SELECT id FROM draft_picks WHERE league_id=? AND sport=? AND year=? AND round=? AND original_team_id=? AND draft_id IS NULL AND is_used=0 LIMIT 1`)
        .get(LEAGUE_ID, s.sport, year, p.round, orig) as any
      if (row) db.prepare(`UPDATE draft_picks SET draft_id=?, pick_number=?, current_team_id=? WHERE id=?`).run(draftId, p.pick, owner, row.id)
      else db.prepare(`INSERT INTO draft_picks (id,league_id,draft_id,sport,round,year,original_team_id,current_team_id,is_used,pick_number) VALUES (?,?,?,?,?,?,?,?,0,?)`)
        .run(id(), LEAGUE_ID, draftId, s.sport, p.round, year, orig, owner, p.pick)
    }
    draftsMade++
  }
  // rookie-eligible pool for the ySFLB draft
  const poolFile = path.join(process.cwd(), 'scripts', 'data', 'mlb-draft-2026.json')
  if (fs.existsSync(poolFile)) {
    const pool = JSON.parse(fs.readFileSync(poolFile, 'utf8')).players as any[]
    for (const d of pool) {
      const pos = String(d.position || 'UTIL').split(/[,/]/)
      const pid = byName.get('MLB|' + norm(d.name))
      if (pid) db.prepare(`UPDATE players SET is_rookie=1, adp=?, real_team_abbr=COALESCE(real_team_abbr, ?) WHERE id=?`).run(d.pick, d.org, pid)
      else {
        const nid = 'fx_' + (d.fantraxId || nanoid())
        db.prepare(`INSERT OR IGNORE INTO players (id,external_id,name,sport,position,eligible_positions,real_team,real_team_abbr,status,is_rookie,adp,projected_points) VALUES (?,?,?,?,?,?,?,?,?,1,?,0)`)
          .run(nid, null, d.name, 'MLB', pos[0], JSON.stringify(pos), d.org, d.org, 'ACTIVE', d.pick)
        db.prepare(`UPDATE players SET is_rookie=1, adp=? WHERE id=?`).run(d.pick, nid)
        byName.set('MLB|' + norm(d.name), nid)
      }
    }
  }

  // ── 2025-26 season: final standings + results per league, and the Federation Cup ──
  const PREV = '2025-26'
  const fed26 = await getJson(`/data/archives/${PREV}/federation.json`).catch(() => null)
  const fedRank: Record<string, Record<string, number>> = {}
  for (const t of fed26?.federation_standings ?? []) for (const [lk, v] of Object.entries<any>(t.by_league ?? {})) (fedRank[lk] ??= {})[t.team_id] = v.rank
  let nPrev = 0
  SPORTS.forEach((s, i) => {
    const a = archives[i]; if (!a?.standings) return
    for (const r of a.standings) {
      if (!teamId[r.ysf_id]) continue
      insRec.run(id(), teamId[r.ysf_id], LEAGUE_ID, PREV, s.sport, r.w, r.l, r.t ?? 0, r.pf ?? 0, r.pa ?? 0, fedRank[s.key]?.[r.ysf_id] ?? r.final_rank ?? r.rank, r.faab_remaining ?? 0, 0)
      if (r.ysf_id === a.champion_ysf_id) db.prepare(`UPDATE team_records SET is_champion=1 WHERE league_id=? AND season=? AND sport=? AND team_id=?`).run(LEAGUE_ID, PREV, s.sport, teamId[r.ysf_id])
    }
    for (const m of a.matchups ?? []) {
      if (!teamId[m.home_ysf_id]) continue
      insMatch.run(id(), LEAGUE_ID, s.sport, PREV, m.period, teamId[m.home_ysf_id], m.away_ysf_id ? teamId[m.away_ysf_id] ?? null : null, m.home_score ?? 0, m.away_score ?? 0, m.complete ? 1 : 0, m.is_playoff ? 1 : 0); nPrev++
    }
  })
  const fedChamp = (fed26?.federation_standings ?? [])[0]

  // ── 2025-26 champions ──
  const insHist = db.prepare(`INSERT INTO league_history (id,league_id,season,scope,champion_team_id,runner_up_team_id,note) VALUES (?,?,?,?,?,?,?)`)
  SPORTS.forEach((s, i) => {
    const a = archives[i]; if (!a?.champion_ysf_id) return
    insHist.run(id(), LEAGUE_ID, '2025-26', s.sport, teamId[a.champion_ysf_id], teamId[a.runner_up_ysf_id] ?? null, s.code)
  })
  if (fedChamp && teamId[fedChamp.team_id]) {
    const second = (fed26.federation_standings ?? [])[1]
    insHist.run(id(), LEAGUE_ID, '2025-26', 'OVERALL', teamId[fedChamp.team_id], second ? teamId[second.team_id] ?? null : null, `${fedChamp.total_fed_pts} Federation points`)
  }

  // ── parity check: rebuild W-L-PF from the imported matchups, compare with the feed ──
  let mismatches = 0
  for (const s of SPORTS) {
    // Fantrax's PF includes the period in progress; W-L counts finished periods only.
    const rows = db.prepare(`SELECT home_team_id h, away_team_id a, home_score hs, away_score as_, is_complete done FROM matchups WHERE league_id=? AND season=? AND sport=? AND is_playoff=0`).all(LEAGUE_ID, SEASON, s.sport) as any[]
    const calc: Record<string, { w: number; l: number; t: number; pf: number }> = {}
    const bump = (t: string) => (calc[t] ??= { w: 0, l: 0, t: 0, pf: 0 })
    for (const r of rows) {
      bump(r.h).pf += r.hs; bump(r.a).pf += r.as_
      if (!r.done) continue
      if (r.hs > r.as_) { calc[r.h].w++; calc[r.a].l++ } else if (r.as_ > r.hs) { calc[r.a].w++; calc[r.h].l++ } else { calc[r.h].t++; calc[r.a].t++ }
    }
    for (const st of feeds[s.sport].standings as any[]) {
      const c = calc[teamId[st.ysf_id]] ?? { w: 0, l: 0, t: 0, pf: 0 }
      const ok = c.w === st.w && c.l === st.l && Math.abs(c.pf - st.pf) < 0.6
      if (!ok) { mismatches++; console.log(`  ✗ ${s.code} ${clubs[st.ysf_id].abbr}: feed ${st.w}-${st.l} ${st.pf} · rebuilt ${c.w}-${c.l} ${c.pf.toFixed(1)}`) }
    }
  }

  // Federation Cup: 12 points for 1st down to 1 for 12th in every league that has started
  let cupOff = 0
  const fedTeams: any[] = fedFeed?.federation_standings ?? []
  for (const ft of fedTeams) {
    const k = ft.team_id ?? ft.ysf_id; if (!teamId[k]) continue
    const mine = (db.prepare(`SELECT COALESCE(SUM(13 - finish_position),0) p FROM team_records WHERE league_id=? AND season=? AND team_id=? AND finish_position IS NOT NULL`).get(LEAGUE_ID, SEASON, teamId[k]) as any).p
    if (mine !== ft.total_fed_pts) { cupOff++; console.log(`  ✗ Cup ${clubs[k].abbr}: ySF ${ft.total_fed_pts} · Nexus ${mine}`) }
  }
  console.log(`\nImported "yoy Sports Federation" (league id "${LEAGUE_ID}", ${SEASON})`)
  console.log(`  ${Object.keys(teamId).length} clubs · ${rostered} roster spots (${created} new player rows) · ${nMatch} matchups`)
  console.log(`  ${trades.trades.length} trades · ${nTx} signings/claims/releases · ${nPicks} future picks · 2025-26: ${trPrev?.trades?.length ?? 0} trades, ${nPrevTx} moves`)
  console.log(fedTeams.length ? (cupOff ? `  Cup: ${cupOff} clubs differ from ySF (listed above)` : '  Cup: every club\'s Federation Cup points match ySF') : '  Cup: federation.json not readable, skipped')
  console.log(mismatches ? `  Parity: ${mismatches} club-league records differ from Fantrax (listed above)` : '  Parity: every club record matches Fantrax (W-L and PF, all four leagues)')
  if (newAccounts) console.log(`\n  Created ${newAccounts} owner logins: <club>@ysf.local (e.g. ferrante@ysf.local)` + (process.env.YSF_IMPORT_PASSWORD ? ' with YSF_IMPORT_PASSWORD' : ` · password: ${pwPlain}`))
}

main().catch(e => { console.error(e); process.exit(1) })
