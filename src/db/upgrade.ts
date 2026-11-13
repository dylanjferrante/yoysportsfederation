/**
 * Versioned database upgrades — safe on a database with live data (unlike src/db/migrate.ts, which
 * rebuilds from scratch for local development).
 *   npm run db:upgrade
 * Applies every src/db/upgrades/NNNN_name.sql not yet recorded in schema_migrations, in order, each in
 * a transaction. Adding a column that already exists is skipped, so an upgrade can also bring an older
 * database in line. To change the schema: add the next numbered .sql file (and update schema.ts).
 * Runs on every deploy before the server starts (see Dockerfile).
 */
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

const DIR = path.join(process.cwd(), 'data')
fs.mkdirSync(DIR, { recursive: true })
const db = new Database(path.join(DIR, 'nexus.db'))
db.pragma('journal_mode = WAL')
db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`)

const UP = path.join(process.cwd(), 'src', 'db', 'upgrades')
const done = new Set((db.prepare(`SELECT id FROM schema_migrations`).all() as { id: string }[]).map(r => r.id))
// split on semicolons that end a statement (none of the upgrade files use semicolons inside strings)
const statements = (sql: string) => sql.replace(/^\s*--.*$/gm, '').split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(Boolean)

let applied = 0
for (const f of fs.readdirSync(UP).filter(f => /^\d{4}_.+\.sql$/.test(f)).sort()) {
  const id = f.replace(/\.sql$/, '')
  if (done.has(id)) continue
  db.transaction(() => {
    for (const st of statements(fs.readFileSync(path.join(UP, f), 'utf8'))) {
      try { db.exec(st) } catch (e: any) {
        if (/duplicate column name/i.test(e.message)) continue
        throw new Error(`${f}: ${e.message}\n${st.slice(0, 300)}`)
      }
    }
    db.prepare(`INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)`).run(id, new Date().toISOString())
  })()
  console.log(`applied ${id}`); applied++
}
console.log(applied ? `${applied} upgrade${applied > 1 ? 's' : ''} applied` : 'database is up to date')
