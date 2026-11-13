-- 2026-27: Week 1 is now the week of Sept 7 (Labor Day week, when the NFL starts), not Aug 31.
-- Renumber that season's federation weeks down by one. Each statement checks that the season still
-- has no Week 1 matchups, so this can never shift twice; matchups go last.
UPDATE leagues SET sport_schedule = (
  SELECT json_group_array(json_set(value, '$.startWeek', json_extract(value, '$.startWeek') - 1, '$.endWeek', json_extract(value, '$.endWeek') - 1))
  FROM json_each(leagues.sport_schedule)
) WHERE id = 'ysf' AND season = '2026-27'
  AND (SELECT min(week) FROM matchups WHERE league_id = 'ysf' AND season = '2026-27') >= 2;
-- (two steps through negative numbers, so no row ever lands on another's week mid-update)
UPDATE ysf_report_issues SET week = -(week - 1) WHERE season = '2026-27' AND week > 0
  AND (SELECT min(week) FROM matchups WHERE league_id = 'ysf' AND season = '2026-27') >= 2;
UPDATE ysf_report_issues SET week = -week WHERE season = '2026-27' AND week < 0
  AND (SELECT min(week) FROM matchups WHERE league_id = 'ysf' AND season = '2026-27') >= 2;
UPDATE matchups SET week = week - 1 WHERE league_id = 'ysf' AND season = '2026-27'
  AND (SELECT min(week) FROM matchups WHERE league_id = 'ysf' AND season = '2026-27') >= 2;
