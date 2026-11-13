// Player news from Tank01's fantasy feeds: each sport's latest notes ("Player Name: what happened"),
// matched to the app's players by name and kept with the time the site first saw them (the feed has
// no dates). Pulled every hour by the scheduler — four calls a run.
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { tank01News, tank01Configured } from '@/lib/providers/tank01'

export type PlayerNote = { playerId: string; name: string; text: string; link: string; seen: string }
const SPORTS = ['NFL', 'NHL', 'NBA', 'MLB'] as const

export function ensurePlayerNewsSchema() {
  db.run(sql`CREATE TABLE IF NOT EXISTS ysf_player_news (id INTEGER PRIMARY KEY AUTOINCREMENT, sport TEXT NOT NULL, player_id TEXT NOT NULL,
    name TEXT NOT NULL, text TEXT NOT NULL, link TEXT NOT NULL, seen TEXT NOT NULL, UNIQUE(player_id, text))`)
  db.run(sql`CREATE INDEX IF NOT EXISTS ysf_player_news_player ON ysf_player_news (player_id, seen)`)
}

// names compared without accents, punctuation or suffixes ("Jr.", "III")
const key = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '')
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim()

export async function pullPlayerNews(): Promise<Record<string, number>> {
  ensurePlayerNewsSchema()
  const out: Record<string, number> = {}
  if (!tank01Configured()) return out
  for (const sport of SPORTS) {
    let items: { title: string; link: string }[] = []
    try { items = await tank01News(sport, { fantasyNews: 'true', maxItems: 100 }) } catch { continue }
    // players by name for the sport; a rostered player wins a tie between two of the same name
    const ps = db.all<{ id: string; name: string; rostered: number }>(sql`SELECT p.id, p.name, EXISTS(SELECT 1 FROM rosters r WHERE r.player_id = p.id) rostered
      FROM players p WHERE p.sport = ${sport}`)
    const byKey = new Map<string, { id: string; name: string; rostered: number }>()
    for (const p of ps) { const k = key(p.name), cur = byKey.get(k); if (!cur || (p.rostered && !cur.rostered)) byKey.set(k, p) }
    const now = new Date().toISOString()
    let n = 0
    for (const it of items) {
      const m = /^([^:]{3,60}):\s+([\s\S]+)$/.exec(decode(it.title))
      if (!m) continue
      const p = byKey.get(key(m[1]))
      if (!p) continue
      const r = db.run(sql`INSERT OR IGNORE INTO ysf_player_news (sport, player_id, name, text, link, seen) VALUES (${sport}, ${p.id}, ${p.name}, ${m[2].trim()}, ${decode(it.link)}, ${now})`)
      n += (r as any).changes ?? 0
    }
    out[sport] = n
  }
  return out
}

// the newest notes for a set of players: the latest per player, and the newest overall
export function playerNews(playerIds: string[], limit = 8): { latest: Map<string, PlayerNote>; recent: PlayerNote[] } {
  ensurePlayerNewsSchema()
  const latest = new Map<string, PlayerNote>(), recent: PlayerNote[] = []
  if (!playerIds.length) return { latest, recent }
  const rows = db.all<{ player_id: string; name: string; text: string; link: string; seen: string }>(sql`SELECT player_id, name, text, link, seen FROM ysf_player_news
    WHERE player_id IN ${playerIds} AND seen >= ${new Date(Date.now() - 30 * 86_400_000).toISOString()} ORDER BY seen DESC, id DESC`)
  for (const r of rows) {
    const note = { playerId: r.player_id, name: r.name, text: r.text, link: r.link, seen: r.seen }
    if (!latest.has(r.player_id)) latest.set(r.player_id, note)
    if (recent.length < limit) recent.push(note)
  }
  return { latest, recent }
}
