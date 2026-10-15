# OpsMind Operations AI — Demo Guide

## Quick Start

1. Copy `.env.example` → `.env` and set `DATABASE_URL`, Supabase, and OpenAI keys.
2. Push schema and seed industry packs:

```bash
npm run db:push
npm run seed:industries
npm run dev
```

3. Open `http://localhost:3001/login`

**Industry switcher:** top-right of every dashboard page — **Chemical (default) | Automobile | Pharma | Agriculture**. Switching reloads KPIs, tables, insights, and bot context.

---

## Authentication Credentials

**All demo users share the same password:** `OpsMind@12345` (or `SEED_PASSWORD` from `.env` if you still use `seed:demo` for auth users).

### Super Admin
- **Email:** `super.admin@opsmindchemicals.com`
- **Access:** Full dashboard + assistant across the active industry dataset

### Distributors / Warehouse (legacy seed:demo auth)
| User | Email | Notes |
|------|-------|-------|
| OpsMind Distributor | `distributor@opsmindchemicals.com` | Company-scoped login |
| Pradeep | `pradeep@opsmindchemicals.com` | Distributor |
| Rohit | `rohit@opsmindchemicals.com` | Distributor |
| OpsMind Warehouse | `warehouse@opsmindchemicals.com` | Mumbai hub |
| Mumbai Warehouse | `warehouse.mumbai@opsmindchemicals.com` | Pune hub |

> Prisma industry packs power the **dashboard + bot**. Supabase auth users still come from `npm run seed:demo` if needed.

---

## Industry datasets (`npm run seed:industries`)

| Industry | Company label | Orders | Products | Customers | Warehouses | Hero order |
|----------|---------------|--------|----------|-----------|------------|------------|
| Chemical (hero) | Meridian Specialty Chem | ~1000 | ~140 | ~55 | 5 | `CHEM-1042` |
| Automobile | OpsMind Auto Parts | ~900 | ~150 | ~50 | 4 | `AUTO-1042` |
| Pharma | OpsMind Pharma Supply | ~850 | ~110 | ~42 | 4 | `PHAR-1042` |
| Agriculture | OpsMind Agri Inputs | ~880 | ~120 | ~45 | 4 | `AGRI-1042` |

Each pack includes mixed statuses (`PENDING`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `DELAYED`, `CANCELLED`), low/out-of-stock SKUs, overdue invoices, and inactive accounts so every assistant tool has rich answers.

### Chemical hero entities
- Order: `CHEM-1042` (DELAYED)
- Customer: Bharat Fine Chemicals
- SKUs: e.g. caustic / IPA / HCl style catalogue
- Hubs: Mumbai Hub, Pune Central, Ahmedabad West, Chennai South, Delhi NCR

---

## Sales demo narrative (15 minutes)

1. **Login** as super admin → land on Chemical dataset.
2. **Dashboard** — show Revenue, Collected, Orders, Inventory Health, Fulfillment, Customers (INR).
3. **Assistant** — run 5–6 Chemical scripts below.
4. **Insights & Tips** — open Today’s priorities → click **Ask OpsMind** on a tip.
5. **Toggle** to Automobile → same screens, different data → 2–3 auto questions.
6. Optional: Pharma / Agriculture toggle for “one platform, many industries.”

---

## Golden conversations — Chemical (20+)

Use with dataset set to **Chemical**.

1. Show me the most recent orders  
2. Which orders are delayed?  
3. Give me details for order CHEM-1042  
4. What is pending or still processing?  
5. Show low stock products below 30 units across warehouses  
6. What is our total inventory valuation?  
7. Show inventory for Mumbai Hub  
8. Who are our top distributors by revenue?  
9. Which customers have been inactive with no recent orders?  
10. Show overdue invoices with customer names and amounts  
11. Show all outstanding unpaid invoices  
12. What are our revenue trends / collected payments?  
13. What are the top selling chemical products?  
14. Give me today’s operational tips  
15. Summarize order pipeline by status and what is blocking fulfillment  
16. Compare warehouse inventory levels and highlight imbalances  
17. Show order history for Bharat Fine Chemicals (use customer id from a prior top-customers answer)  
18. Which SKUs are out of stock?  
19. How healthy is inventory right now?  
20. List delayed shipments that need chasing today  
21. What should I do first this morning?  
22. Show CHEM-2187 and CHEM-3301 status  

