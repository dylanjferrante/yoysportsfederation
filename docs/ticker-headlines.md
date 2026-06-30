# Federation Wire — headline catalog

Every headline the dashboard ticker can produce, generated from stored data by
`src/lib/headlines.ts` (no provider calls). Items are ranked by **priority (P)**,
then recency; deduped; **capped per category**; top **28** shown.

**Real-only:** score / streak / standings / superlative / performance headlines
only exist for weeks with ingested (or seeded) results. Previews, governance and
schedule headlines work regardless.

---

## Blowout / nail-biter bands (adaptive)

"Blowout" and "close game" are **not** fixed numbers — they're derived from the
season's actual team scores in that sport, which already reflect the current
scoring settings. So if the commissioner changes scoring (or sports simply score
on different scales), the thresholds re-tune themselves automatically.

- **Blowout** = margin ≥ **25%** of a typical team's score that sport.
- **Nail-biter** = margin ≤ **5%** of a typical team's score.
- "Typical" = the average team score across that season's completed games (≥ 6
  games needed). Until then, it falls back to the static `SCORE_BANDS` defaults
  in `lib/headlines.ts` (NFL 35/5 · NBA 250/30 · NHL 45/6 · MLB 18/3).

*Real stat-line milestones (below) use real counting stats (goals, yards, points)
and are independent of fantasy scoring, so they never need re-tuning.*

---

## Headline catalog

`{Team}`, `{Player}`, `{Sport}`, `{N}`, `{X}` are filled at render time.
Per-category cap is in the last column.

### A · Scores  → /scores

| Headline | Body (what shows) | Requirement | P / cap |
|----------|-------------------|-------------|---------|
| Final | `{Winner} def. {Loser}, 112.4–98.7` | Matchup in the sport's latest completed week; both teams > 0; margin between the sport's close and blowout bands | 60 / 8 |
| Blowout | `Blowout: {Winner} routs {Loser}, …` | Same, margin **≥ blowout band** for that sport | 65 / 8 |
| Nail-biter | `Nail-biter: {Winner} edges {Loser}, …` | Same, margin **≤ close band** for that sport | 65 / 8 |
| Live | `LIVE · {Home} 64.2 – 51.8 {Away}` | League **live scoring on** AND matchup not complete but already has a partial score | 85 / 4 |

### B · Previews (current = lowest unplayed week)  → /scores

| Headline | Body | Requirement | P / cap |
|----------|------|-------------|---------|
| Stay perfect | `{Team} looks to stay perfect (7-0) in {Sport} vs {Opp}` | Upcoming matchup includes a team with **≥3 wins, 0 losses** | 50 / 4 |
| Top-3 clash | `Top-3 clash in {Sport}: {A} vs {B}` | Both teams in the upcoming matchup are **top-3** in standings | 45 / 4 |
| Matchup | `{A} (8-1) vs {B} (6-3) this week in {Sport}` | Any other upcoming matchup | 25 / 4 |

### C · Streaks (per team, per sport)

| Headline | Body | Requirement | P / cap |
|----------|------|-------------|---------|
| Perfect | `{Team} stays perfect at N-0 in {Sport}` | Played **≥3 games, all wins** | 65 / 5 |
| First win since | `{Team} gets its first {Sport} win since Week N` | **Just won** (streak = 1) after **≥2 straight losses**; "since" = previous win's week (or "the season opener") | 60 / 5 |
| Win streak | `{Team} rides a N-game win streak in {Sport}` | **Win streak ≥ 3** (and not all-perfect) | 45 / 5 |
| Losing skid | `{Team} drops its Nth straight in {Sport}` | **Loss streak ≥ 3** | 38 / 5 |
| Streak snapped | `{Opp} snaps {Team}'s N-game {Sport} win streak` | Latest game is a **loss that ended a ≥3 win streak** | 42 / 5 |

### D · Standings & milestones (needs ≥2 teams, ≥1 completed week)  → standings

| Headline | Body | Requirement | P / cap |
|----------|------|-------------|---------|
| Leader | `{Team} leads {Sport} at 9-2` | Current sport leader (wins, then points-for) | 40 / 5 |
| Clinch #1 | `{Team} clinches the {Sport} #1 seed` | Leader's **win lead over 2nd > weeks remaining** | 75 / 5 |
| Magic number | `Magic number: {Team} needs M more to clinch the {Sport} #1 seed` | `M = remaining − lead + 1`, shown only when **1 ≤ M ≤ 4** | 55 / 5 |
| Eliminated | `{Team} is eliminated from {Sport} playoff contention` | A below-cutoff team whose **best-case wins (current + remaining) < cutoff team's current wins** | 50 / 5 |

### E · Superlatives  → /scores

| Headline | Body | Requirement | P / cap |
|----------|------|-------------|---------|
| Week high | `Week N {Sport} high: {Team} drops 138.6` | Highest single-team score in the **latest completed week** | 55 / 4 |
| Season high | `Season high: {Team}'s 151.2 is the most in {Sport} all year` | The **season single-team record was just set** in the latest completed week | 58 / 4 |

### F · Player performances (real stats)  → /scores

| Headline | Body | Requirement | P / cap |
|----------|------|-------------|---------|
| Week's top scorer | `{Player} ({Team}) leads {Sport} scorers in Week N with 41.5` | Top fantasy scorer in the latest completed week (points > 0) | 52 / 4 |

### G · Transactions  → /transactions

