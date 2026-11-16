#!/usr/bin/env bash
# Runs on YOUR computer. Copies the app to the server and (re)starts it.
#   ./deploy/free-server/deploy.sh ubuntu@1.2.3.4 [path/to/ssh-key]
# Re-run it any time to ship new code; data and secrets on the server are kept.
set -euo pipefail
TARGET=${1:?usage: deploy.sh user@server-ip [ssh-key]}
KEY=${2:-}
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
[ -n "$KEY" ] && SSH_OPTS+=(-i "$KEY")
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo ">> Uploading code to $TARGET"
ssh "${SSH_OPTS[@]}" "$TARGET" "mkdir -p ~/qa-engine"
rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
  --exclude node_modules --exclude .next --exclude .git --exclude storage \
  --exclude 'desktop' --exclude '.claude-flow' --exclude '.swarm' \
  --exclude '.env' --exclude '.env.*' --exclude 'deploy/free-server/.env' \
  --exclude tsconfig.tsbuildinfo \
  "$ROOT/" "$TARGET:~/qa-engine/"

echo ">> Running setup on server"
ssh "${SSH_OPTS[@]}" -t "$TARGET" "cd ~/qa-engine/deploy/free-server && DOMAIN='${DOMAIN:-}' bash server-setup.sh"
