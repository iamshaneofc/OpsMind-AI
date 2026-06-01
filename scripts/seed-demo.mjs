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

async function ensureRow(table, matchColumn, matchValue, values, selectColumns = "*") {
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

async function upsertCatalog() {
  const companyA = await ensureRow(
    "companies",
    "company_name",
    "North Axis Distributors",
    { company_name: "North Axis Distributors", status: "active" },
    "company_id,company_name",
  );
  const companyB = await ensureRow(
    "companies",
    "company_name",
    "BluePeak Chemicals Trade",
    { company_name: "BluePeak Chemicals Trade", status: "active" },
    "company_id,company_name",
  );

  const delhi = await ensureRow(
    "warehouses",
    "warehouse_name",
    "Delhi Central",
    { warehouse_name: "Delhi Central", location: "Delhi" },
    "warehouse_id,warehouse_name",
  );
  const mumbai = await ensureRow(
    "warehouses",
    "warehouse_name",
    "Mumbai West",
    { warehouse_name: "Mumbai West", location: "Mumbai" },
    "warehouse_id,warehouse_name",
  );
  const mumbaiCentral = await ensureRow(
    "warehouses",
    "warehouse_name",
    "SRL Central Warehouse",
    { warehouse_name: "SRL Central Warehouse", location: "Mumbai" },
    "warehouse_id,warehouse_name",
  );

  const p1 = await ensureRow(
    "products",
    "sku",
    "SRL-SOL-A",
    { product_name: "SRL Solvent A", sku: "SRL-SOL-A", unit: "kg", price: 120 },
    "product_id,product_name,sku",
  );
  const p2 = await ensureRow(
    "products",
    "sku",
    "SRL-RES-B",
    { product_name: "SRL Resin B", sku: "SRL-RES-B", unit: "kg", price: 95 },
    "product_id,product_name,sku",
  );
  const p3 = await ensureRow(
    "products",
    "sku",
    "SRL-CAT-C",
    { product_name: "SRL Catalyst C", sku: "SRL-CAT-C", unit: "kg", price: 140 },
    "product_id,product_name,sku",
  );

  return {
    companies: [companyA, companyB],
    warehouses: [delhi, mumbai, mumbaiCentral],
    products: [p1, p2, p3],
  };
}

async function seed() {
  const password = "Srl@12345";
  const adminUser = await ensureAuthUser({
    email: "super.admin@srlchemicals.com",
    password,
    fullName: "SRL Super Admin",
    role: "super_admin",
  });
  const distributorUser = await ensureAuthUser({
    email: "distributor@srlchemicals.com",
    password,
    fullName: "SRL Distributor",
    role: "distributor",
  });
  const pradeepUser = await ensureAuthUser({
    email: "pradeep@srlchemicals.com",
    password,
    fullName: "Pradeep",
    role: "distributor",
  });
  const rohitUser = await ensureAuthUser({
    email: "rohit@srlchemicals.com",
    password,
    fullName: "Rohit",
    role: "distributor",
  });
  const warehouseUser = await ensureAuthUser({
    email: "warehouse@srlchemicals.com",
    password,
    fullName: "SRL Warehouse Incharge",
    role: "warehouse",
  });
  const warehouseMumbaiUser = await ensureAuthUser({
    email: "warehouse.mumbai@srlchemicals.com",
    password,
    fullName: "Mumbai Warehouse Incharge",
    role: "warehouse",
  });

  const companyC = await ensureRow(
    "companies",
    "company_name",
    "Pradeep Chemicals",
    { company_name: "Pradeep Chemicals", status: "active" },
    "company_id,company_name",
  );
  const companyD = await ensureRow(
    "companies",
    "company_name",
    "Rohit Trading Co",
    { company_name: "Rohit Trading Co", status: "active" },
    "company_id,company_name",
  );

  const { companies, warehouses, products } = await upsertCatalog();
  const companyA = companies.find((c) => c.company_name === "North Axis Distributors");
  const companyB = companies.find((c) => c.company_name === "BluePeak Chemicals Trade");
  const delhi = warehouses.find((w) => w.warehouse_name === "Delhi Central");
  const mumbai = warehouses.find((w) => w.warehouse_name === "Mumbai West");
  const mumbaiCentral = warehouses.find((w) => w.warehouse_name === "SRL Central Warehouse");
  if (!companyA || !companyB || !delhi || !mumbai || !mumbaiCentral) {
    throw new Error("Required companies/warehouses missing after upsert.");
  }

  const appAdmin = await ensureRow(
    "users",
    "email",
    adminUser.email,
    {
      email: adminUser.email,
      name: "SRL Super Admin",
      password_hash: "managed-by-supabase-auth",
      role_id: 1,
      is_active: true,
    },
    "user_id,email",
  );
  const appDistributor = await ensureRow(
    "users",
    "email",
    distributorUser.email,
    {
      email: distributorUser.email,
      name: "SRL Distributor",
      password_hash: "managed-by-supabase-auth",
      role_id: 2,
      company_id: companyA.company_id,
      is_active: true,
    },
    "user_id,email",
  );
  const appPradeep = await ensureRow(
    "users",
    "email",
    pradeepUser.email,
    {
      email: pradeepUser.email,
      name: "Pradeep",
      password_hash: "managed-by-supabase-auth",
      role_id: 2,
      company_id: companyC.company_id,
      is_active: true,
    },
    "user_id,email",
  );
  const appRohit = await ensureRow(
    "users",
    "email",
    rohitUser.email,
    {
      email: rohitUser.email,
      name: "Rohit",
      password_hash: "managed-by-supabase-auth",
      role_id: 2,
      company_id: companyD.company_id,
      is_active: true,
    },
    "user_id,email",
  );
  const appWarehouse = await ensureRow(
    "users",
    "email",
    warehouseUser.email,
    {
      email: warehouseUser.email,
      name: "SRL Warehouse Incharge",
      password_hash: "managed-by-supabase-auth",
      role_id: 3,
      warehouse_id: delhi.warehouse_id,
      is_active: true,
    },
    "user_id,email",
  );
  const appWarehouseMumbai = await ensureRow(
    "users",
    "email",
    warehouseMumbaiUser.email,
    {
      email: warehouseMumbaiUser.email,
      name: "Mumbai Warehouse Incharge",
      password_hash: "managed-by-supabase-auth",
      role_id: 3,
      warehouse_id: mumbaiCentral.warehouse_id,
      is_active: true,
    },
    "user_id,email",
  );
  const appUserByEmail = Object.fromEntries(
    [appAdmin, appDistributor, appPradeep, appRohit, appWarehouse, appWarehouseMumbai].map((u) => [
      u.email,
      u.user_id,
    ]),
  );
  const adminAppUserId = appUserByEmail[adminUser.email];
  const distributorAppUserId = appUserByEmail[distributorUser.email];
  const pradeepAppUserId = appUserByEmail[pradeepUser.email];
  const rohitAppUserId = appUserByEmail[rohitUser.email];
  const warehouseAppUserId = appUserByEmail[warehouseUser.email];
  const warehouseMumbaiAppUserId = appUserByEmail[warehouseMumbaiUser.email];
  if (
    !adminAppUserId ||
    !distributorAppUserId ||
    !pradeepAppUserId ||
    !rohitAppUserId ||
    !warehouseAppUserId ||
    !warehouseMumbaiAppUserId
  ) {
    throw new Error("Could not map seeded app users.");
  }

  const orderSeed = [
    {
      order_number: "SRL-1024",
      company_id: companyA.company_id,
      created_by: distributorAppUserId,
      order_value: 14400,
      delivery_location: "Gurgaon",
      warehouse_id: delhi.warehouse_id,
      status: "IN_PREPARATION",
      order_date: new Date().toISOString().slice(0, 10),
      expected_delivery_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    },
    {
      order_number: "SRL-2032",
      company_id: companyB.company_id,
      created_by: adminAppUserId,
      order_value: 8075,
      delivery_location: "Pune",
      warehouse_id: mumbai.warehouse_id,
      status: "AWAITING_FACTORY",
      order_date: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10),
      expected_delivery_date: new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10),
    },
    {
      order_number: "SRL-2034",
      company_id: companyA.company_id,
      created_by: warehouseAppUserId,
      order_value: 8400,
      delivery_location: "Noida",
      warehouse_id: delhi.warehouse_id,
      status: "DISPATCH_READY",
      order_date: new Date().toISOString().slice(0, 10),
      expected_delivery_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    },
    {
      order_number: "SRL-3001",
      company_id: companyC.company_id,
      created_by: pradeepAppUserId,
      order_value: 11400,
      delivery_location: "Bangalore",
      warehouse_id: mumbaiCentral.warehouse_id,
      status: "IN_PREPARATION",
      order_date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
      expected_delivery_date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
    },
    {
      order_number: "SRL-3002",
      company_id: companyC.company_id,
      created_by: pradeepAppUserId,
      order_value: 9500,
      delivery_location: "Hyderabad",
      warehouse_id: mumbaiCentral.warehouse_id,
      status: "DISPATCH_READY",
      order_date: new Date().toISOString().slice(0, 10),
      expected_delivery_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    },
    {
      order_number: "SRL-3003",
      company_id: companyC.company_id,
      created_by: pradeepAppUserId,
      order_value: 12600,
      delivery_location: "Chennai",
      warehouse_id: delhi.warehouse_id,
      status: "IN_TRANSIT",
      order_date: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10),
      expected_delivery_date: new Date(Date.now() + 1 * 86400000).toISOString().slice(0, 10),
    },
    {
      order_number: "SRL-4001",
      company_id: companyD.company_id,
      created_by: rohitAppUserId,
      order_value: 13300,
      delivery_location: "Kolkata",
      warehouse_id: mumbai.warehouse_id,
      status: "IN_PREPARATION",
      order_date: new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10),
      expected_delivery_date: new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10),
    },
    {
      order_number: "SRL-4002",
      company_id: companyD.company_id,
      created_by: rohitAppUserId,
      order_value: 10200,
      delivery_location: "Ahmedabad",
      warehouse_id: mumbaiCentral.warehouse_id,
      status: "AWAITING_FACTORY",
      order_date: new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10),
      expected_delivery_date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
    },
    {
      order_number: "SRL-4003",
      company_id: companyD.company_id,
      created_by: rohitAppUserId,
      order_value: 16800,
      delivery_location: "Jaipur",
      warehouse_id: delhi.warehouse_id,
      status: "DISPATCH_READY",
      order_date: new Date().toISOString().slice(0, 10),
      expected_delivery_date: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
    },
  ];

  const orderRows = [];
  for (const row of orderSeed) {
    const saved = await ensureRow("orders", "order_number", row.order_number, row, "order_id,order_number");
    orderRows.push(saved);
  }
  const orders = orderRows;

  const skuById = Object.fromEntries(products.map((p) => [p.sku, p.product_id]));
  const orderByNum = Object.fromEntries(orders.map((o) => [o.order_number, o.order_id]));
  const allOrderIds = Object.values(orderByNum);
  await admin.from("order_items").delete().in("order_id", allOrderIds);
  const { error: itemsErr } = await admin.from("order_items").insert([
    {
      order_id: orderByNum["SRL-1024"],
      product_id: skuById["SRL-SOL-A"],
      quantity: 120,
      unit_price: 120,
    },
    {
      order_id: orderByNum["SRL-2032"],
      product_id: skuById["SRL-RES-B"],
      quantity: 85,
      unit_price: 95,
    },
    {
      order_id: orderByNum["SRL-2034"],
      product_id: skuById["SRL-CAT-C"],
      quantity: 60,
      unit_price: 140,
    },
    {
      order_id: orderByNum["SRL-3001"],
      product_id: skuById["SRL-SOL-A"],
      quantity: 95,
      unit_price: 120,
    },
    {
      order_id: orderByNum["SRL-3002"],
      product_id: skuById["SRL-RES-B"],
      quantity: 100,
      unit_price: 95,
    },
    {
      order_id: orderByNum["SRL-3003"],
      product_id: skuById["SRL-CAT-C"],
      quantity: 90,
      unit_price: 140,
    },
    {
      order_id: orderByNum["SRL-4001"],
      product_id: skuById["SRL-SOL-A"],
      quantity: 110,
      unit_price: 120,
    },
    {
      order_id: orderByNum["SRL-4002"],
      product_id: skuById["SRL-RES-B"],
      quantity: 107,
      unit_price: 95,
    },
    {
      order_id: orderByNum["SRL-4003"],
      product_id: skuById["SRL-CAT-C"],
      quantity: 120,
      unit_price: 140,
    },
  ]);
  if (itemsErr) throw itemsErr;

  await admin
    .from("inventory")
    .delete()
    .in("warehouse_id", [delhi.warehouse_id, mumbai.warehouse_id, mumbaiCentral.warehouse_id]);
  const { error: inventoryErr } = await admin.from("inventory").insert([
    {
      warehouse_id: delhi.warehouse_id,
      product_id: skuById["SRL-SOL-A"],
      available_quantity: 140,
    },
    {
      warehouse_id: delhi.warehouse_id,
      product_id: skuById["SRL-CAT-C"],
      available_quantity: 24,
    },
    {
      warehouse_id: mumbai.warehouse_id,
      product_id: skuById["SRL-RES-B"],
      available_quantity: 18,
    },
    {
      warehouse_id: mumbaiCentral.warehouse_id,
      product_id: skuById["SRL-SOL-A"],
      available_quantity: 200,
    },
    {
      warehouse_id: mumbaiCentral.warehouse_id,
      product_id: skuById["SRL-RES-B"],
      available_quantity: 150,
    },
    {
      warehouse_id: mumbaiCentral.warehouse_id,
      product_id: skuById["SRL-CAT-C"],
      available_quantity: 80,
    },
  ]);
  if (inventoryErr) throw inventoryErr;

  await admin.from("order_status_history").delete().in("order_id", allOrderIds);

  const { error: historyErr } = await admin.from("order_status_history").insert([
    {
      order_id: orderByNum["SRL-1024"],
      previous_status: "PENDING",
      new_status: "IN_PREPARATION",
      updated_by: warehouseAppUserId,
      updated_at: new Date().toISOString(),
    },
    {
      order_id: orderByNum["SRL-2032"],
      previous_status: "IN_PREPARATION",
      new_status: "AWAITING_FACTORY",
      updated_by: adminAppUserId,
      updated_at: new Date().toISOString(),
    },
  ]);
  if (historyErr) throw historyErr;

  await admin
    .from("alerts")
    .delete()
    .in("message", ["Low stock: SRL Catalyst C", "Delayed order: SRL-2032", "Dispatch ready: SRL-2034"]);

  const { error: alertsErr } = await admin.from("alerts").insert([
    {
      alert_type: "warning",
      message: "Low stock: SRL Catalyst C",
      user_id: warehouseAppUserId,
      is_read: false,
      order_id: orderByNum["SRL-2034"],
    },
    {
      alert_type: "critical",
      message: "Delayed order: SRL-2032",
      user_id: adminAppUserId,
      is_read: false,
      order_id: orderByNum["SRL-2032"],
    },
    {
      alert_type: "info",
      message: "Dispatch ready: SRL-2034",
      user_id: warehouseAppUserId,
      is_read: false,
      order_id: orderByNum["SRL-2034"],
    },
  ]);
  if (alertsErr) throw alertsErr;

  await admin
    .from("chatbot_messages")
    .delete()
    .in("user_id", [
      adminAppUserId,
      distributorAppUserId,
      pradeepAppUserId,
      rohitAppUserId,
      warehouseAppUserId,
      warehouseMumbaiAppUserId,
    ]);

  const { data: existingSessions } = await admin
    .from("chatbot_sessions")
    .select("session_id,user_id")
    .in("user_id", [
      distributorAppUserId,
      pradeepAppUserId,
      rohitAppUserId,
      warehouseAppUserId,
      warehouseMumbaiAppUserId,
    ]);
  const sessionMap = new Map((existingSessions ?? []).map((s) => [s.user_id, s.session_id]));
  for (const uid of [
    distributorAppUserId,
    pradeepAppUserId,
    rohitAppUserId,
    warehouseAppUserId,
    warehouseMumbaiAppUserId,
  ]) {
    if (sessionMap.has(uid)) continue;
    const { data: insertedSession, error: sessionErr } = await admin
      .from("chatbot_sessions")
      .insert({ user_id: uid })
      .select("session_id,user_id")
      .single();
    if (sessionErr) throw sessionErr;
    sessionMap.set(uid, insertedSession.session_id);
  }

  const { error: chatErr } = await admin.from("chatbot_messages").insert([
    {
      session_id: sessionMap.get(distributorAppUserId),
      sender: "assistant",
      user_id: distributorAppUserId,
      role: "distributor",
      message: "Where is order SRL-1024?",
      response:
        "Order SRL-1024\nStatus: IN_PREPARATION\nWarehouse: Delhi Central\nExpected Delivery: in 7 days",
    },
    {
      session_id: sessionMap.get(warehouseAppUserId),
      sender: "assistant",
      user_id: warehouseAppUserId,
      role: "warehouse",
      message: "What orders are ready for dispatch today?",
      response: "1 order ready for dispatch: SRL-2034 (Delhi Central)",
    },
  ]);
  if (chatErr) throw chatErr;

  const authChecks = await Promise.all([
    anon.auth.signInWithPassword({
      email: "super.admin@srlchemicals.com",
      password,
    }),
    anon.auth.signInWithPassword({
      email: "distributor@srlchemicals.com",
      password,
    }),
    anon.auth.signInWithPassword({
      email: "pradeep@srlchemicals.com",
      password,
    }),
    anon.auth.signInWithPassword({
      email: "rohit@srlchemicals.com",
      password,
    }),
    anon.auth.signInWithPassword({
      email: "warehouse@srlchemicals.com",
      password,
    }),
    anon.auth.signInWithPassword({
      email: "warehouse.mumbai@srlchemicals.com",
      password,
    }),
  ]);
  for (const check of authChecks) {
    if (check.error) throw check.error;
  }

  console.log("Seed complete.");
  console.log("Demo users:");
  console.log("- super.admin@srlchemicals.com / Srl@12345 (Super Admin)");
  console.log("- distributor@srlchemicals.com / Srl@12345 (Distributor - North Axis)");
  console.log("- pradeep@srlchemicals.com / Srl@12345 (Distributor - Pradeep Chemicals)");
  console.log("- rohit@srlchemicals.com / Srl@12345 (Distributor - Rohit Trading)");
  console.log("- warehouse@srlchemicals.com / Srl@12345 (Warehouse - Delhi Central)");
  console.log("- warehouse.mumbai@srlchemicals.com / Srl@12345 (Warehouse - Mumbai Central)");
}

seed().catch((error) => {
  console.error("Seed failed:", error.message || error);
  process.exit(1);
});