---

## Golden conversations — Automobile (10)

1. Show recent dealer orders  
2. Which auto orders are delayed?  
3. Details for AUTO-1042  
4. Low stock brake pads and filters  
5. Top dealers by revenue  
6. Overdue invoices  
7. Inventory valuation  
8. Top selling spare parts  
9. Inactive dealers  
10. Today’s operational tips  

---

## Golden conversations — Pharma (10)

1. Recent hospital / distributor orders  
2. Delayed PHAR shipments  
3. Details for PHAR-1042  
4. Low stock formulations  
5. Top hospital buyers  
6. Overdue invoices  
7. Outstanding AR  
8. Top products  
9. Inactive accounts  
10. Today’s operational tips  

---

## Golden conversations — Agriculture (10)

1. Recent dealer and co-op orders  
2. Delayed AGRI shipments  
3. Details for AGRI-1042  
4. Low fertilizer / seed stock  
5. Top co-op buyers  
6. Overdue invoices  
7. Inventory valuation by hub  
8. Top agri products  
9. Inactive dealers  
10. Today’s operational tips  

---

## Screens to highlight

| Screen | What to say |
|--------|-------------|
| Dashboard | Live KPIs for the active industry; Collected = paid invoices |
| Operations | Dense order list with real statuses |
| Inventory | Hub × SKU qty; low stock visible |
| Customers | Distributors / dealers / hospitals / co-ops |
| Insights & Tips | Ranked “do this today” cards with Ask OpsMind |
| Assistant | Natural language over the same dataset |
| Reports | Download live CSV snapshots (not fake PDFs) |
| WhatsApp | Showcase only (demo UI) |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Empty dashboard / bot | Run `npm run db:push` then `npm run seed:industries` |
| Wrong industry data | Use the top-right industry switcher; refresh |
| Bot invents numbers | Confirm OpenAI key is set; tools must return rows |
| Auth login fails | Run `npm run seed:demo` for Supabase auth users |
| Prisma generate fails | `npx prisma generate` with `DATABASE_URL` in `.env` |

---

## Out of scope for this demo build

FIFO/lots/reservations/barcode/stock writes, POS, production WhatsApp/Wati wiring, and auto industry self-training. The product story is **bot + management dashboards** over rich industry datasets.


## Table `Customer`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `name` | `text` |  |
| `email` | `text` |  Nullable |
| `phone` | `text` |  Nullable |
| `address` | `text` |  Nullable |
| `status` | `text` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |
| `location` | `text` |  Nullable |

## Table `Product`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `sku` | `text` |  |
| `name` | `text` |  |
| `category` | `text` |  Nullable |
| `price` | `float8` |  |
| `cost` | `float8` |  Nullable |
| `description` | `text` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `Warehouse`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `name` | `text` |  |
| `location` | `text` |  |
| `capacity` | `int4` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `Order`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `orderNumber` | `text` |  |
| `customerId` | `text` |  |
| `warehouseId` | `text` |  |
| `status` | `text` |  |
| `totalAmount` | `float8` |  |
| `orderDate` | `timestamp` |  |
| `expectedDelivery` | `timestamp` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `OrderItem`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `orderId` | `text` |  |
| `productId` | `text` |  |
| `quantity` | `int4` |  |
| `unitPrice` | `float8` |  |
| `totalPrice` | `float8` |  |
| `createdAt` | `timestamp` |  |

## Table `Invoice`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `invoiceNumber` | `text` |  |
| `orderId` | `text` |  |
| `amount` | `float8` |  |
| `status` | `text` |  |
| `dueDate` | `timestamp` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `InventoryMovement`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `productId` | `text` |  |
| `warehouseId` | `text` |  |
| `quantity` | `int4` |  |
| `type` | `text` |  |
| `createdAt` | `timestamp` |  |

