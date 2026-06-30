# Scaling Nexus Federation

This is the honest state of the system with respect to running at scale, plus the
concrete path from "one league on a laptop" to "thousands of users." Nothing here
is hidden behind marketing — it lists what's done, what isn't, and what it costs.

## Where we are today

- **App:** Next.js 15 (App Router), server components + route handlers.
- **DB:** SQLite via `better-sqlite3` (`src/db/index.ts`). Single file, single
  writer. Great for one league and development; the bottleneck at scale.
- **Realtime:** draft updates use Server-Sent Events with an in-process event bus
  (`src/lib/draft-events.ts`) plus a slow DB-fingerprint poll as a safety net.
- **Live stats:** global ingestion — each real game is fetched **once** per run and
  upserted into every league/season that needs it (`src/lib/livestats.ts`), so API
  spend does **not** grow with league count. Hard monthly call budget.
- **Indexes:** hot query paths (rosters, matchups, standings, real stats, drafts,
  feeds) are indexed in `src/db/migrate.ts`.

## The three things that bite at scale, and the fix for each

### 1. Database: SQLite → Postgres
SQLite is single-writer and lives on local disk, so it can't be shared across
multiple app instances and serializes concurrent writes (drafts, waivers, trades).

**Path:** move to Postgres. Drizzle already supports it, so the work is mechanical:
- Swap `drizzle-orm/better-sqlite3` for `drizzle-orm/node-postgres` in `src/db/index.ts`,
  driven by `DATABASE_URL`.
- Port `src/db/schema.ts` from `sqliteTable` to `pgTable` (column-type mapping:
  `integer({mode:'boolean'})` → `boolean`, `text` timestamps → `timestamptz`).
- Generate migrations with `drizzle-kit` instead of the dev DROP-and-recreate in
  `migrate.ts`. The indexes listed in `migrate.ts` translate directly.
- Use a managed Postgres (Neon/Supabase/RDS) with a connection pool (PgBouncer or
  the provider's pooler) so serverless/multi-instance doesn't exhaust connections.

Until then, the app is correct but single-instance.

### 2. Realtime across instances: in-process bus → Redis
The draft SSE bus is per-instance. Behind a load balancer, a pick on instance A
won't instantly notify a client on instance B (the 2.5s fingerprint poll still
catches it). Replace `publishDraft`/`subscribeDraft` with **Redis pub/sub** (or
Postgres `LISTEN/NOTIFY`) behind the same API for instant cross-instance delivery.
The same Redis becomes the cache/rate-limit layer.

### 3. Sports-data cost
This is the dominant line item at every tier — not compute.

| Tier | Leagues / users | Compute + DB | Sports data | Realistic total |
|---|---|---|---|---|
| Hobby | 1–50 leagues | $0–40/mo | Tank01 free (1k calls) or ~$25–50/mo | **~$25–100/mo** |
| Growing | hundreds–low thousands | $70–300/mo | Tank01 paid live, 4 sports ~$250–900/mo | **~$400–1,200/mo** |
| Large | tens of thousands | $400–1,400/mo (replicas, Redis, multi-instance) | enterprise feed (SportsRadar/Genius) = $thousands/mo | **$2k–10k+/mo** |

Daily-finalize ingestion fits the free/basic tier. Live in-game scoring multiplies
calls — enable it (`liveScoring`) only with budget headroom or a paid feed.

## Background work: move it off the request path

Two things currently run inline on page render and must become scheduled jobs
before high league counts:

- **Season auto-advance** — `advanceLeague()` is called when a league page loads.
  At 1000+ leagues this runs redundant work on every visit. Move it to a cron/queue
  job, idempotent per league+week (the `/api/cron/stats` route is the seed of this).
- **Ticker / standings recompute** — `buildHeadlines` / `buildScoreboard` and
  standings recompute on every 45s poll. Precompute on the events that change them
  (score finalize, trade, waiver) and cache (Redis, short TTL); the client poll
  then reads cache instead of recomputing.

## Admin portal & payments

A separate operator surface, gated on a **global super-admin role** (today there is
only per-league commissioner — add `isSuperAdmin` on users, or a `platform_admins`
table, and gate `/admin/*` plus admin APIs on it).

What it covers:

- **Leagues:** search/list every league, drill in, transfer commissioner, suspend,
  delete. The cascade delete already exists (`DELETE /api/leagues/[id]`).
- **Users:** search, disable, password reset, view league memberships.
- **Payments:** real money via **Stripe** (the dues tracker is manual today). Stripe
  Customer per user/league; checkout for league fees or dues; webhooks mark dues paid
  and reconcile against the existing dues panel. Store only Stripe IDs — never card data.
- **Usage & cost:** Tank01 spend is already recorded in the `api_usage` table; surface
  it per-league alongside signups and activity over time.
- **Health:** job-queue status, error rates, last successful stats pull.

The admin portal is mostly queries + a role check, so it can be built on SQLite now
and ride through the Postgres migration unchanged.

## Operational checklist before a real launch

- [ ] Move to Postgres + connection pooler.
- [ ] Redis for the draft bus + caching + rate limiting.
- [ ] Move auto-advance + ticker/standings off the request path into jobs + cache.
- [ ] Global super-admin role + `/admin` portal.
- [ ] Stripe for payments; reconcile with the dues tracker.
- [ ] Run the stats cron (`/api/cron/stats`, `CRON_SECRET`) on a scheduler.
- [ ] Set VAPID keys (`npm run push:keys`) for push; confirm the Tank01 box-score
      field mappings against a live key (`npm run tank01:probe`).
- [ ] Load-test drafts (12+ concurrent) and the cron at N leagues.
- [ ] Backups + monitoring on the database.

## Tests

Money-path logic is unit-tested without a DB (pure functions):
`scoring`, `federation`, `boxscore-map`, `lineup` (start/sit optimizer),
`standings-math` (SoS + clinch). Run `npm test`.
