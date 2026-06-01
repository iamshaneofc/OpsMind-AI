# OpsMind Operations AI (Concise Overview)

## 1) Login / Credentials
Users authenticate with **Supabase email + password**:
- Frontend: `src/app/login/login-form.tsx` → `supabase.auth.signInWithPassword({ email, password })`

Supabase environment variables required (values are secret):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side admin usage)

Optional ERP SQL Server data credentials (used when `USE_SQL_SERVER_DATA=true`):
- `USE_SQL_SERVER_DATA`
- `SQL_SERVER_HOST`, `SQL_SERVER_PORT`, `SQL_SERVER_USER`, `SQL_SERVER_PASSWORD`
- `SQL_SERVER_DATABASE`
- `SQL_SERVER_ENCRYPT`, `SQL_SERVER_TRUST_SERVER_CERTIFICATE`

## 2) Roles: Distributor vs Super Admin
Roles come from `users.role_id` (mapped in `src/services/auth.ts`):
- `role_id = 1` → `super_admin`
- `role_id = 3` → `warehouse`
- otherwise → `distributor`

Distributor access (UI + routes):
- Can use: Dashboard (`/dashboard`), Orders (`/dashboard/orders`), Chatbot, Account
- Cannot access Inventory or Alerts (redirected away)

Warehouse/Super Admin access:
- Can access: Inventory (`/dashboard/inventory`) and Alerts (`/dashboard/alerts`) in addition to orders/chatbot/account

## 3) What the app displays (from ERP/SQL Server)
The dashboard shows **Operations Command Center** KPIs + an orders status chart:
- Source endpoint: `GET /api/dashboard/metrics`
- Backend: `src/services/operations.ts:getDashboardMetrics()`

### Dashboard record window alignment
To keep dashboard numbers aligned with what’s shown in the Orders table:
- Orders page displays **up to 100 orders** (`ORDERS_LIMIT = 100`)
- Dashboard metrics use `ORDERS_WINDOW = 100` for the same “latest orders” scope

## 4) Orders details
Orders list (table) comes from:
- `GET /api/dashboard/orders` → `src/services/operations.ts:getOrdersForRole()`
- SQL Server orders are limited to **TOP 100** (newest by `voucher_date DESC`)

Each order row status is derived from the **latest invoice header** linked to that order (latest by `voucher_date DESC`):
- `DELIVERED` if `DATE_OF_REMOVAL IS NOT NULL`
- `DISPATCH_READY` if `confirmed = 1`
- else `IN_PREPARATION`
- if no invoice exists → `PENDING`

## 5) Inventory details (and low-stock logic)
Inventory page comes from:
- `GET /api/dashboard/inventory` → `src/services/operations.ts:getInventoryForRole()`
- SQL Server inventory fetch returns **TOP 50** rows (limited view)

Low-stock logic uses a single threshold:
- `STOCK_QTY <= 30` (also used as `reorder_level = 30` in mapped objects)

UI behavior:
- Table marks each row as `Low Stock` when `available_qty <= reorder_level`
- “Low stock only” toggle filters the already-fetched rows
- Backend ordering is adjusted so low-stock appears first in the limited TOP set

## 6) Alerts (operational signals)
Alerts page (`/dashboard/alerts`) uses `getAlerts(profile)`:
- For SQL Server mode, alerts are approximated from low-stock products
- Low-stock products used by the alerts panel are limited (TOP set) and based on the same `<= 30` threshold

Alerts list can also update via Supabase realtime inserts into `public.alerts` (UI subscription).

## 7) Chatbot: Top-5 results rule
Chatbot responses are constrained to avoid large outputs:
- System prompt in `src/app/api/chat/route.ts` instructs the assistant:
  - “ALWAYS show only the FIRST 5 items initially”
  - return both readable text and a JSON block for UI rendering

Role-specific tool access:
- Distributor tools exclude inventory/dispatch/low-stock tools
- Warehouse/Super Admin can call those operational tools

