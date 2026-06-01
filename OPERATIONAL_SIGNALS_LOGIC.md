# OpsMind Operations AI - Dashboard & Inventory Alerts Logic

This document explains **everything the UI displays** for the operations dashboard, and the **backend logic / SQL** that powers those values.

It covers:
- Navigation + role-based access
- Operations Command Center dashboard KPIs + chart
- Orders page (table + polling)
- Inventory page (table + low-stock badge + polling)
- Alerts page (operational signals list)
- Chatbot page (tooling + access rules)
- Account page (identity context)

All low-stock logic uses the same core threshold:
- **Low-stock threshold (`reorder_level`) = 30** (hard-coded in app logic and used in SQL filters)

---

## 1) Roles, navigation, and access control

### App roles in this project
- `super_admin`
- `distributor`
- `warehouse`

### Shared layout elements (visible on all dashboard pages)
All dashboard pages use the authenticated dashboard layout:
- `src/app/dashboard/layout.tsx`

The layout renders:
- `NavigationLoader` (`src/components/dashboard/navigation-loader.tsx`)
- `Sidebar` (`src/components/dashboard/sidebar.tsx`, role-specific via `getNavItems()`)
- `TopNav` (`src/components/dashboard/top-nav.tsx`, displays identity + role label)
- `LogoutButton` (`src/components/dashboard/logout-button.tsx`)

Additionally, `TopNav` shows a static “System healthy” indicator pill.

### Navigation items shown per role
Navigation is filtered by `getNavItems()` in:
- `src/components/dashboard/nav-items.ts`

For `distributor`, only these routes appear:
- `/dashboard`
- `/dashboard/orders`
- `/dashboard/chatbot`
- `/dashboard/account`

For `warehouse` and `super_admin`, these appear too:
- `/dashboard/inventory`
- `/dashboard/alerts`

### Route-level access guard
Route access policy is centralized in:
- `src/auth/role-guard.ts`

It blocks access to inventory/alerts for distributors.

### Page-level redirect for distributors
Even if a route is hit directly, distributors are redirected:
- `src/app/dashboard/inventory/page.tsx`:
  - if `profile.role === "distributor"`, redirects to `/dashboard`
- `src/app/dashboard/alerts/page.tsx`:
  - if `profile.role === "distributor"`, redirects to `/dashboard`

---

## 2) Dashboard (Operations Command Center)

### Where it renders
- Page: `src/app/dashboard/page.tsx`
- Main component: `src/components/dashboard/dashboard-realtime.tsx`

### Refresh behavior
The dashboard is updated periodically:
- Every 15 seconds (polling) via `fetch("/api/dashboard/metrics")`

### Dashboard UI elements

#### KPI cards (StatsGrid)
KPI cards are rendered in:
- `src/components/dashboard/stats-grid.tsx`

KPIs shown:
- `Orders Today` = `metrics.ordersToday`
- `Orders In Progress` = `metrics.inProgress`
- `Inventory Alerts` = `metrics.inventoryAlerts`
- `Dispatch Queue` = `metrics.dispatchQueue`

#### Orders distribution chart (PieChart)
Rendered by:
- `src/components/dashboard/orders-status-chart.tsx`

Chart data:
- `metrics.ordersByStatus` as `{ name, value }`

#### “Top signals” badges
Badges shown above the KPIs are derived from the KPI values in:
- `src/components/dashboard/dashboard-realtime.tsx`

Labels currently used:
- `Low-stock orders`: from `metrics.inventoryAlerts`
- `Dispatch pending`: from `metrics.dispatchQueue`
- `In progress`: from `metrics.inProgress`
- `New today`: from `metrics.ordersToday`

#### Recommended actions (static UI cards)
On the right side of the dashboard, the app shows “Recommended actions” cards (static copy + links), implemented in:
- `src/components/dashboard/dashboard-realtime.tsx`

The cards link to:
- `/dashboard/orders` (Review dispatch queue)
- `/dashboard/inventory` (Resolve low-stock items)
- `/dashboard/chatbot` (Ask the bot for exceptions)

Note on role-based access:
- `distributor` users are redirected away from `/dashboard/inventory` and `/dashboard/alerts`
- so clicking those cards may route back to `/dashboard` depending on the user role and guard behavior

---

## 3) Dashboard backend: `/api/dashboard/metrics`

