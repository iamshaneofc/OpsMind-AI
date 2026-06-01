# Auth & Login Credentials (App + Backend)

## 1) App login (what the user enters)
The app login screen uses **Supabase email + password**:
- Frontend: `src/app/login/login-form.tsx`
  - calls `supabase.auth.signInWithPassword({ email, password })`

After login, the app loads the user’s role + access context from Supabase:
- `src/services/auth.ts: getCurrentUserProfile()`
  - reads the `users` table columns: `user_id, email, name, role_id, company_id, warehouse_id`
  - maps `role_id` to app roles:
    - `1` => `super_admin`
    - `3` => `warehouse`
    - otherwise => `distributor`

So: **there are no hard-coded app-user passwords in the repo**. Each user must have their own Supabase account credentials.

## 2) Supabase connection “credentials” (from `.env`)
These are required for the app to authenticate against Supabase. Values are secret—do not share them.

Client-side (browser) Supabase env:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Server/admin Supabase env (used for protected server logic + admin client):
- `SUPABASE_SERVICE_ROLE_KEY`
  - used in `src/supabase/admin.ts` via `createSupabaseAdminClient()`

Env helper:
- `src/supabase/env.ts` reads:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

## 3) ERP SQL Server credentials (NOT for login, but used for dashboard data)
When `USE_SQL_SERVER_DATA=true`, the dashboard/orders/inventory metrics are read from SQL Server using these env variables:
- `USE_SQL_SERVER_DATA=true|false`
- `SQL_SERVER_HOST`
- `SQL_SERVER_PORT`
- `SQL_SERVER_USER`
- `SQL_SERVER_PASSWORD`
- `SQL_SERVER_DATABASE`
- `SQL_SERVER_ENCRYPT`
- `SQL_SERVER_TRUST_SERVER_CERTIFICATE`

## 4) How “credentials” should be provided to a user
- Provide the **user’s Supabase email + password** for that specific account (stored in Supabase).
- Provide the **environment variable names** above to whoever configures the deployment (values stay private).

