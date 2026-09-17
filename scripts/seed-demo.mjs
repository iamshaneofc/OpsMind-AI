import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_ANON = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getAuthUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

async function ensureAuthUser({ email, password, fullName, role }) {
  const existing = await getAuthUserByEmail(email);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });
  if (error) throw error;
  return data.user;
}

async function upsertRow(table, matchColumn, matchValue, values, selectColumns = "*") {
  const { data: existing, error: fetchErr } = await admin
    .from(table)
    .select(selectColumns)
    .eq(matchColumn, matchValue)
    .limit(1);
  if (fetchErr) throw fetchErr;
  if (existing && existing.length) {
    const { data: updated, error: updateErr } = await admin
      .from(table)
      .update(values)
      .eq(matchColumn, matchValue)
      .select(selectColumns)
      .limit(1);
    if (updateErr) throw updateErr;
    return updated?.[0];
  }
  const { data: inserted, error: insertErr } = await admin
    .from(table)
    .insert(values)
    .select(selectColumns)
    .limit(1);
  if (insertErr) throw insertErr;
  return inserted?.[0];
}

async function seed() {
  const password = process.env.SEED_PASSWORD || "changeme";

  // 1. Create auth users
  console.log("Creating auth users...");
  const adminUser = await ensureAuthUser({
    email: "super.admin@opsmindchemicals.com",
    password,
    fullName: "OpsMind Super Admin",
    role: "super_admin",
  });
  const distributorUser = await ensureAuthUser({
    email: "distributor@opsmindchemicals.com",
    password,
    fullName: "OpsMind Distributor",
    role: "distributor",
  });
  const pradeepUser = await ensureAuthUser({
    email: "pradeep@opsmindchemicals.com",
    password,
    fullName: "Pradeep",
    role: "distributor",
  });
  const rohitUser = await ensureAuthUser({
    email: "rohit@opsmindchemicals.com",
    password,
    fullName: "Rohit",
    role: "distributor",
  });
  const warehouseUser = await ensureAuthUser({
    email: "warehouse@opsmindchemicals.com",
    password,
    fullName: "OpsMind Warehouse Incharge",
    role: "warehouse",
  });
  const warehouseMumbaiUser = await ensureAuthUser({
    email: "warehouse.mumbai@opsmindchemicals.com",
    password,
    fullName: "Mumbai Warehouse Incharge",
    role: "warehouse",
  });
  console.log("  Auth users created.");

  // 2. Upsert companies (schema: id uuid, name text, code text)
  console.log("Creating companies...");
  const companyA = await upsertRow(
    "companies", "name", "North Axis Distributors",
    { name: "North Axis Distributors", code: "NAD" }, "id,name"
  );
  const companyB = await upsertRow(
    "companies", "name", "BluePeak Chemicals Trade",
    { name: "BluePeak Chemicals Trade", code: "BCT" }, "id,name"
  );
  const companyC = await upsertRow(
    "companies", "name", "Pradeep Chemicals",
    { name: "Pradeep Chemicals", code: "PCH" }, "id,name"
  );
  const companyD = await upsertRow(
    "companies", "name", "Rohit Trading Co",
    { name: "Rohit Trading Co", code: "RTC" }, "id,name"
  );
  console.log("  Companies created.");

  // 3. Upsert warehouses (schema: id uuid, name text, location text)
  console.log("Creating warehouses...");
  const delhi = await upsertRow(
    "warehouses", "name", "Delhi Central",
    { name: "Delhi Central", location: "Delhi" }, "id,name"
  );
  const mumbai = await upsertRow(
    "warehouses", "name", "Mumbai West",
    { name: "Mumbai West", location: "Mumbai" }, "id,name"
  );
  const mumbaiCentral = await upsertRow(
    "warehouses", "name", "OpsMind Central Warehouse",
    { name: "OpsMind Central Warehouse", location: "Mumbai" }, "id,name"
  );
  console.log("  Warehouses created.");

  // 4. Upsert products (schema: id uuid, name text, sku text, unit text)
  console.log("Creating products...");
  const p1 = await upsertRow(
    "products", "sku", "OpsMind-SOL-A",
    { name: "OpsMind Solvent A", sku: "OpsMind-SOL-A", unit: "kg" }, "id,name,sku"
  );
  const p2 = await upsertRow(
    "products", "sku", "OpsMind-RES-B",
    { name: "OpsMind Resin B", sku: "OpsMind-RES-B", unit: "kg" }, "id,name,sku"
  );
  const p3 = await upsertRow(
    "products", "sku", "OpsMind-CAT-C",
    { name: "OpsMind Catalyst C", sku: "OpsMind-CAT-C", unit: "kg" }, "id,name,sku"
  );
  console.log("  Products created.");

  const skuById = { "OpsMind-SOL-A": p1.id, "OpsMind-RES-B": p2.id, "OpsMind-CAT-C": p3.id };

  // 5. Upsert app users (schema: id uuid FK to auth.users, email, full_name, role, company_id, warehouse_id)
  console.log("Creating app users...");
  const appAdmin = await upsertRow(
    "users", "email", adminUser.email,
    { id: adminUser.id, email: adminUser.email, full_name: "OpsMind Super Admin", role: "super_admin" },
    "id,email"
  );
  const appDistributor = await upsertRow(
    "users", "email", distributorUser.email,
    { id: distributorUser.id, email: distributorUser.email, full_name: "OpsMind Distributor", role: "distributor", company_id: companyA.id },
    "id,email"
  );
  const appPradeep = await upsertRow(
    "users", "email", pradeepUser.email,
    { id: pradeepUser.id, email: pradeepUser.email, full_name: "Pradeep", role: "distributor", company_id: companyC.id },
    "id,email"
  );
  const appRohit = await upsertRow(
    "users", "email", rohitUser.email,
    { id: rohitUser.id, email: rohitUser.email, full_name: "Rohit", role: "distributor", company_id: companyD.id },
    "id,email"
  );
  const appWarehouse = await upsertRow(
    "users", "email", warehouseUser.email,
    { id: warehouseUser.id, email: warehouseUser.email, full_name: "OpsMind Warehouse Incharge", role: "warehouse", warehouse_id: delhi.id },
    "id,email"
  );
  const appWarehouseMumbai = await upsertRow(
    "users", "email", warehouseMumbaiUser.email,
    { id: warehouseMumbaiUser.id, email: warehouseMumbaiUser.email, full_name: "Mumbai Warehouse Incharge", role: "warehouse", warehouse_id: mumbaiCentral.id },
    "id,email"
  );
  console.log("  App users created.");

  const userIds = {
    admin: appAdmin.id,
    distributor: appDistributor.id,
    pradeep: appPradeep.id,
    rohit: appRohit.id,
    warehouse: appWarehouse.id,
    warehouseMumbai: appWarehouseMumbai.id,
  };

  // 6. Upsert orders (schema: id uuid, order_number, company_id, warehouse_id, status, expected_delivery_date)
  console.log("Creating orders...");
  const orderSeeds = [
    {
      order_number: "OpsMind-1024",
      company_id: companyA.id,
      warehouse_id: delhi.id,
      status: "IN_PREPARATION",
      expected_delivery_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    },
    {
      order_number: "OpsMind-2032",
      company_id: companyB.id,
      warehouse_id: mumbai.id,
      status: "AWAITING_FACTORY",
      expected_delivery_date: new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10),
    },
    {
      order_number: "OpsMind-2034",
      company_id: companyA.id,
      warehouse_id: delhi.id,
      status: "DISPATCH_READY",
      expected_delivery_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    },
    {
      order_number: "OpsMind-3001",
      company_id: companyC.id,
      warehouse_id: mumbaiCentral.id,
      status: "IN_PREPARATION",
      expected_delivery_date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
    },
    {
      order_number: "OpsMind-3002",
      company_id: companyC.id,
      warehouse_id: mumbaiCentral.id,
      status: "DISPATCH_READY",
      expected_delivery_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    },
    {
      order_number: "OpsMind-3003",
      company_id: companyC.id,
      warehouse_id: delhi.id,
      status: "IN_TRANSIT",
      expected_delivery_date: new Date(Date.now() + 1 * 86400000).toISOString().slice(0, 10),
    },
    {
      order_number: "OpsMind-4001",
      company_id: companyD.id,
      warehouse_id: mumbai.id,
      status: "IN_PREPARATION",
      expected_delivery_date: new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10),
    },
    {
      order_number: "OpsMind-4002",
      company_id: companyD.id,
      warehouse_id: mumbaiCentral.id,
      status: "AWAITING_FACTORY",
      expected_delivery_date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
    },
    {
      order_number: "OpsMind-4003",
      company_id: companyD.id,
      warehouse_id: delhi.id,
      status: "DISPATCH_READY",
      expected_delivery_date: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
    },
  ];

  const orderRows = [];
  for (const row of orderSeeds) {
    const saved = await upsertRow("orders", "order_number", row.order_number, row, "id,order_number");
    orderRows.push(saved);
  }
  const orderByNum = Object.fromEntries(orderRows.map((o) => [o.order_number, o.id]));
  console.log("  Orders created.");

  // 7. Upsert order_items (schema: id uuid, order_id, product_id, quantity)
  console.log("Creating order items...");
  const allOrderIds = Object.values(orderByNum);
  await admin.from("order_items").delete().in("order_id", allOrderIds);

  const orderItemsData = [
    { order_id: orderByNum["OpsMind-1024"], product_id: skuById["OpsMind-SOL-A"], quantity: 120 },
    { order_id: orderByNum["OpsMind-2032"], product_id: skuById["OpsMind-RES-B"], quantity: 85 },
    { order_id: orderByNum["OpsMind-2034"], product_id: skuById["OpsMind-CAT-C"], quantity: 60 },
    { order_id: orderByNum["OpsMind-3001"], product_id: skuById["OpsMind-SOL-A"], quantity: 95 },
    { order_id: orderByNum["OpsMind-3002"], product_id: skuById["OpsMind-RES-B"], quantity: 100 },
    { order_id: orderByNum["OpsMind-3003"], product_id: skuById["OpsMind-CAT-C"], quantity: 90 },
    { order_id: orderByNum["OpsMind-4001"], product_id: skuById["OpsMind-SOL-A"], quantity: 110 },
    { order_id: orderByNum["OpsMind-4002"], product_id: skuById["OpsMind-RES-B"], quantity: 107 },
    { order_id: orderByNum["OpsMind-4003"], product_id: skuById["OpsMind-CAT-C"], quantity: 120 },
  ];
  const { error: itemsErr } = await admin.from("order_items").insert(orderItemsData);
  if (itemsErr) throw itemsErr;
  console.log("  Order items created.");

  // 8. Upsert inventory (schema: id uuid, warehouse_id, product_id, available_qty, reorder_level)
  console.log("Creating inventory...");
  await admin.from("inventory").delete().in("warehouse_id", [delhi.id, mumbai.id, mumbaiCentral.id]);
  const { error: inventoryErr } = await admin.from("inventory").insert([
    { warehouse_id: delhi.id, product_id: skuById["OpsMind-SOL-A"], available_qty: 140, reorder_level: 30 },
    { warehouse_id: delhi.id, product_id: skuById["OpsMind-CAT-C"], available_qty: 24, reorder_level: 30 },
    { warehouse_id: mumbai.id, product_id: skuById["OpsMind-RES-B"], available_qty: 18, reorder_level: 30 },
    { warehouse_id: mumbaiCentral.id, product_id: skuById["OpsMind-SOL-A"], available_qty: 200, reorder_level: 30 },
    { warehouse_id: mumbaiCentral.id, product_id: skuById["OpsMind-RES-B"], available_qty: 150, reorder_level: 30 },
    { warehouse_id: mumbaiCentral.id, product_id: skuById["OpsMind-CAT-C"], available_qty: 80, reorder_level: 30 },
  ]);
  if (inventoryErr) throw inventoryErr;
  console.log("  Inventory created.");

  // 9. Create order_status_history (schema: id uuid, order_id, status, notes, created_by)
  console.log("Creating order status history...");
  await admin.from("order_status_history").delete().in("order_id", allOrderIds);
  const { error: historyErr } = await admin.from("order_status_history").insert([
    { order_id: orderByNum["OpsMind-1024"], status: "IN_PREPARATION", notes: "Order received and preparation started", created_by: userIds.warehouse },
    { order_id: orderByNum["OpsMind-2032"], status: "AWAITING_FACTORY", notes: "Waiting for factory allocation", created_by: userIds.admin },
  ]);
  if (historyErr) throw historyErr;
  console.log("  Order status history created.");

  // 10. Create alerts (schema: id uuid, title, severity, status, warehouse_id, company_id)
  console.log("Creating alerts...");
  await admin.from("alerts").delete().in("title", [
    "Low stock: OpsMind Catalyst C",
    "Delayed order: OpsMind-2032",
    "Dispatch ready: OpsMind-2034",
  ]);
  const { error: alertsErr } = await admin.from("alerts").insert([
    { title: "Low stock: OpsMind Catalyst C", severity: "high", status: "open", warehouse_id: delhi.id },
    { title: "Delayed order: OpsMind-2032", severity: "critical", status: "open", company_id: companyB.id },
    { title: "Dispatch ready: OpsMind-2034", severity: "low", status: "open", warehouse_id: delhi.id },
  ]);
  if (alertsErr) throw alertsErr;
  console.log("  Alerts created.");

  // 11. Create chatbot_messages (schema: id uuid, user_id, role, message, response)
  console.log("Creating chatbot messages...");
  await admin.from("chatbot_messages").delete().in("user_id", Object.values(userIds));
  const { error: chatErr } = await admin.from("chatbot_messages").insert([
    {
      user_id: userIds.distributor,
      role: "distributor",
      message: "Where is order OpsMind-1024?",
      response: "Order OpsMind-1024\nStatus: IN_PREPARATION\nWarehouse: Delhi Central\nExpected Delivery: in 7 days",
    },
    {
      user_id: userIds.warehouse,
      role: "warehouse",
      message: "What orders are ready for dispatch today?",
      response: "1 order ready for dispatch: OpsMind-2034 (Delhi Central)",
    },
  ]);
  if (chatErr) throw chatErr;
  console.log("  Chatbot messages created.");

  // 12. Verify all users can authenticate
  console.log("\nVerifying authentication...");
  const authChecks = await Promise.all([
    anon.auth.signInWithPassword({ email: "super.admin@opsmindchemicals.com", password }),
    anon.auth.signInWithPassword({ email: "distributor@opsmindchemicals.com", password }),
    anon.auth.signInWithPassword({ email: "pradeep@opsmindchemicals.com", password }),
    anon.auth.signInWithPassword({ email: "rohit@opsmindchemicals.com", password }),
    anon.auth.signInWithPassword({ email: "warehouse@opsmindchemicals.com", password }),
    anon.auth.signInWithPassword({ email: "warehouse.mumbai@opsmindchemicals.com", password }),
  ]);
  for (const check of authChecks) {
    if (check.error) throw check.error;
  }
  console.log("  All users can authenticate.");

  console.log("\nSeed complete!");
  console.log("Demo users:");
  console.log("Seed complete. Users created with SEED_PASSWORD env var.");
}

seed().catch((error) => {
  console.error("Seed failed:", error.message || error);
  process.exit(1);
});