### API route
- `src/app/api/dashboard/metrics/route.ts`
  - `GET` → requires auth (`requireAuthenticatedUser()`)
  - returns `getDashboardMetrics(profile)` from `src/services/operations.ts`

### Service: `getDashboardMetrics(profile)`
File:
- `src/services/operations.ts`

When SQL Server data is enabled (`isSqlServerDataEnabled()`), all metrics are calculated from ERP SQL Server tables.

If SQL Server is disabled, `getDashboardMetrics()` returns:
- `ordersToday: 0`
- `inProgress: 0`
- `inventoryAlerts: 0`
- `dispatchQueue: 0`
- `ordersByStatus: []`

#### Core scoping rule: align with the Orders page
To keep dashboard KPIs consistent with what the user sees on `/dashboard/orders`, metrics are computed from the most recent orders window:
- `ORDERS_WINDOW = 100`

That means:
- Orders list shows up to 100 most recent orders
- Dashboard metrics are based on those same 100 orders

#### Role-based scoping (what “scope” means)
- For `warehouse` users:
  - Orders are scoped to lines where `sales_order_body.Despatch_Location_ID = profile.warehouse_id`
- For `distributor` users:
  - Orders are scoped by `sales_order_header.account_id IN (distributor ERP account ids)`
  - The distributor’s ERP account IDs come from `getDistributorSqlAccountIds(profile)`

#### Inventory low-stock count: `inventoryAlerts`
**After the recent alignment changes in this repo**, `inventoryAlerts` is no longer counting arbitrary rows across all stock.

It is now computed as:
- `COUNT(DISTINCT sales_order_id)` among the scoped 100 orders
- An order is considered affected if **any** of its sales lines has:
  - matching dispatch location (`Despatch_Location_ID`)
  - matching product (`product_id`)
  - `dbo.CurrentStock.STOCK_QTY <= 30`

Result expectation:
- `inventoryAlerts` should be <= 100 (because it is distinct order count within the 100-order scope)

#### Orders Today: `ordersToday`
Counts orders in the scoped window where `voucher_date` is today (UTC date boundary).

#### Orders In Progress: `inProgress`
Calculated as the sum of these statuses in the scoped window:
- `PENDING`
- `IN_PREPARATION`
- `AWAITING_FACTORY`
- `IN_TRANSIT`

#### Dispatch Queue: `dispatchQueue`
Calculated as:
- `DISPATCH_READY` count among the scoped window

Note:
- `dispatchQueue` is driven by the same status grouping query that powers `ordersByStatus` and the distribution chart.

#### Status derivation alignment (important)
Dashboard order status is derived using the **latest invoice header by `voucher_date DESC`**.

This prevents dashboard status from diverging from:
- `deriveOrderStatusFromERP()` (used on the Orders table rows)

---

## 4) Orders page: `/dashboard/orders`

### Where it renders
- Page: `src/app/dashboard/orders/page.tsx`
- UI components:
  - `src/components/orders/orders-realtime-table.tsx`
  - `src/components/orders/orders-table.tsx`

### Refresh behavior
- Polls every 15 seconds:
  - `GET /api/dashboard/orders`

### How many orders are displayed
In SQL Server mode:
- `getOrdersForRole()` uses `ORDERS_LIMIT = 100`

### Status shown in each order row
Status is computed per order via:
- `deriveOrderStatusFromERP(sales_order_id)`

That function:
- selects `TOP 1` linked invoice header by `voucher_date DESC`
- determines:
  - `DELIVERED` if `DATE_OF_REMOVAL IS NOT NULL`
  - `DISPATCH_READY` if `confirmed = 1`
  - otherwise `IN_PREPARATION`
- if no invoice exists:
  - `PENDING`

---

## 5) Inventory page: `/dashboard/inventory`

### Where it renders
- Page: `src/app/dashboard/inventory/page.tsx`
  - distributors are redirected away
- UI components:
  - `src/components/inventory/inventory-realtime-table.tsx`
  - `src/components/inventory/inventory-table.tsx`

### Refresh behavior
- Poll every 20 seconds:
  - `GET /api/dashboard/inventory`

### How many inventory rows are returned
In SQL Server mode, `getInventoryForRole()` fetches a limited inventory window:
- `SELECT TOP 50 ... FROM dbo.CurrentStock`

The inventory page therefore:
- displays up to 50 inventory rows at a time
- relies on ordering to show low-stock rows first (so the “low stock only” toggle works with the limited dataset)

