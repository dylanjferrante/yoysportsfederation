# Nexus Fantasy

A cross-sport fantasy platform — NFL, NBA, NHL, and MLB unified into one
federation. Each owner runs a single franchise that fields a roster in every
sport, and standings are aggregated into an overall "federation" championship.

Built with Next.js (App Router), TypeScript, Tailwind, Drizzle ORM + SQLite,
and NextAuth.

## Run it locally

Requirements: **Node 18+** (20 or 22 recommended) and npm.

```bash
# 1. Get the code
git clone <your-repo-url>
cd yoysportsfederation
git checkout claude/cross-sport-fantasy-platform-66nq4e

# 2. Create your .env from the template
cp .env.example .env
# then set NEXTAUTH_SECRET in .env to any random string, e.g.:
#   openssl rand -base64 32

# 3. Install + create and seed the local database (one command)
npm run setup        # = npm install && npm run db:reset

# 4. Start the dev server
npm run dev
```

Open **http://localhost:3000**.

Log in with the seeded demo account:

- **admin@nexusfantasy.com** / **password123** (commissioner)
- or any owner: `alex@example.com`, `sam@example.com`, … (same password)

## Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server (http://localhost:3000) |
| `npm run db:reset` | Rebuild + reseed the SQLite database (`data/nexus.db`) |
| `npm run db:seed` | Reseed only |
| `npm test` | Run the unit test suite (Vitest) |
| `npm run build` | Production build |
| `npm run db:studio` | Open Drizzle Studio to browse the database |

## Notes

- The database is a local file at `data/nexus.db` (created by `db:reset`); it's
  git-ignored, so each machine seeds its own.
- All player/stat/score data is **simulated** — seasons advance and resolve
  automatically (no commissioner action). A real sports-data provider
  (e.g. Sportradar) would later feed the `players` / `matchups` /
  `playerGameStats` tables, and the rest of the app works unchanged.
- `CRON_SECRET` (optional) protects the `/api/cron/advance` endpoint used by a
  scheduler in production to advance seasons.
