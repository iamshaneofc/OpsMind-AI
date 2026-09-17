// =====================================================
// COMPREHENSIVE DEMO DATA SEED SCRIPT
// Seeds both Prisma tables (dashboard) AND SQL tables (auth/RLS)
// Domain: Automobile Parts (India)
// =====================================================

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

// --- Prisma setup ---
const rawUrl = process.env.DATABASE_URL ?? "";
const cleanUrl = rawUrl.replace("?pgbouncer=true", "").replace("&pgbouncer=true", "");
const pool = new Pool({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false }, max: 10 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// --- Supabase setup ---
const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// =====================================================
// DOMAIN DATA: Automobile Parts (India)
// =====================================================

const COMPANIES = [
  { name: "Bharat Auto Parts Distributors", code: "BAP", city: "Mumbai" },
  { name: "Chennai Motor Components Ltd", code: "CMC", city: "Chennai" },
  { name: "Delhi Automotive Traders", code: "DAT", city: "New Delhi" },
  { name: "Kolkata Car Spares Pvt Ltd", code: "KCS", city: "Kolkata" },
  { name: "Pune Precision Parts", code: "PPP", city: "Pune" },
  { name: "Bangalore Brake & Engine Co", code: "BBE", city: "Bangalore" },
];

const WAREHOUSES = [
  { name: "Western Region Hub", location: "Mumbai", capacity: 5000 },
  { name: "Southern Distribution Center", location: "Chennai", capacity: 4000 },
  { name: "Northern Logistics Hub", location: "New Delhi", capacity: 4500 },
  { name: "Eastern Storage Facility", location: "Kolkata", capacity: 3000 },
  { name: "Central Warehouse", location: "Pune", capacity: 3500 },
];

const PRODUCTS = [
  { name: "Front Brake Pad Set", sku: "BAP-FBP-001", category: "Brakes", price: 1500, cost: 900, description: "Ceramic front brake pad set for sedans and SUVs" },
  { name: "Rear Brake Pad Set", sku: "BAP-RBP-002", category: "Brakes", price: 1200, cost: 700, description: "Semi-metallic rear brake pads" },
  { name: "Oil Filter - Petrol", sku: "BAP-OFL-003", category: "Filters", price: 250, cost: 120, description: "Spin-on oil filter for petrol engines" },
  { name: "Oil Filter - Diesel", sku: "BAP-OFD-004", category: "Filters", price: 300, cost: 150, description: "Heavy-duty oil filter for diesel engines" },
  { name: "Air Filter Element", sku: "BAP-AFE-005", category: "Filters", price: 450, cost: 220, description: "High-flow air filter element" },
  { name: "Spark Plug Set (4 pcs)", sku: "BAP-SPK-006", category: "Ignition", price: 600, cost: 300, description: "Iridium spark plug set of 4" },
  { name: "Diesel Injector Nozzle", sku: "BAP-DIN-007", category: "Fuel System", price: 3500, cost: 2100, description: "Common rail diesel injector nozzle" },
  { name: "Clutch Plate Assembly", sku: "BAP-CPA-008", category: "Transmission", price: 4000, cost: 2400, description: "Full clutch plate and disc assembly" },
  { name: "Drive Belt - Alternator", sku: "BAP-DBA-009", category: "Belts", price: 380, cost: 180, description: "V-belt for alternator drive" },
  { name: "Coolant 1L Concentrate", sku: "BAP-CLT-010", category: "Fluids", price: 300, cost: 140, description: "Long-life coolant concentrate 1L" },
  { name: "Brake Fluid DOT4 500ml", sku: "BAP-BFD-011", category: "Fluids", price: 450, cost: 200, description: "DOT4 synthetic brake fluid 500ml" },
  { name: "Engine Oil 5W30 4L", sku: "BAP-EO5-012", category: "Fluids", price: 3200, cost: 1800, description: "Fully synthetic engine oil 5W-30 4 litres" },
  { name: "Transmission Gear Oil 1L", sku: "BAP-TGO-013", category: "Fluids", price: 650, cost: 350, description: "GL-4 transmission gear oil 1L" },
  { name: "Wheel Bearing Set", sku: "BAP-WBS-014", category: "Suspension", price: 2100, cost: 1200, description: "Front wheel bearing and race set" },
  { name: "Shock Absorber Front", sku: "BAP-SAF-015", category: "Suspension", price: 2800, cost: 1600, description: "Gas-charged front shock absorber" },
];

const CUSTOMERS = [
  { full_name: "Mumbai Motors Workshop", short_name: "Mumbai Motors", city: "Mumbai", state_id: 27, contact_person: "Rajesh Sharma" },
  { full_name: "Chennai Auto Care Center", short_name: "Chennai Auto Care", city: "Chennai", state_id: 33, contact_person: "Priya Venkat" },
  { full_name: "Delhi Car Services Pvt Ltd", short_name: "Delhi Car Services", city: "New Delhi", state_id: 7, contact_person: "Amit Singh" },
  { full_name: "Kolkata Garage Hub", short_name: "Kolkata Garage", city: "Kolkata", state_id: 19, contact_person: "Suman Das" },
  { full_name: "Pune Auto Works", short_name: "Pune Auto Works", city: "Pune", state_id: 21, contact_person: "Vikram Patil" },
  { full_name: "Bangalore Car Clinic", short_name: "Bangalore Clinic", city: "Bangalore", state_id: 29, contact_person: "Arjun Reddy" },
  { full_name: "Hyderabad Motor Garage", short_name: "Hyderabad Garage", city: "Hyderabad", state_id: 36, contact_person: "Kiran Kumar" },
  { full_name: "Ahmedabad Auto Solutions", short_name: "Ahmedabad Auto", city: "Ahmedabad", state_id: 24, contact_person: "Nikhil Patel" },
  { full_name: "Jaipur Car Care Center", short_name: "Jaipur Car Care", city: "Jaipur", state_id: 8, contact_person: "Deepak Meena" },
  { full_name: "Lucknow Motor Works", short_name: "Lucknow Motors", city: "Lucknow", state_id: 9, contact_person: "Sanjay Gupta" },
];

const ORDER_STATUSES = [
  "DELIVERED", "DELIVERED", "DELIVERED", "DELIVERED",
  "PROCESSING", "PROCESSING", "PROCESSING",
  "IN_PREPARATION", "IN_PREPARATION", "IN_PREPARATION",
  "AWAITING_FACTORY", "AWAITING_FACTORY",
  "DISPATCH_READY", "DISPATCH_READY",
  "IN_TRANSIT", "IN_TRANSIT",
  "DELAYED",
  "CANCELLED",
];

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

// =====================================================
// AUTH USERS (keep existing 6)
// =====================================================

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
    email, password, email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });
  if (error) throw error;
  return data.user;
}