## Table `AiProviderConfig`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `provider` | `text` |  |
| `apiKey` | `text` |  |
| `isActive` | `bool` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `UserRole`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `email` | `text` |  |
| `role` | `text` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `invoices`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `invoice_id` | `int4` |  Nullable Unique |
| `invoice_number` | `text` |  |
| `invoice_date` | `timestamptz` |  |
| `prompt_1` | `text` |  Nullable |
| `prompt_2` | `text` |  Nullable |
| `prompt_3` | `text` |  Nullable |
| `prompt_4` | `text` |  Nullable |
| `prompt_5` | `text` |  Nullable |
| `base_amount` | `numeric` |  |
| `discount_amount` | `numeric` |  |
| `excise_amount` | `numeric` |  |
| `tax_amount` | `numeric` |  |
| `item_amount` | `numeric` |  |
| `invoice_total_amount` | `numeric` |  |
| `confirmed` | `bool` |  |
| `transport_name` | `text` |  Nullable |
| `vehicle_number` | `text` |  Nullable |
| `date_of_removal` | `timestamptz` |  Nullable |
| `company_id` | `int4` |  Nullable |
| `account_id` | `int4` |  Nullable |
| `customer_full_name` | `text` |  Nullable |
| `customer_short_name` | `text` |  Nullable |
| `customer_address` | `text` |  Nullable |
| `customer_city` | `text` |  Nullable |
| `customer_pincode` | `text` |  Nullable |
| `customer_telephone` | `text` |  Nullable |
| `customer_email` | `text` |  Nullable |
| `customer_vat_tin` | `text` |  Nullable |
| `customer_cst_tin` | `text` |  Nullable |
| `customer_gst_number` | `text` |  Nullable |
| `customer_contact_person` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `customer_id` | `uuid` |  Nullable |
| `proforma_invoice_id` | `uuid` |  Nullable |

## Table `invoice_items`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `invoice_id` | `uuid` |  |
| `invoice_body_id` | `int4` |  Nullable |
| `order_body_id` | `int4` |  Nullable |
| `product_id` | `uuid` |  Nullable |
| `product_catalogue_number` | `text` |  Nullable |
| `product_description` | `text` |  Nullable |
| `product_cas_number` | `text` |  Nullable |
| `packing_id` | `int4` |  Nullable |
| `pack_quantity` | `numeric` |  Nullable |
| `product_catalogue_price` | `numeric` |  Nullable |
| `product_mrp` | `numeric` |  Nullable |
| `invoice_quantity` | `int4` |  |
| `order_quantity` | `int4` |  Nullable |
| `net_order_quantity` | `int4` |  Nullable |
| `order_price` | `numeric` |  Nullable |
| `order_net_price` | `numeric` |  Nullable |
| `order_discount_percentage` | `numeric` |  Nullable |
| `order_item_total_amount` | `numeric` |  Nullable |
| `invoice_line_base_amount` | `numeric` |  |
| `invoice_line_discount_amount` | `numeric` |  |
| `invoice_line_excise_amount` | `numeric` |  |
| `invoice_line_tax_amount` | `numeric` |  |
| `invoice_line_item_amount` | `numeric` |  |
| `sgst_percent` | `numeric` |  Nullable |
| `cgst_percent` | `numeric` |  Nullable |
| `igst_percent` | `numeric` |  Nullable |
| `sgst_amount` | `numeric` |  Nullable |
| `cgst_amount` | `numeric` |  Nullable |
| `igst_amount` | `numeric` |  Nullable |
| `order_product_printing_name` | `text` |  Nullable |
| `order_remarks` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `invoice_orders`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `invoice_id` | `uuid` |  |
| `order_id` | `uuid` |  Nullable |
| `order_number` | `text` |  Nullable |
| `order_date` | `timestamptz` |  Nullable |
| `customer_po_number` | `text` |  Nullable |
| `customer_po_date` | `timestamptz` |  Nullable |
| `order_total_amount` | `numeric` |  Nullable |
| `payment_terms` | `int4` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `companies`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `name` | `text` |  Unique |
| `code` | `text` |  Nullable Unique |
| `created_at` | `timestamptz` |  |
| `base_warehouse_id` | `int4` |  Nullable |

## Table `warehouses`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `name` | `text` |  |
| `location` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `products`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `name` | `text` |  |
| `sku` | `text` |  Unique |
| `unit` | `text` |  |
| `created_at` | `timestamptz` |  |
| `product_id` | `int4` |  Nullable |
| `catalogue_number` | `text` |  Nullable Unique |
| `description` | `text` |  Nullable |
| `cas_number` | `text` |  Nullable |
| `packing_id` | `int4` |  Nullable |
| `pack_quantity` | `numeric` |  Nullable |
| `catalogue_price` | `numeric` |  Nullable |
| `mrp` | `numeric` |  Nullable |

