"""For every completed matchup: does the sum of ACTIVE players' Fantrax points equal the recorded score?"""
import sqlite3, json, collections, datetime
db = sqlite3.connect('data/nexus.db')
sched = {s['sport']: s['startWeek'] for s in json.loads(db.execute("select sport_schedule from leagues where id='ysf'").fetchone()[0])}
today = datetime.date.today().isoformat()
sums = collections.defaultdict(float)
for season, sport, mp, team, fpts, date in db.execute("select season, sport, matchup_period, team_id, fpts, date from fantrax_player_periods where status='1' and matchup_period is not null and team_id is not null"):
    if date and date >= today: continue
    sums[(season, sport, mp, team)] += fpts or 0
res = collections.defaultdict(lambda: [0, 0]); bad = []
for season, sport, week, h, a, hs, as_, done, po in db.execute("select season, sport, week, home_team_id, away_team_id, home_score, away_score, is_complete, is_playoff from matchups where league_id='ysf' and away_team_id is not null"):
    if not done: continue
    mp = week - sched[sport] + 1 if season == '2026-27' else week
    for t, sc in ((h, hs), (a, as_)):
        k = (season, sport, mp, t)
        if k not in sums: res[(season, sport)][1] += 0; continue
        ok = abs(sums[k] - (sc or 0)) <= 0.051
        res[(season, sport)][0 if ok else 1] += 1
        if not ok: bad.append((season, sport, mp, t[:6], round(sums[k], 2), sc, 'PO' if po else ''))
for k, (ok, no) in sorted(res.items()): print(k, 'match', ok, 'diff', no)
for b in bad[:25]: print('DIFF', b)
