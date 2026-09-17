# Environment Variables & Deployment

## Local first-time setup

1. **Dependencies:** `npm install`
2. **Env file:** copy `.env.example` to `.env` and paste your Supabase + OpenAI keys.
3. **Check:** `npm run local:check` — confirms `.env` and required keys.
4. **Run app:** `npm run dev` → open [http://localhost:3001](http://localhost:3001).
5. **Database migrations:** when Supabase is reachable, run new SQL from `supabase/migrations/` in **Dashboard → SQL Editor** (no CLI required).

---

## Required environment variables

Set these in your deployment platform and in local `.env`:

| Variable | Description | Used By |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Client + Server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key | Client + Server |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) | Server (admin operations) |
| `DATABASE_URL` | PostgreSQL connection string (with `?pgbouncer=true`) | Prisma ORM |
| `DIRECT_URL` | PostgreSQL direct connection string (for migrations) | Prisma migrations |
| `OPENAI_API_KEY` | OpenAI API key (starts with `sk-`) | AI chat features |
| `OPENAI_MODEL` | OpenAI model name (default: `gpt-4o`) | AI chat features |
| `NODE_ENV` | `production` for deployed environments | Next.js |
| `PORT` | Server port (default: `3000`) | Next.js |

## Optional environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SEED_PASSWORD` | Password for demo seed users | `changeme` |
| `NEXT_PUBLIC_DEMO_EMAIL_MANAGER` | Manager demo login email (set to show button) | *(hidden)* |
| `NEXT_PUBLIC_DEMO_EMAIL_ANALYST` | Analyst demo login email (set to show button) | *(hidden)* |
| `NEXT_PUBLIC_DEMO_PASSWORD` | Demo login password | *(empty)* |
| `SKIP_ERP_MANUAL_ALLOCATION` | Skip Supabase manual allocation reads | `false` |
| `SKIP_ERP_STATUS_JOURNAL` | Skip status snapshot writes | `false` |
| `SKIP_ERP_PREDICTIONS_CACHE` | Skip ETA/prediction cache writes | `false` |
| `FACTORY_STALE_ESCALATION_DAYS` | Days before factory escalation | `14` |
| `APP_BASE_URL` | App base URL for testing | `http://localhost:3000` |
| `LOCAL_DATABASE_URL` | Local PostgreSQL URL (for dev migration scripts) | — |

---

## Deployment

### Docker (recommended)

```bash
# Build and start
docker compose up -d --build

# Verify
docker compose ps
curl http://localhost:3000
```

### Manual

```bash
npm install
npx prisma generate
npm run build
npm start
```

### Process manager (PM2)

```bash
npm install -g pm2
pm2 start npm --name opsmind -- start
pm2 save
```

---

## Supabase redirect URL

In Supabase Dashboard → Authentication → URL Configuration, add your deployment URL to **Redirect URLs** (e.g. `https://your-domain.com/**`).
