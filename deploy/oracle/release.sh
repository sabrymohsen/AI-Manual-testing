#!/usr/bin/env bash
# Ship a new version to the Oracle server and to every user's desktop app.
#
#   bash deploy/oracle/release.sh "What's new, one line per change"
#   SKIP_SERVER=1 bash deploy/oracle/release.sh "..."   # installers only
#
# 1. Uploads the code and rebuilds the server (users get a "Reload" prompt).
# 2. If desktop/package.json's version is newer than the published one, builds the
#    Mac + Windows installers and publishes them with latest.json (users get "Update now").
set -euo pipefail
cd "$(dirname "$0")/../.."

HOST="${HOST:-ubuntu@79.76.112.176}"
KEY="${KEY:-$HOME/.ssh/oracle-qa}"
SITE="${SITE:-https://79-76-112-176.sslip.io}"
NOTES="${1:-}"
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes "$HOST")
RSH="ssh -i $KEY -o IdentitiesOnly=yes"
REMOTE="$HOST:"

if [ "${SKIP_SERVER:-}" != "1" ]; then
echo "▸ Uploading code"
LIST="$(mktemp)"
git ls-files -co --exclude-standard | grep -v '^desktop/' > "$LIST"
rsync -az --files-from="$LIST" -e "$RSH" ./ "${REMOTE}qa-engine/"
rm -f "$LIST"

echo "▸ Rebuilding the server (about 10 minutes)"
"${SSH[@]}" 'cd qa-engine/deploy/oracle && docker compose --env-file .env build && docker compose --env-file .env up -d && docker compose --env-file .env ps --format "{{.Service}}: {{.Status}}"'
fi

VERSION="$(node -p 'require("./desktop/package.json").version')"
# Nothing published yet (or the server is still restarting) counts as "0.0.0".
FEED_JSON="$(curl -fsS --retry 5 --retry-delay 5 --retry-all-errors "$SITE/downloads/latest.json" 2>/dev/null || true)"
PUBLISHED="$(printf '%s' "$FEED_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).version)}catch{console.log("0.0.0")}})')"
if [ "$VERSION" = "$PUBLISHED" ]; then
  echo "▸ Desktop app $VERSION is already published (bump desktop/package.json version to ship a new one)"
  exit 0
fi

echo "▸ Building desktop installers $VERSION"
(cd desktop && npx electron-builder --mac --win --publish never >/dev/null)

D=desktop/dist
OUT="$(mktemp -d)"
cp "$D/QA-Engine-$VERSION-mac-arm64.dmg" "$OUT/QA-Engine-mac-arm64.dmg"
cp "$D/QA-Engine-$VERSION-mac-x64.dmg" "$OUT/QA-Engine-mac-x64.dmg"
cp "$D/QA-Engine-Setup-$VERSION.exe" "$OUT/QA-Engine-Setup.exe"
node -e '
  const [v, notes] = process.argv.slice(1)
  console.log(JSON.stringify({
    version: v, notes, date: new Date().toISOString(),
    files: { "darwin-arm64": "QA-Engine-mac-arm64.dmg", "darwin-x64": "QA-Engine-mac-x64.dmg", "win32-x64": "QA-Engine-Setup.exe" },
  }, null, 2))' "$VERSION" "$NOTES" > "$OUT/latest.json"

echo "▸ Publishing installers"
# Installers first, latest.json last, so nobody is told about files that aren't there yet.
rsync -a -e "$RSH" "$OUT"/*.dmg "$OUT"/*.exe "${REMOTE}qa-engine-downloads/"
rsync -a -e "$RSH" "$OUT/latest.json" "${REMOTE}qa-engine-downloads/"
rm -rf "$OUT"
echo "✓ Released server + desktop $VERSION"