## Table `users`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `email` | `text` |  Unique |
| `full_name` | `text` |  Nullable |
| `role` | `text` |  |
| `company_id` | `uuid` |  Nullable |
| `warehouse_id` | `uuid` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `orders`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `order_number` | `text` |  Unique |
| `company_id` | `uuid` |  |
| `warehouse_id` | `uuid` |  |
| `status` | `text` |  |
| `expected_dispatch_date` | `date` |  Nullable |
| `expected_delivery_date` | `date` |  Nullable |
| `reason` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `original_eta` | `date` |  Nullable |
| `revised_eta` | `date` |  Nullable |
| `order_status` | `text` |  Nullable |
| `delay_reason` | `text` |  Nullable |
| `delivery_date` | `date` |  Nullable |

## Table `order_items`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `order_id` | `uuid` |  |
| `product_id` | `uuid` |  |
| `quantity` | `numeric` |  |
| `created_at` | `timestamptz` |  |
| `item_status` | `text` |  Nullable |
| `processed_quantity` | `numeric` |  Nullable |
| `pending_quantity` | `numeric` |  Nullable |
| `delayed_quantity` | `numeric` |  Nullable |

## Table `inventory`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `warehouse_id` | `uuid` |  |
| `product_id` | `uuid` |  |
| `available_qty` | `numeric` |  |
| `reorder_level` | `numeric` |  |
| `updated_at` | `timestamptz` |  |
| `created_at` | `timestamptz` |  |

## Table `alerts`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `title` | `text` |  |
| `severity` | `text` |  |
| `status` | `text` |  |
| `warehouse_id` | `uuid` |  Nullable |
| `company_id` | `uuid` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `chatbot_messages`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `role` | `text` |  |
| `message` | `text` |  |
| `response` | `text` |  |
| `created_at` | `timestamptz` |  |

## Table `order_status_history`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `order_id` | `uuid` |  |
| `status` | `text` |  |
| `notes` | `text` |  Nullable |
| `created_by` | `uuid` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `customers`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `account_id` | `int4` |  Nullable Unique |
| `company_id` | `uuid` |  Nullable |
| `full_name` | `text` |  |
| `short_name` | `text` |  Nullable |
| `address` | `text` |  Nullable |
| `city` | `text` |  Nullable |
| `state_id` | `int4` |  Nullable |
| `pincode` | `text` |  Nullable |
| `telephone` | `text` |  Nullable |
| `email` | `text` |  Nullable |
| `vat_tin` | `text` |  Nullable |
| `cst_tin` | `text` |  Nullable |
| `gst_number` | `text` |  Nullable |
| `contact_person` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `proforma_invoices`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `proforma_number` | `text` |  Unique |
| `order_id` | `uuid` |  Nullable |
| `company_id` | `uuid` |  Nullable |
| `proforma_date` | `timestamptz` |  |
| `status` | `text` |  Nullable |
| `total_amount` | `numeric` |  |
| `base_amount` | `numeric` |  |
| `tax_amount` | `numeric` |  |
| `notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `proforma_invoice_items`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `proforma_invoice_id` | `uuid` |  |
| `order_item_id` | `uuid` |  Nullable |
| `product_id` | `uuid` |  Nullable |
| `quantity` | `numeric` |  |
| `unit_price` | `numeric` |  |
| `total_price` | `numeric` |  |
| `product_name` | `text` |  Nullable |
| `product_sku` | `text` |  Nullable |
| `product_description` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `user_whatsapp_accounts`

Maps WhatsApp phone numbers to OpsMind users for WhatsApp authentication

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  Unique |
| `whatsapp_number` | `text` |  Unique |
| `is_verified` | `bool` |  |
| `is_active` | `bool` |  |
| `linked_at` | `timestamptz` |  |
| `last_verified_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## RLS Policies

### `invoices`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `invoices_read` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `invoices_service_insert` | INSERT | service_role | PERMISSIVE | — | `true` |
| `invoices_service_update` | UPDATE | service_role | PERMISSIVE | `true` | — |
| `invoices_select` | SELECT | authenticated | PERMISSIVE | `user_can_access_invoice(id)` | — |
| `invoices_insert` | INSERT | authenticated | PERMISSIVE | — | `(is_super_admin() OR (company_id = get_user_company_id()))` |
| `invoices_update` | UPDATE | authenticated | PERMISSIVE | `user_can_access_invoice(id)` | `(is_super_admin() OR (company_id = get_user_company_id()))` |
| `invoices_delete` | DELETE | authenticated | PERMISSIVE | `user_can_access_invoice(id)` | — |

