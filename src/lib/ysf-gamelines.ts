// Per-game player stat lines from Tank01 box scores (cached on disk by ysf:sync), scored with the
// league's ySF scoring. One line per player per real game — the unit the ySF scorer works in:
// a stat counts only if the player was in a starting slot on that game's date.
import { countCall } from '@/lib/api-usage'
import fs from 'fs'
import path from 'path'
import { mapBoxScoreBase, deriveWeekly } from '@/lib/providers/boxscore-map'
import { scorePlayer } from '@/lib/scoring'

export type Sport = 'NFL' | 'NBA' | 'NHL' | 'MLB'
export type GameLine = { sport: Sport; gameId: string; date: string; tankId: string; name: string; team: string; stats: Record<string, number>; pts: number; dstTeam?: string }

// Players' lines from one box score, plus kicker FG distances and the two team defenses (NFL).
export function boxEntries(sport: Sport, body: any): { externalId: string; raw: any; extra?: Record<string, number> }[] {
  const ps = body?.playerStats ?? {}
  const out: { externalId: string; raw: any; extra?: Record<string, number> }[] = Object.entries<any>(ps).map(([pid, raw]) => ({ externalId: String(raw?.playerID ?? pid), raw }))
  if (sport === 'NFL') {
    const fg: Record<string, number[]> = {}
    for (const play of body?.scoringPlays ?? []) {
      if (String(play?.scoreType) !== 'FG') continue
      const m = /(\d+)\s*Yd/i.exec(String(play?.score ?? '')); const kid = String((play?.playerIDs ?? [])[0] ?? '')
      if (m && kid) (fg[kid] ??= []).push(+m[1])
    }
    for (const e of out) if (fg[e.externalId]) e.raw = { ...e.raw, __fgMade: fg[e.externalId] }
    // two-point conversions run or caught aren't in Tank01's player lines; read them from the scoring
    // plays: "(Dak Prescott Run for Two-Point Conversion)", "(Cam Ward Pass to Calvin Ridley for Two-Point Conversion)"
    const byName = new Map(out.map(e => [String(e.raw?.longName ?? '').toLowerCase(), e]))
    for (const play of body?.scoringPlays ?? []) {
      const txt = String(play?.score ?? '')
      const run = /\(([^()]+?) Run for Two-Point Conversion\)/i.exec(txt), rec = /\([^()]+? Pass to ([^()]+?) for Two-Point Conversion\)/i.exec(txt)
      const add = (name: string, key: string) => { const e = byName.get(name.trim().toLowerCase()); if (e) { e.extra ??= {}; e.extra[key] = (e.extra[key] ?? 0) + 1 } }
      if (run) add(run[1], 'rushing2pt')
      if (rec) add(rec[1], 'receiving2pt')
    }
    // points allowed BY THE DEFENSE (Fantrax's PA-Def): the opponent's points less return/recovery
    // touchdowns with their conversions, defensive two-point returns and safeties
    const paDef = (team: string) => {
      let pts = 0
      for (const play of body?.scoringPlays ?? []) {
        if (String(play?.team) === team) continue
        const t = String(play?.scoreType ?? ''), txt = String(play?.score ?? '')
        if (t === 'FG') pts += 3
        else if (t === 'TD') {
          if (/Return|Recovery|Blocked (Punt|Field Goal|FG)/i.test(txt)) continue
          pts += 6 + (/Two-Point Conversion\)/i.test(txt) && !/Failed/i.test(txt) ? 2 : /Kick\)/i.test(txt) && !/(Failed|Blocked|Missed)/i.test(txt) ? 1 : 0)
        }
      }
      return pts
    }
    for (const side of ['away', 'home']) {
      const d = body?.DST?.[side]
      if (d?.teamID) out.push({ externalId: `DST_${d.teamID}`, raw: { __dst: { ...d, ptsAllowed: Array.isArray(body?.scoringPlays) ? String(paDef(String(d.teamAbv))) : d.ptsAllowed } } })
    }
  }
  return out
}

const DEF_KEYS = new Set(['interception', 'sack', 'fumbleRecovery', 'defensiveTD', 'safety', 'safeties', 'blockedKick', 'ptsAllowed', 'yardsAllowed'])
const CACHE = () => path.join(process.cwd(), 'data', 'tank01-cache')

