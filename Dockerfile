# ── Stage 1: Build ────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm cache clean --force
COPY . .
RUN npx prisma generate
RUN npm run build

# ── Stage 2: Production runtime ────────────────────────────────────
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

# Generated Prisma client + query engine.
# Next's standalone tracer does not follow the @prisma/* import chain, so the
# whole @prisma scope is copied. postgres-array is a dependency of
# @prisma/adapter-pg that the tracer also omits.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/postgres-array ./node_modules/postgres-array

# Remove .env bundled by next build — secrets come from env_file at runtime
RUN rm -f .env .env.*

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
