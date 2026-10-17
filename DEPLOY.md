# Deploying to Vercel + Turso

The app runs on a single SQLite database. Locally that's a file
(`data/nexus.db`); in production it's a hosted **Turso** (libSQL) database.
The code auto-selects: if `TURSO_DATABASE_URL` is set it uses Turso, otherwise
it falls back to the local file. Nothing else changes between environments.

## 1. Build the database locally

```bash
npm install
npm run db:reset        # creates & seeds data/nexus.db
```

## 2. Create the Turso database from that file

Install the Turso CLI (https://docs.turso.tech/cli/installation), then:

```bash
turso auth login
turso db create nexus --from-file data/nexus.db   # imports your seeded data
turso db show nexus --url                          # -> TURSO_DATABASE_URL
turso db tokens create nexus                       # -> TURSO_AUTH_TOKEN
```

Keep the URL and token for the next step.

## 3. Deploy on Vercel

1. vercel.com -> **Add New -> Project** -> import `fantasy_sports_project`.
2. Framework preset: **Next.js** (auto-detected). No build-command changes.
3. Add **Environment Variables**:

   | Name | Value |
   |------|-------|
   | `NEXTAUTH_SECRET` | a random string (`openssl rand -base64 32`) |
   | `NEXTAUTH_URL` | your deployed URL, e.g. `https://your-app.vercel.app` |
   | `TURSO_DATABASE_URL` | from step 2 |
   | `TURSO_AUTH_TOKEN` | from step 2 |
   | `TANK01_RAPIDAPI_KEY` | *(optional)* live sports data |
   | `TANK01_HOST_NFL` / `_NBA` / `_NHL` / `_MLB` | *(optional)* |

4. Click **Deploy**.

> `NEXTAUTH_URL` must match the real deployed URL or login will fail. On the
> first deploy you won't know the URL yet — deploy once, copy the assigned
> `*.vercel.app` URL into `NEXTAUTH_URL`, then redeploy. (A custom domain works
> the same way.)

## 4. Open it on your phone

Once deployed you get a public `https://…vercel.app` URL. Open it in any phone
browser and use **Add to Home Screen** — the app is a PWA (manifest + service
worker), so it installs like a native app.

## Updating data later

Re-import after a fresh local seed:

```bash
npm run db:reset
turso db shell nexus < <(sqlite3 data/nexus.db .dump)   # or re-create with --from-file
```

Or edit production data directly with `turso db shell nexus`.

## Optional: notifications (email + web push)

These are built in but dormant until configured — see the notification
preferences on the account page. Add on Vercel when ready:

- Email: `SMTP_URL`, `EMAIL_FROM` (and `npm i nodemailer`, then enable the block
  in `src/lib/transports/email.ts`).
- Web push: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`
  (generate with `npx web-push generate-vapid-keys`).

## Scheduled jobs (optional)

Live-stats pull and week rollover run via cron endpoints. Add a Vercel Cron (or
any scheduler) hitting them with the `CRON_SECRET` bearer:

- `GET /api/cron/stats`
- `GET /api/cron/advance`
