#!/usr/bin/env bash
# Creates deploy/oracle/.env with fresh random secrets (once), then builds and starts everything.
# Usage (on the server, from the repo root): DOMAIN=1-2-3-4.sslip.io bash deploy/oracle/setup.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  : "${DOMAIN:?set DOMAIN, e.g. DOMAIN=79-76-112-176.sslip.io}"
  rand() { openssl rand -hex 24; }
  umask 077
  cat > .env <<EOF
DOMAIN=$DOMAIN
POSTGRES_PASSWORD=$(rand)
NEXTAUTH_SECRET=$(openssl rand -base64 32)
APP_ENCRYPTION_KEY=$(openssl rand -base64 32)
CSRF_SECRET=$(rand)
RECORDER_WORKER_SECRET=$(rand)
EOF
  echo "Created deploy/oracle/.env with new secrets"
fi

docker compose -f docker-compose.yml --env-file .env build workers
docker compose -f docker-compose.yml --env-file .env up -d --build
docker compose -f docker-compose.yml --env-file .env ps
