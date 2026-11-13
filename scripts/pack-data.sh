#!/bin/sh
# Pack the data folder for the first upload to a new server (see DEPLOY.md):
#   scripts/pack-data.sh            → ysf-data.tar.gz in the project folder
# The database is copied with SQLite's online backup, so the app can keep running while this runs.
set -e
cd "$(dirname "$0")/.."
OUT="$(pwd)/ysf-data.tar.gz"
STAGE="$(mktemp -d)"
sqlite3 data/nexus.db ".backup '$STAGE/nexus.db'"
for d in tank01-cache nhl-cache fantrax-history; do [ -d "data/$d" ] && cp -R "data/$d" "$STAGE/"; done
[ -f data/ysf-proposals.json ] && cp data/ysf-proposals.json "$STAGE/"
tar -czf "$OUT" -C "$STAGE" .
rm -r "$STAGE"
ls -lh "$OUT"
