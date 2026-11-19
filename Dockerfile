FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl

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
# su-exec lets us drop from root to the app user after fixing volume ownership.
RUN apk add --no-cache su-exec
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
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
EXPOSE 3000
ENV PORT=3000
# We deliberately do NOT `USER nextjs` here. Railway mounts the persistent volume
# (STORAGE_ROOT, e.g. /data) owned by root, so a non-root process gets EACCES when
# writing uploads there. Instead the container starts as root, ensures the volume
# exists and is owned by the app user, then drops to nextjs via su-exec to run the
# server unprivileged.
#
# Then sync the DB to schema.prisma. We use `db push` (not `migrate deploy`)
# because schema.prisma is the source of truth here — the migrations/ history is
# incomplete (models like VisualBaseline/ShaftProperty and enum values were only
# ever applied via db push). --accept-data-loss makes it non-interactive.
CMD ["sh", "-c", "mkdir -p \"${STORAGE_ROOT:-/data}\" && chown -R nextjs:nodejs \"${STORAGE_ROOT:-/data}\" && node node_modules/prisma/build/index.js db push --accept-data-loss --skip-generate && exec su-exec nextjs:nodejs node server.js"]
