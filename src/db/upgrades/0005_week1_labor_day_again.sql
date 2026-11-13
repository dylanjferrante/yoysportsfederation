-- Follow-up to 0003 for databases it skipped (it required every 2026-27 week to be 2 or later):
-- while the ySFFL schedule still starts in federation week 2 (the old Aug 31 numbering), move the
-- season's matchups and the sport schedule down one week so Week 1 is the week of Sept 7. Matchups
-- first, while the schedule still says week 2; does nothing on a database already renumbered.
UPDATE matchups SET week = week - 1 WHERE league_id = 'ysf' AND season = '2026-27'
  AND (SELECT json_extract(j.value, '$.startWeek') FROM leagues l, json_each(l.sport_schedule) j
       WHERE l.id = 'ysf' AND l.season = '2026-27' AND json_extract(j.value, '$.sport') = 'NFL') = 2;
UPDATE leagues SET sport_schedule = (
  SELECT json_group_array(json_set(value, '$.startWeek', json_extract(value, '$.startWeek') - 1, '$.endWeek', json_extract(value, '$.endWeek') - 1))
  FROM json_each(leagues.sport_schedule)
) WHERE id = 'ysf' AND season = '2026-27'
  AND (SELECT json_extract(j.value, '$.startWeek') FROM json_each(leagues.sport_schedule) j WHERE json_extract(j.value, '$.sport') = 'NFL') = 2;
