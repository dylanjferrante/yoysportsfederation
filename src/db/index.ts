import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from './schema'
import path from 'path'
import fs from 'fs'

// One driver for both worlds: libSQL talks to a local SQLite file in
// development and to a hosted Turso database in production. Set
// TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN) to use Turso; with neither set we
// fall back to the same data/nexus.db file the migrate/seed scripts create, so
// local development is unchanged.
//
// Note: the migrate/seed scripts (src/db/migrate.ts, src/db/seed.ts) still use
// better-sqlite3 directly to build that local file — libSQL reads it via the
// file: URL. To deploy, seed locally then import data/nexus.db into Turso
// (see DEPLOY.md).
function resolveUrl(): string {
  const turso = process.env.TURSO_DATABASE_URL
  if (turso) return turso
  const dir = path.join(process.cwd(), 'data')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return `file:${path.join(dir, 'nexus.db')}`
}

const client = createClient({ url: resolveUrl(), authToken: process.env.TURSO_AUTH_TOKEN })

export const db = drizzle(client, { schema })
export type DB = typeof db
