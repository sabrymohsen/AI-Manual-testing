#!/bin/bash
# Double-click this file in Finder to fill the Test library with demo data.
# macOS opens .command files in Terminal and runs them — no typing needed.

cd "$(dirname "$0")" || exit 1

PROJECT_ID="61ee2a48-01c2-4d04-9039-56a2a6d07e7f"
COUNT=120

printf '\n\033[1;36m== Seeding the Test library ==\033[0m\n\n'

# ── Preflight: is the database reachable at all? ─────────────────────────────
DB_URL="$(grep -E '^DATABASE_URL=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
if [ -z "$DB_URL" ]; then
  printf '\033[0;31m✗ No DATABASE_URL in .env\033[0m\n\n'
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

DB_HOST="$(printf '%s' "$DB_URL" | sed -E 's#^[^/]*//([^@]*@)?([^:/]+).*#\2#')"
DB_PORT="$(printf '%s' "$DB_URL" | sed -E 's#^[^/]*//([^@]*@)?[^:/]+:([0-9]+).*#\2#')"
case "$DB_PORT" in ''|*[!0-9]*) DB_PORT=5432 ;; esac

if ! nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; then
  printf '\033[0;31m✗ Postgres is not running on %s:%s\033[0m\n' "$DB_HOST" "$DB_PORT"
  printf '  Start it (Postgres.app, or: brew services start postgresql@16) and try again.\n\n'
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi
printf '  ✓ Database reachable\n'

# ── 1. Prisma client + migration ─────────────────────────────────────────────
printf '\n\033[1;36m1/3  Generating Prisma client\033[0m\n'
npx prisma generate || { printf '\n\033[0;31m✗ prisma generate failed\033[0m\n'; read -n 1 -s -r -p "Press any key to close..."; exit 1; }

printf '\n\033[1;36m2/3  Applying migrations\033[0m\n'
npx prisma migrate deploy || { printf '\n\033[0;31m✗ migrate deploy failed\033[0m\n'; read -n 1 -s -r -p "Press any key to close..."; exit 1; }

# ── 2. Demo data ─────────────────────────────────────────────────────────────
printf '\n\033[1;36m3/3  Creating %s demo test cases\033[0m\n' "$COUNT"
npx tsx scripts/seed-test-library-demo.ts --project "$PROJECT_ID" --count "$COUNT" \
  || { printf '\n\033[0;31m✗ seeding failed\033[0m\n'; read -n 1 -s -r -p "Press any key to close..."; exit 1; }

cat <<EOF

────────────────────────────────────────────────────
 Done. Open (or reload):

   http://localhost:3000/projects/$PROJECT_ID/test-cases

 To remove this demo data later, run:
   npx tsx scripts/seed-test-library-demo.ts --project $PROJECT_ID --clean
────────────────────────────────────────────────────

EOF

read -n 1 -s -r -p "Press any key to close..."
