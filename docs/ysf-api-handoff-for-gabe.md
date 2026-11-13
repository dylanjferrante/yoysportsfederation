# ySF platform — API handoff for Gabe's Claude

**From:** Dylan's Claude (working on the ySF redesign canvas and the Nexus repo)
**Date:** Nov 12, 2026
**Goal:** move every club off Fantrax so the ySF app (iOS/Android) and ysffantasy.com run the whole league: lineups, waivers, trades, drafts, scoring, votes. The redesign mockups are on the "ySF Site Redesign" canvas (desktop, mobile, and the app boards P1–P10, including the Dynamic Island and the iMessage app).

Please read this, answer the questions in §6, and say how a design or test client should connect (§6.1). Nothing below has been changed in Gabe's repo. It was only read, and all API calls were read-only `GET`s, apart from one `POST` with no credentials, which returned 401.

---

## 1. What exists today (tested Nov 12, 2026, ~6 PM ET)

Two FastAPI apps and the static feeds are live on `https://ysffantasy.com`. There's no CORS header on any of them, and the OpenAPI JSON isn't reachable (`/api/docs` loads but points at `/openapi.json`, which is 404).

### 1a. Static feeds — `https://ysffantasy.com/data/…` (all 200, refreshed by the scraper every few minutes)
`core.json`, `federation.json`, `federation_dominance.json`, `fed_cup_projection.json`, `power_rankings.json`, `h2h.json`, `history.json`, `dynasty.json`, `decade_race.json`, `draft_picks_by_team.json`, `draft_2025.json`, `constitution.json`, `bios.json`, `commission_notices.json`, `trades_2025-26.json`, `trades_2026-27.json`, `transactions_2026-27.json`, `league_ysf_{fl,hl,ba,lb}.json`, `archives/2025-26/{federation,ysf_fl,ysf_hl,ysf_ba,ysf_lb}.json`, `rookie_drafts/index.json`, `rookie_drafts/2026-27/ysf_{fl,hl,ba,lb}.json`, `ysf_fl_prev.json`.

### 1b. Engine API — `https://ysffantasy.com/api/…` (`api/main.py`, "ySF API")
| Route | Result |
|---|---|
| `GET /health` | 200 `{"status":"ok"}` |
| `GET /leagues`, `/leagues/{key}`, `/leagues/{key}/standings`, `/leagues/{key}/matchups/{period}`, `/leagues/{key}/rosters`, `/leagues/{key}/rosters/{team}` | 200 |
| `GET /leagues/{key}/lineups/{team}` | 200 |
| `GET /leagues/{key}/lineups/{team}/history` | 422 without required params (route exists) |
| `POST /leagues/{key}/lineups/{team}/set` | 401 unauthenticated (route exists) |
| `GET /players?search=&sport=&limit=` | 200 (search works) |
| `GET /teams`, `/teams/{key}` | 200 |
| `POST /scoring/ingest/...` | internal key only (not tested) |

### 1c. Portal API — `https://ysffantasy.com/api/v1/…` (`api_portal/main.py`, "ySF Portal API"; the iOS `APIClient` base URL)
- **Public, 200:** every `/data/*` route (constitution, federation, seasons…, glance, all-time, rookie-drafts, leagues/{key}/standings|matchups|rosters|bracket, teams/{key}, power-rankings, draft-capital, history, archives/{season}/{league}), `/taxi`, `/shop`. `/taxi/check` returns 422 without params.
- **Signed in, 401 as expected:** `/auth/me`, `/proposals`, `/trades`, `/trades/deadlines`, `/memos`, `/notifications/inbox`, `/notifications/prefs`, `/commission/taxi-audit`, `/ledn/me`.
- **Full route list (from source):**
  - **Auth:** login/refresh/sessions/logout/me, plus OAuth Apple/Google link and login.
  - **Trades:** list, deadlines, assets, submit, accept, reject, rescind, approve, commission-reject, process, dashboard.
  - **Proposals:** list, create, vote, open, close, reject. Thresholds are already coded: 51%, amendment 75%, emergency ⅚ with fallback.
  - **Memos:** CRUD.
  - **Notifications:** FCM token register, inbox, read, prefs, internal notify.
  - **Commission:** taxi audit.
  - **Other:** ledn, shop.

### 1d. Also found
- `portal/api/trade_imessage.php` + `portal/scripts/imessage_poll.py`: a Mac-side AppleScript poller that texts approved trades to the "yoy Sports Federation" group. Useful precedent for the iMessage app, though the new design is a real Messages extension (§4.6).
- `engine/providers/`: Tank01 (NFL/NBA/NHL/MLB) plus ESPN, NHL and MLB official providers. Dylan also pays for the Tank01 APIs, and the Nexus repo uses the same four Tank01 hosts.

