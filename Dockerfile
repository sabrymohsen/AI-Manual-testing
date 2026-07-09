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
# Prisma's engine binaries need libc6-compat on Alpine (query + schema engines).
RUN apk add --no-cache libc6-compat
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
# Apply any pending migrations, then start the server. migrate deploy is
# idempotent and takes an advisory lock, so it's safe across multiple instances.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node server.js"]