### `invoice_items`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `invoice_items_read` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `invoice_items_service_insert` | INSERT | service_role | PERMISSIVE | — | `true` |
| `invoice_items_select` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM invoices   WHERE ((invoices.id = invoice_items.invoice_id) AND user_can_access_invoice(invoices.id))))` | — |
| `invoice_items_insert` | INSERT | authenticated | PERMISSIVE | — | `(EXISTS ( SELECT 1    FROM invoices   WHERE ((invoices.id = invoice_items.invoice_id) AND user_can_access_invoice(invoices.id))))` |
| `invoice_items_update` | UPDATE | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM invoices   WHERE ((invoices.id = invoice_items.invoice_id) AND user_can_access_invoice(invoices.id))))` | `(EXISTS ( SELECT 1    FROM invoices   WHERE ((invoices.id = invoice_items.invoice_id) AND user_can_access_invoice(invoices.id))))` |
| `invoice_items_delete` | DELETE | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM invoices   WHERE ((invoices.id = invoice_items.invoice_id) AND user_can_access_invoice(invoices.id))))` | — |

### `invoice_orders`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `invoice_orders_read` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `invoice_orders_service_insert` | INSERT | service_role | PERMISSIVE | — | `true` |
| `invoice_orders_select` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM invoices   WHERE ((invoices.id = invoice_orders.invoice_id) AND user_can_access_invoice(invoices.id))))` | — |
| `invoice_orders_insert` | INSERT | authenticated | PERMISSIVE | — | `(EXISTS ( SELECT 1    FROM invoices   WHERE ((invoices.id = invoice_orders.invoice_id) AND user_can_access_invoice(invoices.id))))` |
| `invoice_orders_update` | UPDATE | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM invoices   WHERE ((invoices.id = invoice_orders.invoice_id) AND user_can_access_invoice(invoices.id))))` | `(EXISTS ( SELECT 1    FROM invoices   WHERE ((invoices.id = invoice_orders.invoice_id) AND user_can_access_invoice(invoices.id))))` |
| `invoice_orders_delete` | DELETE | authenticated | PERMISSIVE | `(is_super_admin() OR (EXISTS ( SELECT 1    FROM invoices   WHERE ((invoices.id = invoice_orders.invoice_id) AND user_can_access_invoice(invoices.id)))))` | — |

### `companies`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `companies_read` | SELECT | authenticated | PERMISSIVE | `true` | — |

### `warehouses`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `warehouses_read` | SELECT | authenticated | PERMISSIVE | `true` | — |

### `products`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `products_read` | SELECT | authenticated | PERMISSIVE | `true` | — |

### `users`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `users_self_or_admin_read` | SELECT | authenticated | PERMISSIVE | `((auth.uid() = id) OR is_super_admin())` | — |
| `users_self_update` | UPDATE | authenticated | PERMISSIVE | `((auth.uid() = id) OR is_super_admin())` | `((auth.uid() = id) OR is_super_admin())` |

### `orders`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `orders_read_by_role` | SELECT | authenticated | PERMISSIVE | `(is_super_admin() OR ((current_user_role() = 'distributor'::text) AND (company_id = current_company_id())) OR ((current_user_role() = 'warehouse'::text) AND (warehouse_id = current_warehouse_id())))` | — |
| `orders_write_admin_warehouse` | ALL | authenticated | PERMISSIVE | `(is_super_admin() OR ((current_user_role() = 'warehouse'::text) AND (warehouse_id = current_warehouse_id())))` | `(is_super_admin() OR ((current_user_role() = 'warehouse'::text) AND (warehouse_id = current_warehouse_id())))` |

### `order_items`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `order_items_read_by_order_scope` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM orders o   WHERE ((o.id = order_items.order_id) AND (is_super_admin() OR ((current_user_role() = 'distributor'::text) AND (o.company_id = current_company_id())) OR ((current_user_role() = 'warehouse'::text) AND (o.warehouse_id = current_warehouse_id()))))))` | — |

