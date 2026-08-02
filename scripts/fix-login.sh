#!/usr/bin/env bash
#
# fix-login.sh — get a working login for the QA Engine app.
#
#   bash scripts/fix-login.sh                    # resets admin@example.com / admin123
#   ADMIN_EMAIL=you@x.com ADMIN_PASSWORD=secret bash scripts/fix-login.sh
#
# Diagnoses each failure point in order and stops at the first real problem
# instead of failing deep inside Prisma with an opaque error.

set -euo pipefail
cd "$(dirname "$0")/.."

ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
ADMIN_NAME="${ADMIN_NAME:-Admin User}"

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[0;32m✓\033[0m %s\n' "$1"; }
die()  { printf '\n\033[0;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------- 1. env
say "Checking .env"
[ -f .env ] || die "No .env file. Copy it:  cp .env.example .env"

# Pull DATABASE_URL out of .env without sourcing the whole file (it contains
# values with characters that break `source`).
DB_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
[ -n "$DB_URL" ] || die "DATABASE_URL is not set in .env"
ok "DATABASE_URL -> $DB_URL"

grep -qE '^NEXTAUTH_SECRET=.+' .env \
  || die "NEXTAUTH_SECRET is empty in .env — login will mint tokens that never verify."
ok "NEXTAUTH_SECRET is set"

# Parse host/port/dbname out of postgresql://[user[:pass]@]host[:port]/dbname
DB_NAME="$(printf '%s' "$DB_URL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')"
DB_HOST="$(printf '%s' "$DB_URL" | sed -E 's#^[^/]*//([^@]*@)?([^:/]+).*#\2#')"
DB_PORT="$(printf '%s' "$DB_URL" | sed -E 's#^[^/]*//([^@]*@)?[^:/]+:([0-9]+).*#\2#')"
[ "$DB_PORT" = "$DB_URL" ] && DB_PORT=5432

# ---------------------------------------------------------- 2. postgres up
say "Checking Postgres at $DB_HOST:$DB_PORT"
if ! nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; then
  cat >&2 <<EOF

✗ Nothing is listening on $DB_HOST:$DB_PORT.

  Start whichever Postgres you use:
    Postgres.app  — open the Postgres app and click Start
    Homebrew      — brew services start postgresql@16

  NOTE: do NOT use 'docker compose up postgres'. The docker-compose.yml in this
  repo defines a DIFFERENT database (qa_user / ai_manual_qa_tester) on the same
  port 5432, which will shadow your real '$DB_NAME' database.
EOF
  exit 1
fi
ok "Postgres is listening"

# ------------------------------------------------------------ 3. database
say "Checking database '$DB_NAME' exists"
if command -v psql >/dev/null 2>&1; then
  if psql "$DB_URL" -c 'SELECT 1' >/dev/null 2>&1; then
    ok "Connected to '$DB_NAME'"
  else
    printf '    database missing or unreachable — attempting to create it\n'
    createdb "$DB_NAME" 2>/dev/null && ok "Created '$DB_NAME'" \
      || die "Could not connect to or create '$DB_NAME'. Check the credentials in DATABASE_URL."
  fi
else
  printf '    psql not on PATH — skipping (Prisma will surface any problem)\n'
fi

# ------------------------------------------------------- 4. schema + client
say "Syncing Prisma schema and regenerating the client"
npx prisma db push --skip-generate
npx prisma generate
ok "Schema in sync, client regenerated"

# --------------------------------------------------------- 5. admin account
say "Creating/resetting the admin account"
ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" ADMIN_NAME="$ADMIN_NAME" \
  npx tsx scripts/create-super-admin.ts

# ------------------------------------------------------------- 6. verify
say "Verifying the credentials actually authenticate"
ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" npx tsx -e '
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
const prisma = new PrismaClient()
const email = process.env.ADMIN_EMAIL!
const password = process.env.ADMIN_PASSWORD!
;(async () => {
  const u = await prisma.user.findUnique({ where: { email } })
  if (!u) { console.error("✗ user row not found after upsert"); process.exit(1) }
  const okPw = await bcrypt.compare(password, u.passwordHash)
  console.log(`   password match : ${okPw ? "yes" : "NO"}`)
  console.log(`   isActive       : ${u.isActive}`)
  console.log(`   role / plan    : ${u.role} / ${u.plan}`)
  if (!okPw || !u.isActive) {
    console.error("✗ these credentials will still be rejected at /login")
    process.exit(1)
  }
})().finally(() => prisma.$disconnect())
'

cat <<EOF

────────────────────────────────────────────────
 ✓ Login is ready

   URL       http://localhost:3000/login
   Email     $ADMIN_EMAIL
   Password  $ADMIN_PASSWORD

 Start the app (restart it if it was already running —
 the Prisma client was just regenerated):

   npm run dev:all
────────────────────────────────────────────────
EOF
