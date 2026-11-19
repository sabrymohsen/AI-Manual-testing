#!/usr/bin/env bash
# Run on your Mac:  bash deploy/oracle/create-admin.sh
# Asks for the admin email and password and creates (or repairs) the Global Admin on the server.
# The password is typed here and sent over SSH only; it is not saved anywhere.
set -euo pipefail
HOST="${HOST:-ubuntu@79.76.112.176}"
KEY="${KEY:-$HOME/.ssh/oracle-qa}"

read -rp "Admin email: " EMAIL
read -rp "Admin name: " NAME
read -rsp "Admin password (min 8 chars): " PASS; echo
[ ${#PASS} -ge 8 ] || { echo "Password too short"; exit 1; }

printf '%s\n%s\n%s\n' "$EMAIL" "$NAME" "$PASS" | ssh -i "$KEY" -o IdentitiesOnly=yes "$HOST" '
  read -r E; read -r N; read -r P
  cd qa-engine/deploy/oracle
  docker compose --env-file .env exec -T -e ADMIN_EMAIL="$E" -e ADMIN_NAME="$N" -e ADMIN_PASSWORD="$P" workers npx tsx scripts/create-super-admin.ts
'
