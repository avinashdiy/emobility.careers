# Production image for the Next.js app + worker.
# Multi-stage build: deps → build → runner.

FROM node:20-alpine AS base
# Native modules (argon2, pdf-parse, mammoth/sharp deps) need build tools at
# install time. We strip them from the runner image.
RUN apk add --no-cache libc6-compat openssl

# ─── deps ───────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ build-base
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# ─── builder ────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++ build-base
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_ENV_VALIDATION=1
RUN corepack enable pnpm && pnpm prisma generate && pnpm build

# ─── runner (web + worker share this image) ─────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Health probe needs curl
RUN apk add --no-cache curl

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Standalone Next output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma schema + migrations + generated client (needed for migrate deploy
# and for the worker process which doesn't go through next standalone)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Worker source (not pulled into the standalone bundle)
COPY --from=builder --chown=nextjs:nodejs /app/workers ./workers
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/server ./server
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tsx ./node_modules/tsx

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
