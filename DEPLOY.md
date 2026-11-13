# Deploying the ySF app on Railway

One always-on service plus a persistent volume. The volume holds everything that has to survive
restarts and deploys: the SQLite database, every stored API response (Tank01 box scores, NHL games,
Fantrax history) and the logs. Past data is always read from the volume; the APIs are only called for
new games, live games and the daily injury and experience lists.

## 1. Create the service

1. In Railway: **New Project → Deploy from GitHub repo** → this repository, branch to deploy.
   Railway finds `railway.json` and builds with the `Dockerfile`.
2. **Add a volume** to the service, mount path **`/app/data`** (5 GB is plenty).
3. Keep it to **one replica** (SQLite and the scheduler expect a single server).

## 2. Variables (service → Variables)

| Variable | Value |
|---|---|
| `NEXTAUTH_SECRET` | a long random string (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | the public URL, e.g. `https://app.example.com` (no trailing slash) |
| `APP_URL` | same as `NEXTAUTH_URL` (used in invite links) |
| `TANK01_RAPIDAPI_KEY` | the RapidAPI key from `.env` |
| `TANK01_HOST_NFL` / `_NBA` / `_NHL` / `_MLB` | copy from `.env` |
| `CRON_SECRET` | a long random string (protects `/api/cron/*`) |
| `RESTORE_TOKEN` | a long random string — **only for step 3**, delete afterwards |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | see step 5 (optional until then) |
| `APPLE_ID` / `APPLE_SECRET` | see step 5 (optional until then) |

Optional: `YSF_SCHEDULER=off` stops the background data jobs; `YSF_RUN_DRAFTS=on` lets the app start
drafts at their set time and auto-pick when a clock runs out — leave it off until drafts move off Fantrax.

## 3. Upload the data once

On this Mac:

```bash
scripts/pack-data.sh
```

```bash
curl -X POST "https://YOUR-URL/api/admin/restore" -H "Authorization: Bearer YOUR_RESTORE_TOKEN" --data-binary @ysf-data.tar.gz
```

Then **delete `RESTORE_TOKEN`** in Railway (this redeploys and restarts the service on the restored data).

## 4. Domain

Service → Settings → Networking → **Custom domain**; add the CNAME record it shows at your DNS
provider. Update `NEXTAUTH_URL` and `APP_URL` to the domain.

## 5. Google and Apple sign-in (optional)

- **Google:** Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web).
  Authorized redirect URI: `https://YOUR-DOMAIN/api/auth/callback/google`. Copy the ID and secret.
- **Apple:** Apple Developer → Identifiers → a Services ID with Sign in with Apple; return URL
  `https://YOUR-DOMAIN/api/auth/callback/apple`. `APPLE_SECRET` is a signed JWT made from the key
  (`.p8`), team ID and key ID; it expires every 6 months.

The buttons appear on the sign-in and invite pages as soon as the variables are set.

## 6. Owner accounts

League → Commissioner → **Members → Club accounts**: **Create link** for each club, copy it and send it
to that owner. They open it and continue with Google or Apple, or choose an email and password. Links
work once and last 14 days; **New link** replaces an unused one.

## Upgrades

Every deploy runs `src/db/upgrade.ts` before the server starts. To change the schema, add the next
numbered file in `src/db/upgrades/` (and update `src/db/schema.ts`). Never run `npm run db:migrate` or
`db:reset` on the server — they rebuild the database from scratch.

## Backups

If your Railway plan includes volume backups, schedule them daily from the volume's settings. For a copy on your own
machine, run `scripts/pack-data.sh` against a downloaded database, or add a scheduled backup later.