// Every cached final game for a sport between two dates (inclusive, YYYY-MM-DD).
// ySFHL: the NHL's official feed (scripts/nhl-sync.ts) for final games — exact power-play and
// short-handed points — and Tank01 for games still in progress. Player ids are "nhl:<id>" there.
function nhlOfficial(from: string, to: string, scoring: Record<string, number>): { lines: GameLine[]; games: Set<string> } {
  const dir = path.join(process.cwd(), 'data', 'nhl-cache')
  const lines: GameLine[] = [], games = new Set<string>()
  if (!fs.existsSync(dir)) return { lines, games }
  const ymd = (d: string) => d.replace(/-/g, '')
  // finals, then games in progress (data/nhl-cache/live, refreshed every couple of minutes) not yet final
  const liveDir = path.join(dir, 'live')
  const files = [...fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => path.join(dir, f)),
    ...(fs.existsSync(liveDir) ? fs.readdirSync(liveDir).filter(f => !fs.existsSync(path.join(dir, f))).map(f => path.join(liveDir, f)) : [])]
  for (const fp of files) {
    const f = path.basename(fp)
    const d = f.slice(0, 8); if (d < ymd(from) || d > ymd(to)) continue
    let g: any; try { g = JSON.parse(fs.readFileSync(fp, 'utf8')) } catch { continue }
    games.add(`${d}_${g.away}@${g.home}`)
    for (const l of g.lines) {
      const st: Record<string, number> = l.goalie
        ? { saves: l.goalie.sv, goalsAllowed: l.goalie.ga, wins: l.goalie.dec === 'W' ? 1 : 0, overtimeLoss: l.goalie.dec === 'O' ? 1 : 0, shutout: l.goalie.dec === 'W' && l.goalie.ga === 0 ? 1 : 0, goals: l.g, assists: l.a }
        : { goals: l.g, assists: l.a, shotsOnGoal: l.sog, hits: l.hit, blockedShots: l.blk, ppGoals: l.ppg, ppAssists: l.ppa, shGoals: l.shg, shAssists: l.sha }
      for (const k of Object.keys(st)) if (!st[k]) delete st[k]
      lines.push({ sport: 'NHL', gameId: f.replace(/\.json$/, ''), date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`, tankId: `nhl:${l.id}`, name: l.name, team: l.team, stats: st, pts: +scorePlayer(st, scoring).toFixed(2) })
    }
  }
  return { lines, games }
}

export function loadGameLines(sport: Sport, from: string, to: string, scoring: Record<string, number>, withLive = false): GameLine[] {
  if (sport === 'NHL' && !process.env.YSF_NHL_TANK01) {
    const off = nhlOfficial(from, to, scoring)
    if (off.games.size) {
      // games the official feed doesn't have yet (in progress) come from Tank01 (NHL ↔ Tank01 team codes differ)
      const NHL2T: Record<string, string> = { TBL: 'TB', NJD: 'NJ', LAK: 'LA', SJS: 'SJ', WSH: 'WSH' }
      const have = new Set([...off.games].map(k => k.replace(/[A-Z]{2,3}/g, t => NHL2T[t] ?? t)))
      const t = loadGameLinesTank01(sport, from, to, scoring, withLive).filter(g => !have.has(g.gameId.split('_').slice(0, 2).join('_')))
      return [...off.lines, ...t]
    }
  }
  return loadGameLinesTank01(sport, from, to, scoring, withLive)
}

function loadGameLinesTank01(sport: Sport, from: string, to: string, scoring: Record<string, number>, withLive = false): GameLine[] {
  const dir = path.join(CACHE(), sport)
  if (!fs.existsSync(dir)) return []
  const out: GameLine[] = []
  const finals = new Set(fs.readdirSync(dir))
  const liveDir = path.join(CACHE(), 'live', sport)
  const live = withLive && fs.existsSync(liveDir) ? fs.readdirSync(liveDir).filter(f => !finals.has(f)) : []
  for (const f0 of [...finals, ...live.map(f => '\u0000' + f)]) {
    const isLive = f0.startsWith('\u0000'), f = isLive ? f0.slice(1) : f0
    const m = /^(\d{4})(\d{2})(\d{2})_/.exec(f); if (!m) continue
    const date = `${m[1]}-${m[2]}-${m[3]}`
    if (date < from || date > to) continue
    let body: any
    try { body = JSON.parse(fs.readFileSync(path.join(isLive ? liveDir : dir, f), 'utf8')) } catch { continue }
    if (!isLive && !/final|completed/i.test(String(body?.gameStatus ?? ''))) continue
    for (const e of boxEntries(sport, body)) {
      const base: Record<string, number> = { ...mapBoxScoreBase(sport, e.raw) }
      if (!Object.keys(base).length) continue
      // fill two-pointers from the scoring plays only where Tank01's own line has none
      for (const [k, v] of Object.entries(e.extra ?? {})) base[k] = Math.max(base[k] ?? 0, v)
      // a player's own line never earns team-defense points (two-way players' defensive stats)
      if (sport === 'NFL' && !e.raw?.__dst) for (const k of Object.keys(base)) if (DEF_KEYS.has(k) || k.startsWith('idp')) delete base[k]
      const stats = deriveWeekly(sport, base)
      out.push({ sport, gameId: f.replace(/\.json$/, ''), date, tankId: e.externalId, name: String(e.raw?.longName ?? ''), team: String(e.raw?.teamAbv ?? e.raw?.__dst?.teamAbv ?? ''),
        stats, pts: +scorePlayer(stats, scoring).toFixed(2), dstTeam: e.raw?.__dst?.teamAbv })
    }
  }
  return out
}

// Fantrax and Tank01 spell a few teams differently
const ALIAS: Record<string, Record<string, string>> = {
  NHL: { TBL: 'TB', NJD: 'NJ', LAK: 'LA', SJS: 'SJ', CBJ: 'CBJ', UTA: 'UTA', MON: 'MTL', WAS: 'WSH' },
  NBA: { NYK: 'NY', GSW: 'GS', SAS: 'SA', NOP: 'NO', PHX: 'PHO', UTH: 'UTA', BKN: 'BKN' },
  NFL: { WAS: 'WSH', JAC: 'JAX' },
  MLB: { CHW: 'CWS', WAS: 'WSH', KCR: 'KC', SDP: 'SD', SFG: 'SF', TBR: 'TB' },
}
const ab = (sport: string, t: string) => ALIAS[sport]?.[t] ?? t
export const tankTeam = ab

// One team's game in a date range: "NSH 4 @ TOR 5 · Final/OT", "BOS 2 @ MTL 1 · 2nd 08:14", "@ CHI · 8:00 PM".
export function gameInfo(sport: string, team: string | null, from: string, to: string, schedule?: { id: string; status: string | null; epoch: string | null }[]): string | null {
  if (!team) return null
  const t = ab(sport, team)
  const dir = path.join(CACHE(), sport)
  const ymd = (d: string) => d.replace(/-/g, '')
  const pick = (dd: string) => fs.existsSync(dd) ? fs.readdirSync(dd).filter(f => { const d = f.slice(0, 8); return d >= ymd(from) && d <= ymd(to) && f.slice(9, -5).split('@').includes(t) }).map(f => path.join(dd, f)) : []
  const files = [...pick(dir), ...pick(path.join(CACHE(), 'live', sport))]
  const sideTag = (away: string, home: string, as: string | number, hs: string | number) => `${away} ${as} @ ${home} ${hs}`
  if (files.length) {
    try {
      const b = JSON.parse(fs.readFileSync(files[0], 'utf8'))
      const ls = b.lineScore ?? {}
      const as = b.awayPts ?? b.awayTotal ?? ls.away?.total ?? ls[b.away]?.totalPts ?? '', hs = b.homePts ?? b.homeTotal ?? ls.home?.total ?? ls[b.home]?.totalPts ?? ''
      let status = String(ls.period ?? b.currentPeriod ?? (/final|completed/i.test(String(b.gameStatus)) ? 'Final' : b.gameStatus) ?? '')
      if (/^final$/i.test(status) || /completed/i.test(status)) {
        const keys = JSON.stringify(ls)
        status = /"SO"|shootout/i.test(keys) && sport === 'NHL' && b.shootout === 'True' ? 'Final/SO' : /OT/.test(keys) ? 'Final/OT' : 'Final'
      }
      if (!/final/i.test(status)) {
        const per = String(ls.period ?? b.currentPeriod ?? '').trim(), clock = String(ls.gameClock ?? b.gameClock ?? '').trim()
        status = /int/i.test(per) || /int/i.test(clock) ? `${per.replace(/intermission/i, '').trim()} Intermission`.trim() : `${per}${clock && clock !== per ? ` ${clock}` : ''}`.trim() || 'Live'
      }
      return `${sideTag(b.away, b.home, as, hs)} · ${status}`
    } catch { /* fall through */ }
  }
  const g = schedule?.find(x => { const d = x.id.slice(0, 8); return d >= ymd(from) && d <= ymd(to) && x.id.slice(9).split('@').includes(t) })
  if (!g) return null
  const [away, home] = g.id.slice(9).split('@')
  const vs = t === home ? `vs ${away}` : `@ ${home}`
  if (g.status && /progress|live/i.test(g.status)) return `${vs} · Live`
  const when = g.epoch ? new Date(Number(g.epoch) * 1000).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET' : ''
  return `${vs}${when ? ` · ${when}` : ''}`
}

// Live games: fetch the box score from Tank01 (at most once a minute per game, kept on disk) so
// pages can show the live score and period/clock. Finals are written to the regular cache.
const HOSTS: Record<string, string> = {
  NFL: 'tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com', NBA: 'tank01-fantasy-stats.p.rapidapi.com',
  NHL: 'tank01-nhl-live-in-game-real-time-statistics-nhl.p.rapidapi.com', MLB: 'tank01-mlb-live-in-game-real-time-statistics.p.rapidapi.com',
}
export async function refreshLive(sport: string, gameIds: string[]): Promise<void> {
  const key = process.env.TANK01_RAPIDAPI_KEY
  if (!key || !gameIds.length) return
  const dir = path.join(CACHE(), 'live', sport)
  fs.mkdirSync(dir, { recursive: true })
  await Promise.all(gameIds.slice(0, 16).map(async id => {
    const f = path.join(dir, id.replace(/[^A-Za-z0-9_@]/g, '_') + '.json')
    try { if (fs.existsSync(f) && Date.now() - fs.statSync(f).mtimeMs < 60_000) return } catch { /* refetch */ }
    try {
      const host = process.env[`TANK01_HOST_${sport}`] || HOSTS[sport]
      const r = await fetch(`https://${host}/get${sport}BoxScore?gameID=${encodeURIComponent(id)}`, { headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': host }, cache: 'no-store' })
      countCall('tank01')
      if (!r.ok) return
      const j: any = await r.json(); const body = j?.body ?? j
      if (/final|completed/i.test(String(body?.gameStatus ?? ''))) fs.writeFileSync(path.join(CACHE(), sport, id.replace(/[^A-Za-z0-9_@]/g, '_') + '.json'), JSON.stringify(body))
      fs.writeFileSync(f, JSON.stringify(body))
    } catch { /* keep the last copy */ }
  }))
}