## 2. Problems found (please verify)
1. **Engine standings disagree with Fantrax.** For example, `/api/leagues/ysf_fl/standings` vs `league_ysf_fl.json`:

   | Club | Engine (`/api`) | Fantrax feed |
   |---|---|---|
   | BASC | 7-2, 1,004.2 PF | 9-0, 1,039.8 PF |
   | SSU | 6-3 | 3-6 |
   | AAC | 5-4 | 2-7 |
   | OYSC | 5-4 | 8-1 |
   | MBJC | 3-6 | 6-3 |
   | KMU | 3-6 | 4-5 |

   **Dylan confirmed the Fantrax numbers are correct** (SSU 3-6, BASC 9-0), and ysffantasy.com shows them correctly, because the site reads the Fantrax feed. Only the engine's own endpoint (`/api/leagues/ysf_fl/standings`) is off, and nothing on the site uses it yet. Is the engine a shadow scorer still being validated? Where does it go wrong (scoring settings, missing stat categories, lineup slots, matchup schedule, ties), and what's left before it can replace Fantrax scoring?
2. **Player records without names:** `/api/players` has at least one player whose `name` is just its Fantrax id (`01zu8`, NHL, San Jose).
3. **No CORS headers:** browser clients on other origins can't call the APIs. That's fine for the native apps; the website's lineup page is same-origin.
4. **OpenAPI JSON 404 behind the proxy:** `/api/docs` references `/openapi.json`. Exposing `/api/openapi.json` and `/api/v1/openapi.json` would let both Claudes generate clients.
5. **Some data exists only as static feeds, not in the API:** league transactions (`transactions_2026-27.json`), the 2025 Federation Draft (`draft_2025.json`), the trade logs.

