# ySF on Nexus: engineering plan

_Written Nov 12, 2026. Goal: the yoy Sports Federation runs entirely on its own app, so Fantrax can be switched off: four leagues, twelve clubs, one Federation, correct to the decimal and safe to run for a decade._

---

## 1. What we are building, and what it is not

**The shape of the problem.** One Federation of 12 clubs. Each club owns a dynasty roster in four leagues (ySFFL, ySFHL, ySFBA, ySFLB). Each league finishes 1st–12th, and the finishes turn into Federation Cup points (12 down to 1, max 48). A Federation season runs about 13 months, so seasons overlap: 2025-26 ySFLB was still playing when 2026-27 ySFFL kicked off.

**Scale is not the hard part; correctness and the calendar are.** The users are 12 owners and 3 commissioners. Peak load is a draft night or a Sunday in October. A single server with SQLite handles this with room to spare. The real difficulty is:

1. **Time:** four sports, each with its own period calendar (Thu–Wed football weeks, Mon–Sun daily-lineup periods, two-week All-Star periods, playoffs), overlapping seasons, per-player lineup locks, and per-day lineups in three of the four leagues.
2. **Scoring fidelity:** the app must reproduce Fantrax's scores exactly, so no result changes when we switch.
3. **Rules depth:** FAAB blind bids, 48-hour trade review, no-trade windows, pick ownership, taxi squads, roster limits, playoff reseeding, Cup tiebreakers. All of it comes from the Constitution and must be enforced by code, not by commissioners.
4. **Trust:** owners must believe the numbers. Every score has to be explainable down to the stat line, and every move has to be auditable.

**Design rule.** Optimize for correctness, auditability and recoverability, not throughput. No microservices, no Postgres migration, no Redis until there is a reason.

---

## 2. Where things stand

| Area | State | Notes |
|---|---|---|
| ySF look (Site Redesign) on live data | **Done** | Home, Standings, Scores, Leagues, Clubs, Club, Moves, History, Report, Rankings, Cup Race, Draft room, My Club, More, ticker, phone tab bar |
| History | **Done** for 2025-26 | Standings, matchups, champions, 3,102 moves, 25 trades, rookie drafts |
| Calendar | **Fixed this week** | Federation weeks are Mon–Sun with calendar-day math; weeks numbered per season; prior-season overlap shown on Scores |
| Lineups (UI + API) | Partial | Daily and weekly cadence, per-day locks, multi-position. Not checked against ySF roster limits (max 3 QB / 4 G / 13 P), IR eligibility or taxi rules |
| Draft engine | Mostly done | Preassigned slots, linear and snake, rookie pool, taxi, timer, commissioner settings. Pick-ownership ledger and trading future picks still missing |
| Waivers / FAAB | Exists in Nexus | Not checked against ySF rules ($250/league, worse-record tiebreak, run times per league) |
| Trades | Exists in Nexus | Approvals and votes tables exist. Missing: 48h review clock, challenge flow, no-trade windows, FAAB and pick assets, cross-league legality |
| Playoffs | Exists in Nexus | Must match ySF: top 6, byes for 1–2, reseeded semis, consolation for 3rd–6th, 7–12 by record |
| Matchup scoring | **Not ySF-correct** | Scores are copied from ysffantasy.com (which scrapes Fantrax). The Nexus engine sums stats per Mon–Sun week and puts each player's games on one day, which is wrong for Thu–Wed football and for daily lineups |
| Stats | Partial | Tank01 box scores are cached on disk; they feed season stats only |
| Accounts | Partial | NextAuth with placeholder `@ysf.local` accounts; no invites, roles or co-managers |
| Data source of truth | **ysffantasy.com feeds** | `ysf:import` **deletes and rebuilds** the league. This must end before any owner action in the app is real |
| Database migrations | **Risky** | `src/db/migrate.ts` drops and recreates tables. Real data needs versioned migrations |
| Jobs | Ad hoc | `/api/cron/advance`, `npm run ysf:sync`, run by hand |
| Tests | 58 unit tests | No scoring golden tests, no end-to-end tests |
| Hosting, backups, monitoring | None | Runs on a laptop |

**Fact that shapes validation.** Fantrax's public API (`fxea/getTeamRosters`) returns only the **current** roster, whatever `period` is asked for. Checked Nov 12 on ySFHL periods 1, 7 and 40: identical lineups. Past lineups cannot be fetched, so the scoring engine can't be checked by replaying history. It has to run **forward, in parallel with Fantrax**, saving each day's lineups as they lock.

