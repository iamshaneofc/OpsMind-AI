# ── Stage 1: Install production dependencies ───────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# ── Stage 2: Build (needs devDependencies for prisma, tailwind, etc.) ──
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npx prisma generate
RUN npm run build

# ── Stage 3: Production runtime ────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy static assets into standalone .next/static
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma engine and production pg driver
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=deps /app/node_modules/pg ./node_modules/pg
COPY --from=deps /app/node_modules/pg-hstore ./node_modules/pg-hstore
COPY --from=deps /app/node_modules/pg-query-stream ./node_modules/pg-query-stream

# Remove .env bundled by next build — secrets come from env_file at runtime
RUN rm -f .env .env.*

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
