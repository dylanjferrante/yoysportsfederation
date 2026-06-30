# Federation Wire — headline catalog

Every headline the dashboard ticker can produce, and the exact condition that
makes it appear. All are generated from stored data by `src/lib/headlines.ts`
(no provider calls). Headlines are ranked by **priority** (shown below), then
recency; deduped; **capped per category** so one type can't swamp the feed; and
the top **28** are shown.

Two global rules:
- **Real-only data.** Score/streak/standings/superlative/performance headlines
  only exist for weeks that have ingested (or seeded) results. Ingest more and
  more of these light up; previews, governance and schedule headlines work
  regardless.
- **Per-category caps:** SCORE 8 · LIVE 4 · PREVIEW 4 · STREAK 5 · STANDINGS 5 ·
  SUPERLATIVE 4 · PERFORMANCE 4 · TRANSACTION 4 · PLAYOFF 6 · CHAMPION 4 ·
  FEDERATION 3 · GOVERNANCE 3 · SCHEDULE 3.

---

## A. Scores  *(links to Scores)*

| # | Headline | Appears when |
|---|----------|--------------|
| 1 | **“[Winner] def. [Loser], 112.4–98.7”** (pri 60) | A matchup in the sport's **latest completed week** with both teams > 0; margin between 3 and 40. |
| 2 | **“Blowout: [Winner] routs [Loser], …”** (pri 65) | Same, margin **≥ 40**. |
| 3 | **“Nail-biter: [Winner] edges [Loser], …”** (pri 65) | Same, margin **≤ 3**. |
| 4 | **“LIVE · [Home] 64.2 – 51.8 [Away]”** (pri 85) | League **live scoring is on** AND the matchup is **not complete** but already has a partial score (one side > 0). |

*Games where one side is still 0 (not fully ingested) are skipped.*

## B. Previews  *(current = lowest un-played week)*

| # | Headline | Appears when |
|---|----------|--------------|
| 5 | **“[Team] looks to stay perfect (7-0) in [Sport] vs [Opp]”** (pri 50) | An upcoming matchup includes a team with **≥3 wins and 0 losses**. |
| 6 | **“Top-3 clash in [Sport]: [A] vs [B]”** (pri 45) | Both teams in an upcoming matchup are in the sport's **top 3** by standings. |
| 7 | **“[A] (8-1) vs [B] (6-3) this week in [Sport]”** (pri 25) | Any other upcoming matchup in the current week. |

## C. Streaks  *(per team, per sport)*

| # | Headline | Appears when |
|---|----------|--------------|
| 8 | **“[Team] stays perfect at N-0 in [Sport]”** (pri 65) | Team has played **≥3 games, all wins**. |
| 9 | **“[Team] gets its first [Sport] win since Week N”** (pri 60) | Team **just won** (win streak = 1) and the **≥2 games before were losses**; “since” = the previous win's week (or “the season opener”). |
| 10 | **“[Team] rides a N-game win streak in [Sport]”** (pri 45) | Current **win streak ≥ 3** (and not all-perfect → #8). |
| 11 | **“[Team] drops its Nth straight in [Sport]”** (pri 38) | Current **loss streak ≥ 3**. |
| 12 | **“[Opp] snaps [Team]'s N-game [Sport] win streak”** (pri 42) | Team's latest game is a **loss that ended a win streak of ≥ 3**. |

## D. Standings & milestones  *(needs ≥2 teams, ≥1 completed week)*

| # | Headline | Appears when |
|---|----------|--------------|
| 13 | **“[Team] leads [Sport] at 9-2”** (pri 40) | Current sport leader (most wins, then points for). |
| 14 | **“[Team] clinches the [Sport] #1 seed”** (pri 75) | Leader's **win lead over 2nd > weeks remaining**. |
| 15 | **“Magic number: [Team] needs M more to clinch the [Sport] #1 seed”** (pri 55) | `M = remaining − lead + 1`, shown only when **1 ≤ M ≤ 4**. |
| 16 | **“[Team] is eliminated from [Sport] playoff contention”** (pri 50) | A team below the cutoff whose **best-case wins (current + remaining) < the cutoff team's current wins**. |

## E. Superlatives

| # | Headline | Appears when |
|---|----------|--------------|
| 17 | **“Week N [Sport] high: [Team] drops 138.6”** (pri 55) | Highest single-team score in the **latest completed week**. |
| 18 | **“Season high: [Team]'s 151.2 is the most in [Sport] all year”** (pri 58) | The season's **single-team record was just set** in the latest completed week. |

## F. Player performances  *(real stats)*

| # | Headline | Appears when |
|---|----------|--------------|
| 19 | **“[Player] ([Team]) leads [Sport] scorers in Week N with 41.5”** (pri 52) | Top fantasy scorer in the latest completed week (points > 0). |

## G. Transactions  *(links to Transactions)*

| # | Headline | Appears when |
|---|----------|--------------|
| 20 | **“Trade: [A] and [B] swap [players]”** (pri 55) | Up to the **3 most recent ACCEPTED** trades. |
| 21 | **“[Team] lands [Player] off waivers ($23 FAAB)”** (pri 40) | Up to the **3 most recent successful** waiver claims. |

## H. Playoffs  *(links to Playoffs)*

| # | Headline | Appears when |
|---|----------|--------------|
| 22 | **“[Winner] (#2) tops [Loser] (#3) in the [Sport] playoffs, …”** (pri 80) | A completed championship-bracket playoff game (favorite/equal seed won). |
| 23 | **“Upset! [Winner] (#5) knocks off [Loser] (#1) …”** (pri 90) | Same, but the **lower seed won**. |
| 24 | **“🏆 [Team] wins the [Sport] championship!”** (pri 95) | A sport champion is crowned this season (league history). |

## I. Federation / cross-sport

| # | Headline | Appears when |
|---|----------|--------------|
| 25 | **“👑 [Team] wins the Federation championship!”** (pri 100) | The overall federation champion is crowned this season. |
| 26 | **“[Team] swept Week N — wins in all K sports”** (pri 70) | In the latest shared completed week, a team **won every sport it played** (played ≥ 2). |

## J. Governance  *(links to Votes)*

| # | Headline | Appears when |
|---|----------|--------------|
| 27 | **“🗳️ Vote open: “[Title]” — N days left”** (pri 48) | A proposal is **OPEN** with a future close time. |
| 28 | **“Proposal passed/failed: “[Title]””** (pri 36) | A proposal has **resolved** (PASSED or FAILED). |

## K. Situational / schedule

| # | Headline | Appears when |
|---|----------|--------------|
| 29 | **“[Sport] season opens this week”** (pri 32) | The sport's current week == its start week and nothing has been played yet. |
| 30 | **“[Sport] regular season wraps — playoffs next”** (pri 34) | The sport's last completed week == its end week and no games remain. |
