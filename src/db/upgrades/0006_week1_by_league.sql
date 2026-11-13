-- 2026-27 renumbering, league by league: on a database where a league still starts on its old
-- federation week (Aug 31 numbering: NHL 5, NBA 8, MLB 30), move that league's matchups and its
-- schedule entry down one week. Leagues already renumbered are left alone; matchups go first.
UPDATE matchups SET week = week - 1 WHERE league_id = 'ysf' AND season = '2026-27' AND sport = 'NHL'
  AND (SELECT json_extract(j.value, '$.startWeek') FROM leagues l, json_each(l.sport_schedule) j WHERE l.id = 'ysf' AND l.season = '2026-27' AND json_extract(j.value, '$.sport') = 'NHL') = 5;
UPDATE leagues SET sport_schedule = (
  SELECT json_group_array(CASE WHEN json_extract(value, '$.sport') = 'NHL' AND json_extract(value, '$.startWeek') = 5
    THEN json_set(value, '$.startWeek', 4, '$.endWeek', json_extract(value, '$.endWeek') - 1) ELSE json(value) END)
  FROM json_each(leagues.sport_schedule)
) WHERE id = 'ysf' AND season = '2026-27';
UPDATE matchups SET week = week - 1 WHERE league_id = 'ysf' AND season = '2026-27' AND sport = 'NBA'
  AND (SELECT json_extract(j.value, '$.startWeek') FROM leagues l, json_each(l.sport_schedule) j WHERE l.id = 'ysf' AND l.season = '2026-27' AND json_extract(j.value, '$.sport') = 'NBA') = 8;
UPDATE leagues SET sport_schedule = (
  SELECT json_group_array(CASE WHEN json_extract(value, '$.sport') = 'NBA' AND json_extract(value, '$.startWeek') = 8
    THEN json_set(value, '$.startWeek', 7, '$.endWeek', json_extract(value, '$.endWeek') - 1) ELSE json(value) END)
  FROM json_each(leagues.sport_schedule)
) WHERE id = 'ysf' AND season = '2026-27';
UPDATE matchups SET week = week - 1 WHERE league_id = 'ysf' AND season = '2026-27' AND sport = 'MLB'
  AND (SELECT json_extract(j.value, '$.startWeek') FROM leagues l, json_each(l.sport_schedule) j WHERE l.id = 'ysf' AND l.season = '2026-27' AND json_extract(j.value, '$.sport') = 'MLB') = 30;
UPDATE leagues SET sport_schedule = (
  SELECT json_group_array(CASE WHEN json_extract(value, '$.sport') = 'MLB' AND json_extract(value, '$.startWeek') = 30
    THEN json_set(value, '$.startWeek', 29, '$.endWeek', json_extract(value, '$.endWeek') - 1) ELSE json(value) END)
  FROM json_each(leagues.sport_schedule)
) WHERE id = 'ysf' AND season = '2026-27';
