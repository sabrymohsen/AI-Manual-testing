FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
# Prisma's engine binaries need libc6-compat + openssl on Alpine (query + schema
# engines); openssl also lets Prisma detect the right libssl version.
RUN apk add --no-cache libc6-compat openssl
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
USER nextjs
EXPOSE 3000
ENV PORT 3000
# Sync the database to schema.prisma, then start the server.
#
# We use `db push` (not `migrate deploy`) because schema.prisma is the source of
# truth for this project — the migrations/ history is incomplete (many models,
# e.g. VisualBaseline/ShaftProperty, and enum values like TestCaseSource.Recorder
# were only ever applied via db push, never captured in a migration). db push
# reconciles the live DB to the full schema on every deploy. --accept-data-loss
# makes it non-interactive; note this can drop columns if the schema removes them.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js db push --accept-data-loss --skip-generate && node server.js"]
