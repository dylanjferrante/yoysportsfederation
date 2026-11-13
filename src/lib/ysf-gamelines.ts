// Per-game player stat lines from Tank01 box scores (cached on disk by ysf:sync), scored with the
// league's ySF scoring. One line per player per real game — the unit the ySF scorer works in:
// a stat counts only if the player was in a starting slot on that game's date.
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
export function loadGameLines(sport: Sport, from: string, to: string, scoring: Record<string, number>): GameLine[] {
  const dir = path.join(CACHE(), sport)
  if (!fs.existsSync(dir)) return []
  const out: GameLine[] = []
  for (const f of fs.readdirSync(dir)) {
    const m = /^(\d{4})(\d{2})(\d{2})_/.exec(f); if (!m) continue
    const date = `${m[1]}-${m[2]}-${m[3]}`
    if (date < from || date > to) continue
    let body: any
    try { body = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) } catch { continue }
    if (!/final|completed/i.test(String(body?.gameStatus ?? ''))) continue
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

// One team's game in a date range: "NSH 4 @ TOR 5 · Final/OT", "BOS 2 @ MTL 1 · 2nd 08:14", "@ CHI · 8:00 PM".
export function gameInfo(sport: string, team: string | null, from: string, to: string, schedule?: { id: string; status: string | null; epoch: string | null }[]): string | null {
  if (!team) return null
  const t = ab(sport, team)
  const dir = path.join(CACHE(), sport)
  const ymd = (d: string) => d.replace(/-/g, '')
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => { const d = f.slice(0, 8); return d >= ymd(from) && d <= ymd(to) && f.slice(9, -5).split('@').includes(t) }) : []
  const sideTag = (away: string, home: string, as: string | number, hs: string | number) => `${away} ${as} @ ${home} ${hs}`
  if (files.length) {
    try {
      const b = JSON.parse(fs.readFileSync(path.join(dir, files.sort().pop()!), 'utf8'))
      const ls = b.lineScore ?? {}
      const as = b.awayPts ?? b.awayTotal ?? ls.away?.total ?? ls[b.away]?.totalPts ?? '', hs = b.homePts ?? b.homeTotal ?? ls.home?.total ?? ls[b.home]?.totalPts ?? ''
      let status = String(ls.period ?? b.currentPeriod ?? (/final|completed/i.test(String(b.gameStatus)) ? 'Final' : b.gameStatus) ?? '')
      if (/^final$/i.test(status) || /completed/i.test(status)) {
        const keys = JSON.stringify(ls)
        status = /"SO"|shootout/i.test(keys) && sport === 'NHL' && b.shootout === 'True' ? 'Final/SO' : /OT/.test(keys) ? 'Final/OT' : 'Final'
      }
      if (b.gameClock && !/final/i.test(status) && b.gameClock !== 'Final') status += ` ${b.gameClock}`
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