| Headline | Body | Requirement | P / cap |
|----------|------|-------------|---------|
| Trade | `Trade: {A} and {B} swap {players}` | Up to the **3 most recent ACCEPTED** trades | 55 / 4 |
| Waiver add | `{Team} lands {Player} off waivers ($23 FAAB)` | Up to the **3 most recent successful** waiver claims | 40 / 4 |

### H · Playoffs  → /playoffs

| Headline | Body | Requirement | P / cap |
|----------|------|-------------|---------|
| Advance | `{Winner} (#2) tops {Loser} (#3) in the {Sport} playoffs, …` | Completed championship-bracket game; favorite/equal seed won | 80 / 6 |
| Upset | `Upset! {Winner} (#5) knocks off {Loser} (#1) …` | Same, but the **lower seed won** | 90 / 6 |
| Champion | `🏆 {Team} wins the {Sport} championship!` | A sport champion is crowned this season | 95 / 4 |

### I · Federation / cross-sport

| Headline | Body | Requirement | P / cap |
|----------|------|-------------|---------|
| Fed champion | `👑 {Team} wins the Federation championship!` | The overall federation champion is crowned this season | 100 / 3 |
| Weekly sweep | `{Team} swept Week N — wins in all K sports` | In the latest shared completed week, a team **won every sport it played** (played ≥ 2) | 70 / 3 |

### J · Governance  → /proposals

| Headline | Body | Requirement | P / cap |
|----------|------|-------------|---------|
| Vote open | `🗳️ Vote open: "{Title}" — N days left` | A proposal is **OPEN** with a future close time | 48 / 3 |
| Vote decided | `Proposal passed/failed: "{Title}"` | A proposal has **resolved** (PASSED or FAILED) | 36 / 3 |

### K · Situational / schedule

| Headline | Body | Requirement | P / cap |
|----------|------|-------------|---------|
| Season opens | `{Sport} season opens this week` | Sport's current week == its start week and nothing played yet | 32 / 3 |
| Season wraps | `{Sport} regular season wraps — playoffs next` | Sport's last completed week == its end week and no games remain | 34 / 3 |
| Midpoint | `{Sport} hits the midpoint of the season` | Latest completed week == the sport's middle week | 33 / 4 |
| Playoff push | `Playoff push: K {Sport} spots up for grabs with N weeks to play` | ≤ 3 weeks left in the sport's regular season | 46 / 4 |

### L · Stat-line milestones (real box scores)  → /scores

Detected from the latest completed week's real player stats; phrasing varies. Up to 6 per sport.

| Sport | Body (examples) | Requirement |
|-------|-----------------|-------------|
| NHL | `{Player} records a natural hat trick` · `…bags a pair of goals` · `…N-point night` · `…N-save shutout` | goals ≥ 3 · = 2 · goals+assists ≥ 4 · saves ≥ 28 & 0 allowed |
| MLB | `{Player} goes deep N times` · `…drives in N` · `…fans N on the mound` · `…collects N hits` | HR ≥ 3 (or 2) · RBI ≥ 5 · pitcher K ≥ 10 · hits ≥ 4 |
| NBA | `{Player} posts a triple-double` · `…double-double (p/r/a)` · `…erupts for N` · `…splashes N threes` | pts/reb/ast all ≥ 10 · two ≥ 10 · pts ≥ 40 · 3PM ≥ 7 |
| NFL | `{Player} accounts for N touchdowns` · `…throws for N yards` · `…runs for N` · `…N receiving yards` | total TD ≥ 3 · pass yds ≥ 300 · rush ≥ 125 · rec ≥ 110 |

### M · Game of the week  → /scores

| Headline | Body | Requirement | P / cap |
|----------|------|-------------|---------|
| Shootout | `Shootout in {Sport}: {A} and {B} combine for X` | Highest **combined** score of the latest completed week | 50 / 3 |

### N · Power notes  → standings

| Headline | Body | Requirement | P / cap |
|----------|------|-------------|---------|
| Best record | `{Team} owns the league's best overall record (W-L)` | Most total wins across all sports | 46 / 4 |
| Scoring leader | `{Team} is the highest-scoring team in {Sport}` | Most points-for in that sport | 44 / 4 |
| Winless | `{Team} is still searching for its first {Sport} win` | 0 wins after ≥ 3 games | 36 / 4 |

### O · Pace  → standings

| Headline | Body | Requirement | P / cap |
|----------|------|-------------|---------|
| On pace | `{Team} is on pace for N wins in {Sport}` | Sport leader, projected from current win rate (after ≥ 4 games, before the final week) | 36 / 3 |

### P · Form  → standings

| Headline | Body | Requirement | P / cap |
|----------|------|-------------|---------|
| Hot lately | `{Team} has won 4 of its last 5 in {Sport}` | 4 wins in the last 5 (and not already a 5-game streak) | 40 / 4 |
| Longest streak | `{Team} owns the league's longest active {Sport} win streak (N)` | The league's longest current win streak (≥ 4) in that sport | 44 / 4 |

### Q · Rivalry / rematch  → /scores

| Headline | Body | Requirement | P / cap |
|----------|------|-------------|---------|
| Rematch | `Rematch in {Sport}: {A} took the first meeting with {B}` (or `…run it back`) | This week's opponents already played earlier in the season | 30 / 3 |

### R · Busiest GM  → /transactions

| Headline | Body | Requirement | P / cap |
|----------|------|-------------|---------|
| Busiest GM | `{Team} has been the league's busiest GM (N moves)` | Most accepted trades + successful waivers (≥ 3) | 33 / 4 |

*Total feed is capped at **40** items after per-category caps and ranking.*
