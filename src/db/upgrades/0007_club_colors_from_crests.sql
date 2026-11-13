-- Club colours as drawn in each club's crest (2026-27 refresh SVGs): WWFC red #B30007, RC navy #034072,
-- OYSC blue #236192 corrected; KMU light blue / SSU orange primaries per the user.
UPDATE teams SET primary_color = '#004B41', secondary_color = '#80684B' WHERE league_id = 'ysf' AND abbreviation = 'AAC';
UPDATE teams SET primary_color = '#00333F', secondary_color = '#F7BA61' WHERE league_id = 'ysf' AND abbreviation = 'ACF';
UPDATE teams SET primary_color = '#0D00B2', secondary_color = '#FFFFFF' WHERE league_id = 'ysf' AND abbreviation = 'BASC';
UPDATE teams SET primary_color = '#12E0E5', secondary_color = '#E500C5' WHERE league_id = 'ysf' AND abbreviation = 'INSC';
UPDATE teams SET primary_color = '#19B9EE', secondary_color = '#10153F' WHERE league_id = 'ysf' AND abbreviation = 'KMU';
UPDATE teams SET primary_color = '#036B08', secondary_color = '#FFFFFF' WHERE league_id = 'ysf' AND abbreviation = 'MBJC';
UPDATE teams SET primary_color = '#6F263D', secondary_color = '#236192' WHERE league_id = 'ysf' AND abbreviation = 'OYSC';
UPDATE teams SET primary_color = '#034072', secondary_color = '#A70F23' WHERE league_id = 'ysf' AND abbreviation = 'RC';
UPDATE teams SET primary_color = '#7700B5', secondary_color = '#FFCB05' WHERE league_id = 'ysf' AND abbreviation = 'RMCK';
UPDATE teams SET primary_color = '#FF8C24', secondary_color = '#C8102E' WHERE league_id = 'ysf' AND abbreviation = 'SSU';
UPDATE teams SET primary_color = '#EAAA00', secondary_color = '#9D2235' WHERE league_id = 'ysf' AND abbreviation = 'WU';
UPDATE teams SET primary_color = '#B30007', secondary_color = '#000000' WHERE league_id = 'ysf' AND abbreviation = 'WWFC';
