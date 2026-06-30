import Database from 'better-sqlite3'
import path from 'path'

const db = new Database(path.join(process.cwd(), 'data', 'nexus.db'))
const addTo = (table: string, name: string, def: string) => {
  const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name)
  if (cols.includes(name)) { console.log('exists', `${table}.${name}`); return }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`)
  console.log('added', `${table}.${name}`)
}

addTo('leagues', 'logo_secondary', 'TEXT')
addTo('leagues', 'wordmark', 'TEXT')
addTo('leagues', 'division_logos_alt', `TEXT DEFAULT '{}'`)
addTo('leagues', 'division_wordmarks', `TEXT DEFAULT '{}'`)
addTo('leagues', 'losers_advance', `TEXT DEFAULT 'WINNER'`)
addTo('teams', 'archived', 'INTEGER DEFAULT 0')
addTo('teams', 'archived_at', 'TEXT')
addTo('teams', 'archived_sports', `TEXT DEFAULT '[]'`)
addTo('teams', 'replaced_by', 'TEXT')
console.log('done')
