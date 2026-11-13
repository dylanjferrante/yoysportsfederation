-- KMU and SSU secondary colours (the user's primaries are KMU light blue and SSU orange, so their
-- secondaries are brand.js's other colour: KMU navy, SSU red). Text on a club primary uses the secondary.
UPDATE teams SET secondary_color = '#10153F' WHERE league_id = 'ysf' AND abbreviation = 'KMU';
UPDATE teams SET secondary_color = '#C8102E' WHERE league_id = 'ysf' AND abbreviation = 'SSU';
