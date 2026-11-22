# Built on the official Playwright image (same version as package-lock and the
# worker/recorder images): the web app itself launches browsers — Automation Hub
# runs and recorder, locator picker, visual checks — and the old Alpine image had
# none ("Executable doesn't exist … chromium_headless_shell").
FROM mcr.microsoft.com/playwright:v1.60.0-jammy AS base

# Arabic (and other right-to-left) pages: the Playwright image has no Arabic
# font, so Chrome fell back to FreeMono — letters spaced apart, not joined —
# in Live QA, recordings and screenshots. Noto Sans Arabic UI (5 MB) plus a
# fontconfig rule that prefers it for Arabic text.
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-ui-core \
    && rm -rf /var/lib/apt/lists/*
COPY deploy/fonts/65-arabic.conf /etc/fonts/conf.d/65-arabic.conf
RUN fc-cache -f

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXTAUTH_SECRET must be present at build time so Next.js inlines it into the
# Edge middleware bundle (the middleware verifies session JWTs, and the Edge
# runtime can't read runtime-only env vars). Railway passes the service variable
# to the build; the Node API routes still read it at runtime. Use the SAME value
# for build and runtime, or issued tokens won't verify.
ARG NEXTAUTH_SECRET
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET
# Inlined into the client bundle; the browser connects to the socket server here.
# Unset = the code's localhost default (Railway builds don't pass it).
ARG NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# Where runtime uploads (avatars, etc.) are written and served from. Matches the
# Railway persistent volume mount path; the Railway service variable of the same
# name overrides this if set.
ENV STORAGE_ROOT=/data
# The app user (same uid/gid as before, so existing /data files stay owned by it).
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs --home /app nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Prisma CLI + engines + schema/migrations so we can apply migrations at startup.
# (The standalone output only bundles the client, not the migrate CLI.)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# pdf-parse loads @napi-rs/canvas (DOMMatrix etc.) with a runtime require that
# Next's file tracing can't see, so the standalone build left it out and every
# PDF upload failed with "DOMMatrix is not defined". Copy it (and its native
# binary for this platform) explicitly.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@napi-rs ./node_modules/@napi-rs
# Same for pdf-parse's worker (pdf.worker.mjs), also loaded at runtime: copy the
# whole packages rather than the traced subset.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pdf-parse ./node_modules/pdf-parse
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pdfjs-dist ./node_modules/pdfjs-dist
# Playwright whole (CLI + test runner): Automation Hub runs `playwright test`
# in a workspace on the data volume, which resolves packages through the
# node_modules link made at startup (see CMD).
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/playwright ./node_modules/playwright
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/playwright-core ./node_modules/playwright-core
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@playwright ./node_modules/@playwright
EXPOSE 3000
ENV PORT=3000
# We deliberately do NOT `USER nextjs` here. Railway mounts the persistent volume
# (STORAGE_ROOT, e.g. /data) owned by root, so a non-root process gets EACCES when
# writing uploads there. Instead the container starts as root, ensures the volume
# exists and is owned by the app user, then drops to nextjs via runuser to run the
# server unprivileged.
#
# Then sync the DB to schema.prisma. We use `db push` (not `migrate deploy`)
# because schema.prisma is the source of truth here — the migrations/ history is
# incomplete (models like VisualBaseline/ShaftProperty and enum values were only
# ever applied via db push). --accept-data-loss makes it non-interactive.
CMD ["sh", "-c", "mkdir -p \"${STORAGE_ROOT:-/data}\" && ln -sfn /app/node_modules \"${STORAGE_ROOT:-/data}/node_modules\" && chown -R nextjs:nodejs \"${STORAGE_ROOT:-/data}\" && node node_modules/prisma/build/index.js db push --accept-data-loss --skip-generate && exec runuser -u nextjs -- node server.js"]
