// Publish hand-written ySF News stories from a JSON file (scripts/news/<day>.json), replacing any story
// already in the same slot. Each entry: { slot, kind, sport, writer, headline, dek, body: string[], clubs: string[] }.
//   npx tsx scripts/ysf-news-publish.ts scripts/news/2026-11-13.json
import fs from 'fs'
import { nanoid } from 'nanoid'
import { sql } from 'drizzle-orm'
import { db } from '../src/db'
import { ensureNewsSchema } from '../src/lib/ysf-news'

const file = process.argv[2]
if (!file) { console.error('Usage: npx tsx scripts/ysf-news-publish.ts <file.json>'); process.exit(1) }
ensureNewsSchema()
const season = db.all<{ s: string }>(sql`SELECT season s FROM leagues WHERE id = 'ysf'`)[0].s
const items = JSON.parse(fs.readFileSync(file, 'utf8')) as any[]
const now = Date.now()
items.forEach((a, i) => {
  db.run(sql`DELETE FROM ysf_news WHERE slot = ${a.slot}`)
  const published = new Date(now - (items.length - i) * 60_000).toISOString()   // keep the file's order, newest last
  db.run(sql`INSERT INTO ysf_news (id, slot, season, kind, writer, sport, headline, dek, body, clubs, published)
    VALUES (${nanoid(10)}, ${a.slot}, ${season}, ${a.kind}, ${a.writer}, ${a.sport}, ${a.headline}, ${a.dek}, ${JSON.stringify(a.body)}, ${JSON.stringify(a.clubs)}, ${published})`)
  console.log(`${a.slot}: ${a.headline}`)
})
