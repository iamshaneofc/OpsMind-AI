# Environment Variables & Vercel Deployment

## Local first-time setup

1. **Dependencies:** `npm install`
2. **Env file:** copy `.env.example` to `.env` and paste your Supabase + OpenAI keys (same as production or a dev project).
3. **Check:** `npm run local:check` — confirms `.env` and required keys.
4. **Run app:** `npm run dev` → open [http://localhost:3000](http://localhost:3000).
5. **Database migrations:** when Supabase is reachable, run new SQL from `supabase/migrations/` in **Dashboard → SQL Editor** (no CLI required).

---

## Required for all environments

Set these in **Vercel** (Project → Settings → Environment Variables) and in local `.env`:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `OPENAI_API_KEY` | OpenAI API key (starts with `sk-`) |

## Optional: SQL Server (operations data)

Only if you use a remote SQL Server for orders/inventory/invoices:

| Variable | Description |
|----------|-------------|
| `USE_SQL_SERVER_DATA` | `true` to enable SQL Server data source |
| `SQL_SERVER_HOST` | SQL Server host/IP |
| `SQL_SERVER_PORT` | Default `1433` |
| `SQL_SERVER_USER` | DB user |
| `SQL_SERVER_PASSWORD` | DB password |
| `SQL_SERVER_DATABASE` | Database name |
| `SQL_SERVER_ENCRYPT` | `true` for TLS |
| `SQL_SERVER_TRUST_SERVER_CERTIFICATE` | `true` if using self-signed cert |

**Vercel note:** SQL Server must be reachable from the public internet (e.g. E2E Cloud VM or tunnel). A machine on your local network is not reachable from Vercel. For Vercel, either set `USE_SQL_SERVER_DATA=false` and use Supabase-only data, or host SQL Server at a public IP that allows inbound connections from Vercel.

### Distributor orders (SQL Server): map app company → ERP `account_id`

Supabase `users.company_id` is **not** the same as SQL Server `dbo.sales_order_header.account_id`.  
Apply migration `20260319100000_add_erp_account_mapping_to_companies.sql`, then set on `public.companies`:

- **`erp_account_id`** — single ERP customer account id (matches `account_id` on sales orders), or  
- **`erp_account_ids`** — PostgreSQL `integer[]` of multiple account ids (when set, used instead of `erp_account_id`).

Example (adjust ids from your ERP):

```sql
UPDATE public.companies SET erp_account_id = 1426 WHERE company_id = 8;
UPDATE public.companies SET erp_account_id = 1428 WHERE company_id = 9;
```

Until this is set, distributor logins will see **no** ERP orders (by design).

---

## Deploy to Vercel

1. **Push your code** to GitHub (ensure `.env` is in `.gitignore` — do not commit secrets).

2. **Import in Vercel:** [vercel.com/new](https://vercel.com/new) → Import your repo → **Next.js** framework (auto-detected).

3. **Add environment variables** (Settings → Environment Variables). Add each variable from the tables above; use the same values as in your local `.env`. Apply to **Production**, **Preview**, and **Development** as needed.

4. **Deploy:** Deploy from the main branch or trigger a new deployment. Build command: `npm run build` (default).

5. **Supabase redirect URL:** In Supabase Dashboard → Authentication → URL Configuration, add your Vercel URL to **Redirect URLs** (e.g. `https://your-app.vercel.app/**`).

Done. Your app will be live at `https://your-app.vercel.app`.
