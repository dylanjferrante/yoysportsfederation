#!/bin/sh
# Send this Mac's league data to the Railway server, once:
#   1. In Railway → Variables, click the copy icon on the RESTORE_TOKEN row
#   2. scripts/upload-data.sh
# Packs the data folder, takes the RESTORE_TOKEN from the clipboard (only its length is shown) and uploads.
set -e
cd "$(dirname "$0")/.."
URL="${1:-https://yoysportsfederation-production.up.railway.app}"
scripts/pack-data.sh
TOKEN="$(pbpaste 2>/dev/null | tr -d '\r\n ')"
if [ -z "$TOKEN" ]; then
  printf 'Paste the RESTORE_TOKEN from Railway, then press Return: '
  stty -echo 2>/dev/null || true; read -r TOKEN; stty echo 2>/dev/null || true; echo
fi
echo "Using the RESTORE_TOKEN from the clipboard (${#TOKEN} characters — it should be 32)"
echo "Uploading to $URL …"
curl --http1.1 --fail-with-body --progress-bar --max-time 900 -X POST "$URL/api/admin/restore" -H "Authorization: Bearer $TOKEN" --data-binary @ysf-data.tar.gz
echo
echo "Done."