---

## 3. Architecture

```
            ┌─────────────── Next.js app (pages + API) ───────────────┐
 owners ──► │  pages (server components)   API routes (mutations)     │
            │          │                        │                     │
            │          ▼                        ▼                     │
            │   read models (ysf-data)    domain services (pure + tx) │
            └──────────┬──────────────────────────┬───────────────────┘
                       ▼                          ▼
                 SQLite (WAL) ◄──────── worker process (jobs) ──► Tank01 · Fantrax (shadow) · email/push
                       │
                 Litestream ──► object storage (continuous backup)
```

- **One server, two processes:** the web app and a **worker**, a long-running Node process for scheduled jobs. Same codebase, same database file.
- **Domain services are pure where possible.** Scoring, lineup legality, waiver resolution, playoff seeding, Cup points and trade legality take plain data in and return results, so they can be tested without a database. A thin layer loads inputs and writes results in one transaction.
- **Everything that changes state writes an audit row:** who, what, when, before and after. Owners can see moves; commissioners can see everything.
- **Read models stay as they are.** `src/lib/ysf-data.ts` and friends are fine at this scale; cache with `revalidate` where pages are heavy.
- **ysffantasy.com becomes a consumer.** After cutover the app publishes the same JSON feeds the site reads today (`docs/ysf-api-handoff-for-gabe.md`), so Gabe's site keeps working with no edits to his repo.

### Core data model additions

| Table | Purpose |
|---|---|
| `league_seasons` | One row per (league, season): phase (preseason / regular / deadline-passed / playoffs / complete), dates, rules version. Lets two seasons of the same league be active at once |
| `scoring_periods` | (league, season, period): start and end dates, playoff flag, matchup period vs. lineup day. Replaces "week = period" guesses. Multi-week periods are one row |
| `game_lines` | One row per (player, real game): date, opponent, final/live, raw stats, normalized stats, last fetched. The single source for all scoring |
| `lineup_days` | (club, league, date) → slot for every rostered player, frozen at each player's lock time. NFL uses one "day" per period |
| `matchup_lines` | Per-player points that make up each matchup score (date, slot, stats, points). Makes every score explainable |
| `pick_ledger` | Every rookie and Federation pick: original owner, current owner, history of trades |
| `faab_ledger` | Every FAAB change (claims, trades, commissioner adjustments); balance = sum |
| `jobs`, `job_runs` | Schedule, last run, status, duration, error. Shown on an admin health page |
| `audit_log` | Every state change |
| `shadow_diffs` | App score vs. Fantrax score per matchup, per player when available |

---

## 4. Workstreams

Each workstream lists what done means. "Golden test" means a frozen real-world case checked into `tests/golden/` and run in CI.

### W0 · Foundations (first, small, unblocks everything)

1. **Versioned migrations.** Replace drop-and-recreate with `drizzle-kit` migrations. Snapshot today's schema as migration 0001. Never drop data again.
2. **Stop the destructive import.** Split `ysf:import` into:
   - a **history importer** (one-off, idempotent, for past seasons), and
   - a **mirror sync**: incremental upserts from Fantrax and ysffantasy.com while in shadow mode that **never deletes** and never touches anything created in the app.