## 3. How the redesign canvas is connected right now
The canvas can't call the server at runtime: design artboards aren't allowed network access, and there's no CORS. So it's connected at build time. A sync script (`gen/sync.py` in Dylan's design workspace) pulls 35 endpoints from §1a/§1c (feeds plus `/api/v1/data/glance`, brackets, draft-capital, teams), validates the JSON and rebuilds every board. It's read-only and needs no credentials.

## 4. Endpoints the app needs that don't exist yet (to replace Fantrax)
Suggested shapes are in the portal API's style, all requiring auth unless marked public. "Nexus has" means Dylan's Nexus repo (Next.js) already implements it and can be ported or copied (§5).

### 4.1 Free agency & waivers (biggest gap)
- `GET /leagues/{key}/free-agents?search=&pos=&team=&status=&sort=`: available players, with eligibility, injury status and news. *Nexus has `/api/players`, `/api/watchlist`.*
- `POST /leagues/{key}/claims` `{add_player_id, drop_player_id?, faab_bid}`: waiver claim. `GET /claims` (mine, pending), `DELETE /claims/{id}`, `PATCH /claims/{id}` (re-order or rebid).
- `POST /leagues/{key}/add-drop` `{add, drop}`: instant free-agent signing outside waivers.
- `GET /leagues/{key}/waivers`: waiver order, FAAB remaining per club, next processing time. Plus a processing job, with results pushed as notifications. *Nexus has `/api/leagues/[id]/waivers`.*

### 4.2 Roster moves
- `POST /leagues/{key}/rosters/{team}/move` `{player_id, to: "IR"|"TAXI"|"BENCH"|slot}` with rule validation (taxi eligibility per Comm. Res. VII, IR eligibility).
- `GET /leagues/{key}/rules`: roster sizes, slots, taxi/IR limits, scoring settings. *Nexus has `/rules`, `/settings`, custom scoring tiers.*

### 4.3 Live scoring
- `GET /leagues/{key}/matchups/{period}/live`: player-level live points, game status and projections.
- Live push: either an SSE/WebSocket stream (`/stream/matchups/{period}`) or APNs Live Activity updates (§4.5). *Nexus has `/api/cron/stats`, `livestats.ts`, `/api/mobile/matchup/[id]`.*
- `GET /players/{id}`: season and game logs, news, ownership (which club rosters him in each league). Needed for the player card.

### 4.4 Drafts (rookie drafts are on Fantrax today)
- `GET /drafts/{id}`: order, picks and clock. `POST /drafts/{id}/pick`, `PUT /drafts/{id}/queue`, autopick settings.
- `GET /drafts/{id}/stream` (SSE) for the live draft room. *Nexus has `/api/drafts/[id]` and `/stream`.*

### 4.5 Notifications, Live Activities, Dynamic Island
- FCM registration exists. iOS Live Activities need **APNs push-to-start/update tokens**: `POST /notifications/live-activity/register` `{activity: "matchup", team, push_token}`, plus a server job that sends score updates over APNs (FCM can't update Live Activities).
- Notification types to add: waiver results, lineup lock warnings, draft "on the clock", vote opened/closing, trade offers.

### 4.6 iMessage app (canvas board P10)
The Commission sends votes, trade reviews, notices and draft reminders, and any club sends trade offers, matchups, Cup standings and player cards. Recipients act inside the card.
- `GET /proposals/{id}/card`: a compact summary for the bubble (title, threshold, yes/no counts, who has voted without their choices, status, closes_at).
- `POST /proposals/{id}/vote` already exists. Confirm the vote is per club (co-owners resolve one vote) and how the app knows the club (`/auth/me` should return `club_key` and `roles: ["commissioner"]`).
- `GET /trades/{id}/card`, `GET /matchups/{period}/{team}/card`, `GET /players/{id}/card`: small summaries the extension can render, behind the shared App Group sign-in.
- Optional: a signed share link (`/share/{token}`) as a web fallback for anyone on Android.

### 4.7 Data the redesign shows that's only in feeds or computed client-side
- `GET /data/leagues/{key}/transactions?team=`: club Transactions tab, Moves pages.
- `GET /data/drafts/federation-2025`: Federation Draft history.
- `GET /data/leagues/{key}/odds`: playoff (top-6) and title odds per club. Today the canvas computes these itself with a 6,000-run simulation; a server version keeps every client consistent. *Nexus has `/api/leagues/[id]/odds` and `/simulate`.*
- `GET /data/key-dates`: trade deadlines, draft dates, opening days (the League Office "Key dates" card is placeholders now).
- `GET /data/teams/{key}/schedule`: one club's matchups across all four leagues (the club calendar).

### 4.8 Commission tools
- Process waivers, lineup lock overrides, stat corrections and re-score, roster edits, and dues tracking. *Nexus has `/api/leagues/[id]/commish`, `/dues`, `/simulate`, `/import-history`.*

## 5. Nexus (Dylan's repo) — reuse rather than rebuild
`dylanjferrante/yoysportsfederation` (branch `claude/nexus-tank01-data-wiring-jyhcrp`) is a Next.js + Drizzle/SQLite four-sport fantasy platform built for exactly this (one franchise per owner across NFL, NBA, NHL and MLB, with federation standings). Its `src/app/api` has 49 routes, including:
- **Drafts:** `drafts/[id]` and `drafts/[id]/stream` (live draft room).
- **League operations:** `leagues/[id]/waivers`, `odds`, `simulate`, `playoffs`, `proposals`, `commish`, `dues`, `rules`, `settings`.
- **Social:** `chat`, `ticker`, `marketplace`, `sidegames`.
- **Trades:** `trades`, `trades/[id]`.
- **Mobile and push:** `mobile/login`, `mobile/league/[id]`, `mobile/matchup/[id]`, `mobile/push/register`, `push/subscribe`.
- **Scheduled jobs:** `cron/advance`, `cron/stats`.

Its `src/lib` has a scoring engine with custom tiers, live stats, lineup locks, standings math, odds and power rankings, and Tank01 providers for all four sports. There's also an Expo mobile app in `mobile/`.

**Question for Gabe's Claude:** which should own league operations?
- **(a)** Port Nexus's waivers, drafts, odds and live scoring into the ySF FastAPI backend.
- **(b)** Run Nexus as the league-ops service behind the ySF API.
- **(c)** Something else.

Either way there should be one scoring engine and one Tank01 integration, not two.

## 6. Questions for Gabe's Claude
1. **Connecting a test client:**
   - Is there a staging server (`beta.ysffantasy.com` is in the CORS allowlist)?
   - Can a test account with commissioner role be created there?
   - How should a non-app client authenticate: the `/api/v1/auth/login` bearer token, or an API key like the iMessage poller's `X-API-Key`?
2. The engine's ySFFL standings don't match the correct Fantrax standings (§2.1). What's causing it, and what's left before the engine can be trusted?
3. Push: is APNs configured, or FCM only? Is there an Apple Developer team that can add a Live Activity and a Messages extension to the ySF app?
4. Can `/openapi.json` be exposed for both APIs?
5. Is there a rate limit or cache policy we should respect for the read-only sync (currently ~35 GETs per run)?
6. Where should the endpoints in §4 live (§5)?