// Our stat keys → the Fantrax column keys the box-score columns use (so live lines display alike)
export function toFantraxStats(sport: string, s: Record<string, number>): Record<string, string> {
  const o: Record<string, number> = {}
  const set = (k: string, v: number | undefined) => { if (v != null) o[k] = (o[k] ?? 0) + v }
  if (sport === 'NFL') {
    if ('ptsAllowed' in s || 'yardsAllowed' in s) { set('PA-Def', s.ptsAllowed); set('YdA', s.yardsAllowed); set('Sk', s.sack); set('TA', (s.interception ?? 0) + (s.fumbleRecovery ?? 0)); set('Sft', s.safety ?? s.safeties); set('TDDST', s.defensiveTD) }
    else { set('YDS', s.passingYards); set('TD', s.passingTD); set('Int', s.passingInt); set('2Pa', s.passing2pt); set('YDS#8', s.rushingYards); set('TD#9', s.rushingTD); set('REC', s.receptions); set('YDS#11', s.receivingYards); set('TD#12', s.receivingTD); set('Tgt', s.targets); set('FL', s.fumbleLost); set('2RR', (s.rushing2pt ?? 0) + (s.receiving2pt ?? 0)); set('XP', s.xpMade); set('XPM', s.xpMissed); set('FGYd', s.fgYards) }
  } else if (sport === 'NHL') {
    if ('saves' in s || 'goalsAllowed' in s) { set('W', s.wins); set('OL+ShL', s.overtimeLoss); set('SV', s.saves); set('GA', s.goalsAllowed); set('SHO', s.shutout) }
    else { set('G', s.goals); set('A', s.assists); set('SOG', s.shotsOnGoal); set('PPP', (s.ppGoals ?? 0) + (s.ppAssists ?? 0)); set('SHP', (s.shGoals ?? 0) + (s.shAssists ?? 0)); set('Hit', s.hits); set('Blk', s.blockedShots) }
  } else if (sport === 'NBA') {
    set('PTS', s.points); set('REB', s.rebounds); set('AST', s.assists); set('ST', s.steals); set('BLK', s.blocks); set('TO', s.turnovers); set('3PTM', s.threesMade)
    set('FGM', s.fieldGoalsMade); set('FGA', (s.fieldGoalsMade ?? 0) + (s.fieldGoalsMissed ?? 0)); set('FTM', s.freeThrowsMade); set('FTA', (s.freeThrowsMade ?? 0) + (s.freeThrowsMissed ?? 0))
  }
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(+v.toFixed(2))]))
}