3. **Worker and jobs.** A `worker` entry point with a small scheduler (cron syntax), a per-job lock (one row per job, so two runs can't overlap) and `job_runs` history. Jobs are idempotent: running one twice changes nothing.
4. **CI.** Typecheck, lint, unit and golden tests on every commit (GitHub Actions).
5. **Error tracking and logs** (Sentry or similar), plus an admin **Health** page: job status, last stat fetch, API budget, shadow diff summary.

_Done when:_ migrations run forward on a copy of the live database without loss; mirror sync runs every 15 minutes without deleting anything; CI is green.

### W1 · Calendar and periods

1. Load `scoring_periods` for every league-season from Fantrax `getLeagueInfo` (scoringPeriods and matchups) and the ysffantasy.com schedule. Store real start and end dates, including two-week periods and playoffs.
2. One function answers "what is happening on date D": active league-seasons, period per league, lineup-lock state. Every page and job uses it.
3. **Per-player lock rule:** a player locks at his real game's start. NFL lineups are weekly per period; ySFHL, ySFBA and ySFLB lineups are per day within the period.
4. **Overlapping seasons:** every query is scoped by (league, season). The current season can differ per league; e.g. on Sep 15, 2026, ySFFL is 2026-27 while ySFLB is 2025-26.

_Done when:_ golden tests cover a Thu–Wed NFL week, a Mon–Sun NHL period, a two-week All-Star period, a playoff period and the September overlap.

### W2 · Stats ingestion

1. Ingest **per game**: Tank01 schedule → box score per finished (or live) game → `game_lines`. Use the existing on-disk cache and normalizers (FG distances, D/ST).
2. **Player identity:** a mapping table Fantrax id ↔ Tank01 id ↔ internal id, filled by id where available and by name + team + position otherwise, with a commissioner screen for unmatched players. An unmatched starter blocks the period from being marked final.
3. **Live polling:** every 5 minutes for games in progress, only for players on ySF rosters. **Stat corrections:** re-fetch finals at +24h and +72h (NFL: after the Tuesday corrections), then rescore.
4. **Budget:** estimate calls per day (MLB ~15 games/day, NHL and NBA ~10, NFL ~16/week) and pick the Tank01 tier. Keep the hard monthly cap and alert at 80%.

_Done when:_ every starter in a completed period has game lines, or an explicit "did not play"; corrections trigger a rescore automatically.

### W3 · Scoring engine (the heart of the switch)

1. Pure function: `scorePeriod(rules, period, lineupDays, gameLines) → { clubTotals, matchupLines }`. A stat counts only if the player was in a **starting slot on that game's date** and the game falls inside the period's dates.
2. **Rules from data, not code:** ySF scoring per league, read and diffed against Fantrax's `scoringSystem` so a mismatch is caught automatically. Covers D/ST points- and yards-allowed tiers (450–499 = −3), FG distance points, and anything MLB-specific such as pitcher or games-played limits if the rules have them.
3. **Rounding:** match Fantrax (score per stat line, round the total to one decimal) and record the rule in a test.
4. Persist `matchup_lines`, so the matchup page shows exactly where every point came from.
5. **Rescoring** is idempotent: run it any time, same answer. It updates standings, Cup points and odds.
6. **Commissioner override:** manual stat or score adjustment with a reason, kept in the audit log. Covers the Hamlin Rule (follow the platform's directive on cancelled games).

_Done when:_ golden tests cover each league's scoring rules, a D/ST tier edge, a FG distance, a multi-position player, a player who changes teams mid-week and a doubleheader.

### W4 · Shadow scoring against Fantrax (proof before cutover)

1. **Lineup capture job:** fetch Fantrax rosters for all 48 club-league rosters every 15 minutes on game days. Store the slot each player had **at his game's lock time** in `lineup_days`. Fantrax's API won't return past lineups, so from now on we record them ourselves.
2. **Backfill from Fantrax downloads** (the owner exports what the public API won't give):
   - **Transaction history** per league, including lineup changes if the export has them. This rebuilds every roster and slot change with timestamps.
   - **Per-period matchup or roster pages with each player's fantasy points.** These give the exact starters per day and Fantrax's own per-player points.
   
   Parse them into `lineup_days`, and add a `fantrax_points` column per player-day for comparison. This turns 2026-27 periods to date into golden tests, so validation doesn't have to wait for weeks of forward capture.
3. After each period ends: score it with W3 using the captured lineups, compare with Fantrax's final scores and write `shadow_diffs`.
4. **Diff triage:** stat correction timing, rule mismatch, missed lineup change (capture gap) or id mapping. Each cause gets a fix and a golden test.
5. **Cutover gate per league:** three consecutive periods where all 6 matchups match within 0.1 points, and no unexplained diffs.

_Done when:_ the Health page shows a green gate for a league.

### W5 · League operations (rules from the Constitution)

Each item is a pure rules module, a database transaction, audit rows, notifications and tests.

1. **Lineups**
   - Slot eligibility, roster maximums (ySFFL max 3 QB, ySFHL max 4 G, ySFLB max 13 P).
   - IR only for players listed injured or out.
   - Taxi squad: slots equal to rookie-draft rounds, eligibility, promotion.
   - Locks per player.
   - Warnings for a starter who is out or on a bye.
2. **Waivers and free agents**
   - FAAB blind bids, $250 per league per season, tiebreak to the worse record.
   - Processing times per league; a dropped player goes to waivers.
   - Free agents after waivers clear; no adds of players whose game has started.
   - FAAB ledger.
3. **Trades**
   - Assets: players across leagues, rookie and Federation picks, FAAB.
   - Legality checked at proposal **and** at execution: roster limits, no-trade windows from each league's deadline to the end of its playoffs.
   - 48-hour Commission review, challenge as bad faith or collusion, Commission vote.
   - Conditional trades recorded as Commission-stated terms.
   - The pick ledger moves on execution.
4. **Drafts**
   - Rookie drafts in reverse order of the prior season's standings.
   - Future-pick ownership from the pick ledger; trading picks during a draft.
   - Autopick from a queue; supplemental draft; expansion and Federation draft (rare, commissioner-run).
5. **Schedule generation**
   - The rotating 11-year round robin.
   - ySFFL pod games from the prior season's standings (Pod A: 1/6/9/10, B: 2/5/8/11, C: 3/4/7/12).
   - Generated once per season and approved by the Commission.
6. **Standings and playoffs**
   - Tiebreakers: Win%, Points For, head to head, head-to-head points.
   - Top 6 qualify with byes for 1–2; semis reseeded; consolation for 3rd–6th; 7–12 by record, then PF.
   - Champions and trophies written to history.
7. **Federation Cup**
   - Points per finish, plus the Comm. Res. IX tiebreakers (most 1st places → most 2nd-or-better → … → Win% → H2H).
   - Clinch and elimination math; our own season simulator.
   - Replace the ysffantasy.com odds feed after cutover.
8. **Season lifecycle per league**
   - Preseason → regular → deadline passed → playoffs → complete.
   - The next season is created while the prior one finishes.
   - FAAB resets, taxi rules, branding snapshot.
9. **Governance**
   - Proposals and votes with Constitution thresholds: amendments 75%, rules 51%, mid-season 83.34%, deadline changes 66.67%.
   - Commission actions log; dues.

_Done when:_ each module has unit tests for every rule cited, and an end-to-end test of the owner flow (set lineup, bid, propose trade, accept, review, execute).

### W6 · Accounts, roles and notifications

1. Real accounts for the 12 owners, by email invite (magic link), replacing the placeholder `@ysf.local` users. Co-managers per club. Roles: owner, co-manager, commissioner (3), admin.
2. A permission matrix enforced in every mutation route; tests for each role.
3. **Notifications** (push via PWA, plus email):
   - **Trades:** offered, accepted, under review, executed, challenged.
   - **Waivers:** results.
   - **Lineup warnings:** a starter is out or not playing.
   - **Drafts:** you're on the clock.
   - **Votes:** opened and closing soon.
   - **Weekly:** results.
   
   Each owner can turn each type on or off.
4. Session security: rate limits on auth, password reset, audit of logins.

### W7 · Product completeness and polish

1. **Every action in a page:**
   - **Matchups:** a matchup page with every player's points and box-score drill-down.
   - **Players:** the player page (stats, schedule, news, ownership history) and player search with filters.
   - **Trades:** the trade builder (multi-league, picks, FAAB).
   - **Commissioner:** the Commission console (approvals, overrides, schedule, settings).
2. **Phone first:** the App boards' layouts on every page; PWA install; safe areas; 375px with no sideways scroll; tap targets 44px or larger.
3. **Live:** scores refresh on Scores, Home and Matchup pages during games (server-sent events or a short poll).
4. **Brand rules:** they become a checklist in code review: lowercase y in ySF, logo variant matching its background, no rings, white on primaries, no helper captions, dates with years, player format "Name (ySFxx-TEAM, POS/POS)".
5. **Accessibility:** contrast, focus states, labels.

### W8 · Hosting and operations

1. One small VM (Fly.io or a $10–20/month VPS) with a persistent volume. App and worker run as two processes. TLS, domain.
2. **Backups:** Litestream continuous replication to object storage, plus a nightly snapshot kept 90 days. A restore drill once before cutover, then quarterly.
3. **Secrets** in the host's secret store (Tank01 key, auth secret, email, VAPID keys).
4. **Staging:** a copy of production on a `staging.` subdomain, refreshed from the backup, for trying releases.
5. **Runbook:**
   - Stat feed down → scores show "pending"; manual override available.
   - Bad deploy → roll back to the previous release.
   - Corrupt data → restore to a point in time.
   - Fantrax dispute → `matchup_lines` and the audit log are the record.

### W9 · Cutover from Fantrax

1. **Freeze point** per league at a period boundary. Reconcile rosters, IR and taxi, FAAB balances, pick ownership, pending claims and trades: app vs. Fantrax, zero differences, signed off by the Commission.
2. Owners act in the app only; Fantrax becomes read-only for the period of overlap; mirror sync turned off for that league.
3. Rollback: until the first period scored in-app is final, Fantrax can be resumed from the reconciled state.

---

## 5. Sequencing

Today is Nov 12, 2026. Seasons in flight:
- **ySFFL:** through mid-January.
- **ySFHL and ySFBA:** through April, with All-Star / Olympic breaks.
- **ySFLB:** rookie draft on Nov 22 (already in the app); season opens the week of Mar 22, 2027.

| Milestone | Target | Contents |
|---|---|---|
| **M0 Foundations** | late Nov 2026 | W0 complete; W1 periods table; mirror sync non-destructive |
| **M1 Shadow scoring live** | mid Dec 2026 | W2 + W3 + W4 running daily on all three live leagues; Health page |
| **M2 ySFLB Rookie Draft in the app** | Nov 22, 2026 | Already built; run it for real with a commissioner on hand (first real use) |
| **M3 Owner beta** | Jan 2027 | W6 accounts and invites; app hosted (W8); owners use it read-only alongside Fantrax; feedback round |
| **M4 Operations parity** | Feb–Mar 2027 | W5 lineups, waivers, trades, playoffs and Cup proven in tests and in shadow |
| **M5 ySFLB runs in the app** | Mar 22, 2027 | First league fully off Fantrax, from the first day of its season (no mid-season handoff) |
| **M6 Full Federation** | 2027-28 start (Sep 2027) | ySFFL, ySFHL and ySFBA start their seasons in the app; Fantrax off |

**Why this order.** Shadow scoring starts earliest because it needs weeks of data and is the main risk. Each league switches at **its own season start**, so no live season changes platform midstream. ySFLB goes first because its season starts soonest and its rookie draft is already in the app.

**Faster alternative.** Switch ySFHL and ySFBA mid-season at a period boundary in February, once their shadow gate is green. That's possible, but riskier: in-flight trades, FAAB and playoff races would have to be reconciled mid-season. The Commission's call.

---

## 6. Testing strategy

- **Unit:** every rules module (lineup legality, waiver resolution, trade legality, playoff seeding, Cup tiebreakers, period/lock calendar).
- **Golden:** real periods frozen with lineups, game lines and the Fantrax result. The engine must reproduce Fantrax to 0.1, and every shadow diff that turned out to be a bug becomes one.
- **Property tests:** e.g. rescoring twice gives the same result; FAAB never goes negative; roster limits hold after any sequence of moves.
- **End to end (Playwright):** sign in → set daily lineup → lock at game time → bid → waivers run → trade → review → execute → standings update.
- **Restore drill:** a backup actually restores and the app comes up on it.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Can't fetch past Fantrax lineups | Backfill from Fantrax exports (W4.2); capture forward from now (W4.1) |
| Tank01 stat gaps or corrections differ from Fantrax's provider | Correction re-fetches; diff triage; commissioner override; accept ±0.1 rounding only |
| Scoring rule we don't know about (unset tiers, edge cases) | Diff our rules against Fantrax `scoringSystem` automatically; Commission decides unclear cases (like the 450–499 band) |
| Destructive import wipes in-app actions | W0 stops it before any real owner action |
| Single server or disk loss | Litestream plus nightly snapshots; restore drill |
| Owners don't trust the numbers | Every point traceable in `matchup_lines`; shadow history published on the Health page |
| Gabe's site breaks after cutover | The app publishes the same JSON feeds; his repo is never touched |
| One developer, many rules | Rules as pure, tested modules; Constitution section cited in each module; Commission sign-off per milestone |

---

## 8. Immediate next steps

1. W0.1–W0.2: versioned migrations, and a non-destructive mirror sync replacing the delete-and-rebuild import.
2. W1: `scoring_periods` from Fantrax `getLeagueInfo` for all four leagues.
3. W4.1–W4.2: start the Fantrax lineup capture job now, and backfill 2026-27 to date from the owner's Fantrax exports (transaction history plus per-period matchup or roster pages).
4. W2 + W3: per-game `game_lines` and the period scorer; first golden tests from ySFFL Week 10.
5. M2: run the ySFLB Rookie Draft on Nov 22 in the app.
