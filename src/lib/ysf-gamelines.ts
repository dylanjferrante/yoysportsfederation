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
export function boxEntries(sport: Sport, body: any): { externalId: string; raw: any }[] {
  const ps = body?.playerStats ?? {}
  const out = Object.entries<any>(ps).map(([pid, raw]) => ({ externalId: String(raw?.playerID ?? pid), raw }))
  if (sport === 'NFL') {
    const fg: Record<string, number[]> = {}
    for (const play of body?.scoringPlays ?? []) {
      if (String(play?.scoreType) !== 'FG') continue
      const m = /(\d+)\s*Yd/i.exec(String(play?.score ?? '')); const kid = String((play?.playerIDs ?? [])[0] ?? '')
      if (m && kid) (fg[kid] ??= []).push(+m[1])
    }
    for (const e of out) if (fg[e.externalId]) e.raw = { ...e.raw, __fgMade: fg[e.externalId] }
    for (const side of ['away', 'home']) { const d = body?.DST?.[side]; if (d?.teamID) out.push({ externalId: `DST_${d.teamID}`, raw: { __dst: d } }) }
  }
  return out
}

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
      const base = mapBoxScoreBase(sport, e.raw)
      if (!Object.keys(base).length) continue
      const stats = deriveWeekly(sport, { ...base })
      out.push({ sport, gameId: f.replace(/\.json$/, ''), date, tankId: e.externalId, name: String(e.raw?.longName ?? ''), team: String(e.raw?.teamAbv ?? e.raw?.__dst?.teamAbv ?? ''),
        stats, pts: +scorePlayer(stats, scoring).toFixed(2), dstTeam: e.raw?.__dst?.teamAbv })
    }
  }
  return out
}