### Inventory row “Alert” badge
Inventory rows are marked low-stock if:
- `available_qty <= reorder_level`

In the SQL Server mapping, `reorder_level` is currently set to:
- `30` (hard-coded)

### “Low stock only” toggle
The toggle is implemented on the client by filtering loaded rows:
- it only hides rows if `onlyLowStock` is enabled and a row is not low-stock.

To keep it consistent with the low-stock definition, the backend inventory SQL sorts low stock first:
- `getInventoryForRole()` (SQL Server mode)
  - ordering puts `STOCK_QTY <= 30` ahead, then `STOCK_QTY ASC`
- SQL server helpers:
  - `sqlServerGetWarehouseInventory()`
  - `sqlServerGetAllInventory()`

---

## 6) Alerts page: `/dashboard/alerts` (Operational Signals)

### Where it renders
- Page: `src/app/dashboard/alerts/page.tsx`
- UI: `src/components/alerts/alerts-panel.tsx`

### Access
- distributors are redirected away in `src/app/dashboard/alerts/page.tsx`

### How initial alerts are produced
The page calls:
- `getAlerts(profile)` from `src/services/operations.ts`

In SQL Server mode (and in this current implementation), alerts are approximated from low-stock signals:
- `sqlServerGetLowStockProducts(profile)` in `src/sql-server/operations.ts`

Important detail: low-stock products for the alerts panel are limited.
In SQL Server mode:
- `sqlServerGetLowStockProducts()` uses `DEFAULT_LIMIT = 5`
- it selects `TOP 5` rows from `dbo.CurrentStock` where `STOCK_QTY <= 30`
- ordered by `STOCK_QTY ASC` (lowest stock first)

Each alert record is returned as:
- `title: "Low stock: <product_name> (<sku>)"`
- `severity: "critical"`
- `status: "open"`

### Realtime alert updates
`AlertsPanel` subscribes to Supabase realtime inserts:
- inserts into `public.alerts`
- `INSERT` events are prepended into the local UI list (max 50)

---

## 7) Chatbot: `/dashboard/chatbot`

### Where it renders
- Page: `src/app/dashboard/chatbot/page.tsx`
- Chat UI: `src/components/chatbot/chatbot-panel.tsx`

### Chat behavior summary
1. Chat history is stored in Supabase tables (session based).
2. Messages are sent to:
   - `POST /api/chat`
3. The `/api/chat` route uses OpenAI function calling tools.
4. Tool outputs are injected back into the conversation and returned as streaming text.

### Assistant suggestions shown in UI
In `src/components/chatbot/chatbot-panel.tsx`, suggestions depend on role:
- distributor: orders-focused suggestions
- warehouse: inventory/dispatch suggestions

### Backend chat API: `/api/chat`
- `src/app/api/chat/route.ts`

It:
- resolves user context
- sets an access-control system prompt (`SYSTEM_PROMPT`)
- filters available tools for distributors (inventory/dispatch/low-stock tools removed)
- executes tool calls using:
  - `executeTool()` from `src/ai/tools.ts`

Exact distributor tool filtering:
- When `profile.role === "distributor"`, `/api/chat` removes tools whose names are:
  - `getWarehouseInventory`
  - `getLowStockProducts`
  - `getDispatchQueue`

### Phase 1 — Lane A (order truth in chat)

**Data split (production):** **Supabase** is used for **authentication**, **chat sessions/messages**, and related app tables. **Operational / ERP order truth** (status, lines, invoices, Lane A) comes from **SQL Server** when `USE_SQL_SERVER_DATA=true` (`src/sql-server/config.ts`). Optional **Supabase `orders`** paths exist for dev/demo when SQL is off.

**Step A — ERP status alignment (done):** `getOrderStatus` uses the same lifecycle derivation as the dashboard (`deriveOrderStatusFromERP`, `estimateExpectedDeliveryDate` in `src/sql-server/order-lifecycle.ts` / `src/sql-server/operations.ts`).

**Step B — `lane_a` snapshot on the tool (done):** `sqlServerGetOrderStatus` attaches `lane_a: buildLaneAOrderSnapshot(...)` — indicative estimated delivery window, next update by, next action (`src/sql-server/lane-a-snapshot.ts`).