// =====================================================
// SEED FUNCTION
// =====================================================

async function seed() {
  const password = process.env.SEED_PASSWORD || "changeme";
  console.log("=== OpsMind Demo Data Seed ===\n");

  // --------------------------------------------------
  // 1. AUTH USERS
  // --------------------------------------------------
  console.log("1/11 Creating auth users...");
  const authUsers = {};
  const authDefs = [
    { key: "admin", email: "super.admin@opsmindchemicals.com", fullName: "OpsMind Super Admin", role: "super_admin" },
    { key: "distributor1", email: "distributor@opsmindchemicals.com", fullName: "OpsMind Distributor", role: "distributor" },
    { key: "distributor2", email: "pradeep@opsmindchemicals.com", fullName: "Pradeep", role: "distributor" },
    { key: "distributor3", email: "rohit@opsmindchemicals.com", fullName: "Rohit", role: "distributor" },
    { key: "warehouse1", email: "warehouse@opsmindchemicals.com", fullName: "OpsMind Warehouse Incharge", role: "warehouse" },
    { key: "warehouse2", email: "warehouse.mumbai@opsmindchemicals.com", fullName: "Mumbai Warehouse Incharge", role: "warehouse" },
  ];
  for (const def of authDefs) {
    authUsers[def.key] = await ensureAuthUser({ ...def, password });
  }
  console.log("   Auth users ready.");

  // Clean up in FK order
  console.log("   Cleaning previous data...");
  await prisma.inventoryMovement.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.userRole.deleteMany();

  // --------------------------------------------------
  // 2. WAREHOUSES (Prisma)
  // --------------------------------------------------
  console.log("2/11 Creating warehouses...");
  const warehouses = [];
  for (const w of WAREHOUSES) {
    const created = await prisma.warehouse.create({ data: w });
    warehouses.push(created);
  }
  console.log(`   ${warehouses.length} warehouses created.`);

  // --------------------------------------------------
  // 3. PRODUCTS (Prisma)
  // --------------------------------------------------
  console.log("3/11 Creating products...");
  const products = [];
  for (const p of PRODUCTS) {
    const created = await prisma.product.create({ data: p });
    products.push(created);
  }
  console.log(`   ${products.length} products created.`);

  // --------------------------------------------------
  // 4. CUSTOMERS (Prisma)
  // --------------------------------------------------
  console.log("4/11 Creating customers...");
  const customers = [];
  for (let i = 0; i < CUSTOMERS.length; i++) {
    const c = CUSTOMERS[i];
    const created = await prisma.customer.create({
      data: {
        name: c.full_name,
        email: `${c.short_name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
        phone: `+91-${randomInt(70000, 99999)}-${randomInt(10000, 99999)}`,
        address: `${randomInt(1, 200)}, ${c.city} Industrial Area`,
        location: c.city,
        status: "ACTIVE",
      },
    });
    customers.push(created);
  }
  console.log(`   ${customers.length} customers created.`);

  // --------------------------------------------------
  // 5. USER ROLES (Prisma)
  // --------------------------------------------------
  console.log("5/11 Creating user roles...");
  const roleMap = {
    "super.admin@opsmindchemicals.com": "ADMIN",
    "distributor@opsmindchemicals.com": "MANAGER",
    "pradeep@opsmindchemicals.com": "MANAGER",
    "rohit@opsmindchemicals.com": "MANAGER",
    "warehouse@opsmindchemicals.com": "ANALYST",
    "warehouse.mumbai@opsmindchemicals.com": "ANALYST",
  };
  for (const [email, role] of Object.entries(roleMap)) {
    await prisma.userRole.create({ data: { email, role } });
  }
  console.log(`   ${Object.keys(roleMap).length} user roles created.`);

  // --------------------------------------------------
  // 6. ORDERS + ORDER ITEMS (Prisma) — 10 per customer
  // --------------------------------------------------
  console.log("6/11 Creating orders and order items...");

  let orderCounter = 1;
  const allOrders = [];
  const allOrderItems = [];

  for (const customer of customers) {
    for (let j = 0; j < 10; j++) {
      const status = randomElement(ORDER_STATUSES);
      const warehouse = randomElement(warehouses);
      const dayOffset = randomInt(0, 89);
      const orderDate = daysAgo(dayOffset);
      const expectedDelivery = daysFromNow(randomInt(-30, 30));
      const numItems = randomInt(1, 4);
      const selectedProducts = [];
      while (selectedProducts.length < numItems) {
        const p = randomElement(products);
        if (!selectedProducts.find((sp) => sp.id === p.id)) selectedProducts.push(p);
      }

      let totalAmount = 0;
      const items = [];
      for (const p of selectedProducts) {
        const qty = randomInt(10, 500);
        const unitPrice = p.price;
        const totalPrice = qty * unitPrice;
        totalAmount += totalPrice;
        items.push({ productId: p.id, quantity: qty, unitPrice, totalPrice });
      }

      const orderNum = `ORD-${String(orderCounter).padStart(3, "0")}`;
      const order = await prisma.order.create({
        data: {
          orderNumber: orderNum,
          customerId: customer.id,
          warehouseId: warehouse.id,
          status,
          totalAmount,
          orderDate,
          expectedDelivery,
        },
      });

      for (const item of items) {
        const oi = await prisma.orderItem.create({
          data: { orderId: order.id, ...item },
        });
        allOrderItems.push(oi);
      }

      allOrders.push({ ...order, customerName: customer.name, warehouseName: warehouse.name });
      orderCounter++;
    }
  }
  console.log(`   ${allOrders.length} orders, ${allOrderItems.length} order items created.`);

  // --------------------------------------------------
  // 7. INVOICES (Prisma)
  // --------------------------------------------------
  console.log("7/11 Creating invoices...");
  const invoiceStatuses = ["PAID", "PAID", "PAID", "PAID", "UNPAID", "UNPAID", "OVERDUE"];
  const allInvoices = [];
  let invCounter = 1;

  for (const order of allOrders) {
    const invStatus = randomElement(invoiceStatuses);
    const invNum = `INV-${String(invCounter).padStart(3, "0")}`;
    const dueDate = daysFromNow(invStatus === "OVERDUE" ? randomInt(-30, -1) : randomInt(15, 60));
    const inv = await prisma.invoice.create({
      data: {
        invoiceNumber: invNum,
        orderId: order.id,
        amount: order.totalAmount,
        status: invStatus,
        dueDate,
      },
    });
    allInvoices.push(inv);
    invCounter++;
  }
  console.log(`   ${allInvoices.length} invoices created.`);

  // --------------------------------------------------
  // 8. INVENTORY MOVEMENTS (Prisma)
  // --------------------------------------------------
  console.log("8/11 Creating inventory movements...");
  const movementData = [];
  for (const product of products) {
    for (const warehouse of warehouses) {
      movementData.push({
        productId: product.id, warehouseId: warehouse.id,
        quantity: randomInt(100, 500), type: "RESTOCK",
        createdAt: daysAgo(randomInt(60, 89)),
      });
      const numSales = randomInt(1, 3);
      for (let s = 0; s < numSales; s++) {
        movementData.push({
          productId: product.id, warehouseId: warehouse.id,
          quantity: -randomInt(10, 80), type: "SALE",
          createdAt: daysAgo(randomInt(1, 59)),
        });
      }
    }
  }
  // Batch insert in chunks of 50
  for (let i = 0; i < movementData.length; i += 50) {
    await prisma.inventoryMovement.createMany({ data: movementData.slice(i, i + 50) });
  }
  const movementCount = movementData.length;
  console.log(`   ${movementCount} inventory movements created.`);

  // --------------------------------------------------
  // 9. SQL TABLES: Companies, Warehouses, Products, Users
  // --------------------------------------------------
  console.log("9/11 Syncing SQL tables (companies, warehouses, products, users)...");

  // Companies
  await admin.from("companies").delete().neq("name", "__nonexistent__");
  const sqlCompanies = {};
  for (const c of COMPANIES) {
    const { data } = await admin.from("companies").insert({ name: c.name, code: c.code }).select("id,name").single();
    sqlCompanies[c.name] = data;
  }

  // Warehouses
  await admin.from("warehouses").delete().neq("name", "__nonexistent__");
  const sqlWarehouses = {};
  for (const w of WAREHOUSES) {
    const { data } = await admin.from("warehouses").insert({ name: w.name, location: w.location }).select("id,name").single();
    sqlWarehouses[w.name] = data;
  }

  // Products
  await admin.from("products").delete().neq("name", "__nonexistent__");
  const sqlProducts = {};
  for (const p of PRODUCTS) {
    const { data } = await admin.from("products").insert({
      name: p.name, sku: p.sku, unit: "kg",
      catalogue_number: p.sku, description: p.description,
      catalogue_price: p.price, mrp: Math.round(p.price * 1.3),
    }).select("id,sku").single();
    sqlProducts[p.sku] = data;
  }

  // App users (SQL users table)
  const sqlUsers = {};
  const sqlUserDefs = [
    { key: "admin", email: authUsers.admin.email, full_name: "OpsMind Super Admin", role: "super_admin" },
    { key: "distributor1", email: authUsers.distributor1.email, full_name: "OpsMind Distributor", role: "distributor" },
    { key: "distributor2", email: authUsers.distributor2.email, full_name: "Pradeep", role: "distributor" },
    { key: "distributor3", email: authUsers.distributor3.email, full_name: "Rohit", role: "distributor" },
    { key: "warehouse1", email: authUsers.warehouse1.email, full_name: "OpsMind Warehouse Incharge", role: "warehouse" },
    { key: "warehouse2", email: authUsers.warehouse2.email, full_name: "Mumbai Warehouse Incharge", role: "warehouse" },
  ];
  await admin.from("users").delete().neq("email", "__nonexistent__");
  for (const u of sqlUserDefs) {
    const companyValues = Object.values(sqlCompanies);
    const warehouseValues = Object.values(sqlWarehouses);
    const { data } = await admin.from("users").insert({
      id: authUsers[u.key].id,
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      company_id: u.role === "distributor" ? companyValues[randomInt(0, companyValues.length - 1)].id : null,
      warehouse_id: u.role === "warehouse" ? warehouseValues[randomInt(0, warehouseValues.length - 1)].id : null,
    }).select("id,email").single();
    sqlUsers[u.key] = data;
  }
  console.log("   SQL catalog tables synced.");

  // --------------------------------------------------
  // 10. SQL TABLES: Orders, Order Items, Inventory, Alerts
  // --------------------------------------------------
  console.log("10/11 Syncing SQL orders, inventory, alerts...");

  const companyList = Object.values(sqlCompanies);
  const warehouseList = Object.values(sqlWarehouses);
  const productList = Object.values(sqlProducts);
  const statusMap = {
    "DELIVERED": "DELIVERED",
    "PROCESSING": "IN_PREPARATION",
    "IN_PREPARATION": "IN_PREPARATION",
    "AWAITING_FACTORY": "AWAITING_FACTORY",
    "DISPATCH_READY": "DISPATCH_READY",
    "IN_TRANSIT": "IN_TRANSIT",
    "DELAYED": "AWAITING_FACTORY",
    "CANCELLED": "IN_PREPARATION",
  };

  // SQL orders
  await admin.from("order_items").delete().neq("order_id", "00000000-0000-0000-0000-000000000000");
  await admin.from("orders").delete().neq("order_number", "__nonexistent__");

  let sqlOrderCount = 0;
  for (const order of allOrders) {
    const company = companyList[randomInt(0, companyList.length - 1)];
    const warehouse = warehouseList[randomInt(0, warehouseList.length - 1)];
    const { data: sqlOrder } = await admin.from("orders").insert({
      order_number: order.orderNumber,
      company_id: company.id,
      warehouse_id: warehouse.id,
      status: statusMap[order.status] || order.status,
      expected_delivery_date: order.expectedDelivery?.toISOString().slice(0, 10) || null,
      original_eta: order.expectedDelivery?.toISOString().slice(0, 10) || null,
    }).select("id,order_number").single();

    // SQL order items for this order
    const prismaItems = allOrderItems.filter((oi) => oi.orderId === order.id);
    for (const item of prismaItems) {
      const product = productList[randomInt(0, productList.length - 1)];
      await admin.from("order_items").insert({
        order_id: sqlOrder.id,
        product_id: product.id,
        quantity: item.quantity,
      });
    }
    sqlOrderCount++;
  }
  console.log(`   ${sqlOrderCount} SQL orders created.`);

  // SQL inventory
  await admin.from("inventory").delete().neq("warehouse_id", "00000000-0000-0000-0000-000000000000");
  for (const warehouse of warehouseList) {
    for (const product of productList) {
      const qty = randomInt(5, 500);
      const reorder = randomInt(20, 80);
      await admin.from("inventory").insert({
        warehouse_id: warehouse.id,
        product_id: product.id,
        available_qty: qty,
        reorder_level: reorder,
      });
    }
  }
  console.log("   SQL inventory created.");

  // SQL alerts
  await admin.from("alerts").delete().neq("title", "__nonexistent__");
  const alertData = [
    { title: "Low stock: Front Brake Pad Set at Mumbai", severity: "high", status: "open", warehouse_id: warehouseList[0].id },
    { title: "Delayed order: ORD-015 is 5 days overdue", severity: "critical", status: "open", company_id: companyList[0].id },
    { title: "Dispatch ready: ORD-022 awaiting pickup", severity: "low", status: "open", warehouse_id: warehouseList[1].id },
    { title: "Low stock: Oil Filter below reorder level", severity: "medium", status: "open", warehouse_id: warehouseList[2].id },
    { title: "Critical: 3 orders delayed this week", severity: "critical", status: "open", company_id: companyList[1].id },
    { title: "New order received: ORD-088 from Pune", severity: "low", status: "open", warehouse_id: warehouseList[4].id },
    { title: "Inventory mismatch: Diesel Injector counts differ", severity: "high", status: "open", warehouse_id: warehouseList[0].id },
    { title: "Overdue invoice: INV-012 payment pending 45 days", severity: "medium", status: "open", company_id: companyList[2].id },
    { title: "Warehouse capacity at 85%: Western Region Hub", severity: "medium", status: "open", warehouse_id: warehouseList[0].id },
    { title: "Supplier delay: Clutch Plate Assembly restock delayed", severity: "low", status: "open" },
  ];
  for (const a of alertData) {
    await admin.from("alerts").insert(a);
  }
  console.log("   SQL alerts created.");

  // --------------------------------------------------
  // 11. SQL: Chat messages & order status history
  // --------------------------------------------------
  console.log("11/11 Creating chat messages and status history...");

  await admin.from("chatbot_messages").delete().neq("message", "__nonexistent__");
  await admin.from("chatbot_messages").insert([
    { user_id: sqlUsers.distributor1.id, role: "distributor", message: "Show my pending orders", response: "You have 3 pending orders: ORD-005, ORD-012, ORD-018. Total value: ₹1,45,000" },
    { user_id: sqlUsers.warehouse1.id, role: "warehouse", message: "What is the dispatch queue?", response: "2 orders ready for dispatch today: ORD-022, ORD-035. Both at Northern Logistics Hub." },
  ]);

  await admin.from("order_status_history").delete().neq("order_id", "00000000-0000-0000-0000-000000000000");
  const sampleOrders = allOrders.slice(0, 10);
  for (const o of sampleOrders) {
    await admin.from("order_status_history").insert({
      order_id: (await admin.from("orders").select("id").eq("order_number", o.orderNumber).single()).data?.id,
      status: statusMap[o.status] || o.status,
      notes: "Status updated by system",
      created_by: sqlUsers.warehouse1.id,
    });
  }
  console.log("   Chat messages and status history created.");

  // --------------------------------------------------
  // DONE
  // --------------------------------------------------
  console.log("\n=== Seed Complete ===");
  console.log(`Prisma: ${customers.length} customers, ${allOrders.length} orders, ${allOrderItems.length} items, ${allInvoices.length} invoices, ${movementCount} movements`);
  console.log(`SQL: ${COMPANIES.length} companies, ${WAREHOUSES.length} warehouses, ${PRODUCTS.length} products, ${sqlOrderCount} orders, ${WAREHOUSES.length * PRODUCTS.length} inventory rows, ${alertData.length} alerts`);
  console.log("\nLogin with any of the 6 demo users (password: OpsMind@12345)");
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err.message || err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
