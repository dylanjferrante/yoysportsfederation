import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import path from 'path'
import fs from 'fs'

// Single source of truth for the database location. The migrate/seed scripts
// (run via tsx, which does not load .env) and the Next.js app (which does load
// .env) must agree on one file, so we resolve a fixed path here rather than
// reading DATABASE_URL — otherwise the app and the seeded data drift apart.
const DB_DIR = path.join(process.cwd(), 'data')
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })
const DB_PATH = path.join(DB_DIR, 'nexus.db')

const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })
export type DB = typeof db
