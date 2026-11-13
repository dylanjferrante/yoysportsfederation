#!/bin/sh
# Send this Mac's league data to the Railway server, once:
#   scripts/upload-data.sh
# Packs the data folder, asks for the RESTORE_TOKEN set in Railway (typing is hidden), uploads it.
set -e
cd "$(dirname "$0")/.."
URL="${1:-https://yoysportsfederation-production.up.railway.app}"
scripts/pack-data.sh
printf 'Paste the RESTORE_TOKEN from Railway, then press Return: '
stty -echo 2>/dev/null || true
read -r TOKEN
stty echo 2>/dev/null || true
echo
echo "Uploading to $URL …"
curl --http1.1 --fail-with-body -sS --max-time 600 -X POST "$URL/api/admin/restore" -H "Authorization: Bearer $TOKEN" --data-binary @ysf-data.tar.gz
echo
echo "Done. In Railway, restart the service (Deployments → ⋮ → Restart) so it opens the uploaded data."