### `inventory`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `inventory_read_by_role` | SELECT | authenticated | PERMISSIVE | `(is_super_admin() OR ((current_user_role() = 'warehouse'::text) AND (warehouse_id = current_warehouse_id())))` | — |
| `inventory_write_admin_warehouse` | ALL | authenticated | PERMISSIVE | `(is_super_admin() OR ((current_user_role() = 'warehouse'::text) AND (warehouse_id = current_warehouse_id())))` | `(is_super_admin() OR ((current_user_role() = 'warehouse'::text) AND (warehouse_id = current_warehouse_id())))` |

### `alerts`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `alerts_read_by_role` | SELECT | authenticated | PERMISSIVE | `(is_super_admin() OR ((current_user_role() = 'warehouse'::text) AND ((warehouse_id = current_warehouse_id()) OR (warehouse_id IS NULL))) OR ((current_user_role() = 'distributor'::text) AND (company_id = current_company_id())))` | — |
| `alerts_write_admin` | ALL | authenticated | PERMISSIVE | `is_super_admin()` | `is_super_admin()` |

### `chatbot_messages`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `chatbot_messages_own_read` | SELECT | authenticated | PERMISSIVE | `((user_id = auth.uid()) OR is_super_admin())` | — |
| `chatbot_messages_own_insert` | INSERT | authenticated | PERMISSIVE | — | `((user_id = auth.uid()) AND (role = current_user_role()))` |
| `chatbot_messages_own_update` | UPDATE | authenticated | PERMISSIVE | `((user_id = auth.uid()) OR is_super_admin())` | `((user_id = auth.uid()) OR is_super_admin())` |

### `customers`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `customers_insert` | INSERT | authenticated | PERMISSIVE | — | `is_super_admin()` |
| `customers_read` | SELECT | authenticated | PERMISSIVE | `true` | — |
| `customers_service_insert` | INSERT | service_role | PERMISSIVE | — | `true` |
| `customers_service_update` | UPDATE | service_role | PERMISSIVE | `true` | — |
| `customers_select` | SELECT | authenticated | PERMISSIVE | `is_super_admin()` | — |
| `customers_update` | UPDATE | authenticated | PERMISSIVE | `is_super_admin()` | `is_super_admin()` |
| `customers_delete` | DELETE | authenticated | PERMISSIVE | `is_super_admin()` | — |

### `order_status_history`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `history_read_by_order_scope` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM orders o   WHERE ((o.id = order_status_history.order_id) AND (is_super_admin() OR ((current_user_role() = 'distributor'::text) AND (o.company_id = current_company_id())) OR ((current_user_role() = 'warehouse'::text) AND (o.warehouse_id = current_warehouse_id()))))))` | — |
| `history_write_admin_warehouse` | ALL | authenticated | PERMISSIVE | `(is_super_admin() OR (current_user_role() = 'warehouse'::text))` | `(is_super_admin() OR (current_user_role() = 'warehouse'::text))` |

### `proforma_invoice_items`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `proforma_invoice_items_insert` | INSERT | authenticated | PERMISSIVE | — | `is_super_admin()` |
| `proforma_invoice_items_select` | SELECT | authenticated | PERMISSIVE | `is_super_admin()` | — |

### `proforma_invoices`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `proforma_invoices_select` | SELECT | authenticated | PERMISSIVE | `is_super_admin()` | — |
| `proforma_invoices_insert` | INSERT | authenticated | PERMISSIVE | — | `is_super_admin()` |
| `proforma_invoices_update` | UPDATE | authenticated | PERMISSIVE | `is_super_admin()` | `is_super_admin()` |

### `user_whatsapp_accounts`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Users can view own WhatsApp accounts` | SELECT | public | PERMISSIVE | `((user_id = auth.uid()) OR (EXISTS ( SELECT 1    FROM users   WHERE ((users.id = auth.uid()) AND (users.role = 'super_admin'::text)))))` | — |
| `Users can insert own WhatsApp account` | INSERT | public | PERMISSIVE | — | `(user_id = auth.uid())` |
| `Users can update own WhatsApp account` | UPDATE | public | PERMISSIVE | `(user_id = auth.uid())` | — |
| `Super admins can manage all WhatsApp accounts` | ALL | public | PERMISSIVE | `(EXISTS ( SELECT 1    FROM users   WHERE ((users.id = auth.uid()) AND (users.role = 'super_admin'::text))))` | — |