**SQL `getOrderDrilldown` (Step 1):** `sqlServerGetOrderDrilldown` uses the same `deriveOrderStatusFromERP`, `estimateExpectedDeliveryDate`, and `buildLaneAOrderSnapshot` as `getOrderStatus`, exposes top-level `order_number` + `lane_a`, and accepts numeric `sales_order_id` like `getOrderStatus`.

**Supabase `getOrderDrilldown` (Step 2, parity):** When SQL is disabled, drilldown returns the same top-level **`order_number`** + **`lane_a`** shape as Supabase `getOrderStatus` (`buildLaneAForSupabaseOrder` in `src/services/lane-a-supabase.ts`), with distributor/warehouse scoping aligned to `getOrderStatus`.

**ERP verification script:** `scripts/verify-order-erp.sql` (+ optional `scripts/run-verify-order-sqlcmd.ps1`) — run against the same database as the app to compare voucher → `sales_order_id`, derived status, linked invoices, and line counts.

**Step C — Chat UI consumes `lane_a` (done):**
- **SQL and Supabase:** `getOrderStatus` always includes `lane_a` when the order is found — SQL via `src/sql-server/lane-a-snapshot.ts`; Supabase via `buildLaneAForSupabaseOrder` in `src/services/lane-a-supabase.ts` (`src/ai/tools.ts`). **`getOrderDrilldown`** includes **`lane_a`** on both SQL and Supabase paths when the order is found.
- **Prompts:** `/api/chat` instructs the model to summarize `lane_a` in prose and append a fenced `json` block `{"order_number":"…","lane_a":{…}}` (verbatim). **DELIVERED:** prompts tell the model not to imply a forward delivery window when `external_status` is `DELIVERED`.
- **Deterministic fallback:** `src/lib/chat-lane-a-append.ts` — after streaming, if the tool result had `lane_a` but the assistant omitted a valid `lane_a` JSON block, the API **appends** the block so **`LaneAQuickView`** still renders.
- **UI:** `src/components/chatbot/parse-assistant-json.ts` strips valid JSON blocks from prose and passes `lane_a` to **`LaneAQuickView`** (`src/components/chatbot/lane-a-quick-view.tsx`) — **estimated delivery window / upcoming estimated delivery**, **next update by**, **suggested next step**.
- When **`external_status` is `DELIVERED`**, the snapshot does **not** use a forward-looking estimated delivery window; the card shows **Upcoming estimated delivery** as N/A.
- **Try next** chips (`chat-follow-up-suggestions.ts`) skip “expected delivery date” when the last reply looks **delivered** and suggest pivots like **Track another order** / **Show today's invoices**.
- Shared types: `src/types/lane-a.ts`. Prose Quick view tables still come from `assistant-message-parser.ts`.

---

## 8) Account page: `/dashboard/account`

### Where it renders
- `src/app/dashboard/account/page.tsx`

### What it displays
The page shows:
- `Email`: `profile.email`
- `Role`: `roleLabel(profile.role)` from `src/services/operations.ts`
- `Company`: `profile.company_id` (or “Not assigned”)
- `Warehouse`: `profile.warehouse_id` (or “Not assigned”)

---

## 9) Backend APIs summary (routes that feed dashboards)

### Dashboard metrics
- `GET /api/dashboard/metrics`
- source:
  - `src/services/operations.ts:getDashboardMetrics()`

### Orders list
- `GET /api/dashboard/orders`
- source:
  - `src/services/operations.ts:getOrdersForRole()`

### Inventory list
- `GET /api/dashboard/inventory`
- source:
  - `src/services/operations.ts:getInventoryForRole()`

### Chatbot
- `POST /api/chat`
- source:
  - `src/app/api/chat/route.ts`
  - tools: `src/ai/tools.ts`
  - SQL ERP operations: `src/sql-server/operations.ts`

Alerts streaming:
- Supabase realtime on `public.alerts` INSERT

---

## 10) Key constants and thresholds

Low-stock threshold:
- `STOCK_QTY <= 30`

Inventory reorder level:
- `reorder_level = 30` (hard-coded in inventory mapping)

Orders window alignment:
- `TOP 100` window for dashboard metrics and orders list

---

## 11) Notes about “what exactly counts”

- `inventoryAlerts` is a distinct order count (<= 100) that indicates whether any order in the scoped window is affected by low stock.
- The inventory table shows low-stock status per inventory row with `available_qty <= reorder_level`.
- The Alerts panel is driven by low-stock product signals (approximation) and can also stream additional alert rows from Supabase.

