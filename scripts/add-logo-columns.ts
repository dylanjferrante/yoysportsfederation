import Database from 'better-sqlite3'
import path from 'path'

const db = new Database(path.join(process.cwd(), 'data', 'nexus.db'))
const cols = (db.prepare(`PRAGMA table_info(leagues)`).all() as { name: string }[]).map(c => c.name)
const add = (name: string, def: string) => {
  if (cols.includes(name)) { console.log('exists', name); return }
  db.exec(`ALTER TABLE leagues ADD COLUMN ${name} ${def}`)
  console.log('added', name)
}

add('logo_secondary', 'TEXT')
add('wordmark', 'TEXT')
add('division_logos_alt', `TEXT DEFAULT '{}'`)
add('division_wordmarks', `TEXT DEFAULT '{}'`)
add('losers_advance', `TEXT DEFAULT 'WINNER'`)
console.log('done')
