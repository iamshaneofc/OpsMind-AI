/**
 * Seeds four huge industry demo packs into the Prisma schema:
 * chemical (hero), automobile, pharma, agriculture.
 *
 * Usage: node scripts/seed-industry-packs.mjs
 * Requires DATABASE_URL in .env
 */
import "dotenv/config";
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;

function buildPool() {
  const rawUrl = process.env.DATABASE_URL ?? "";
  const cleanUrl = rawUrl.replace("?pgbouncer=true", "").replace("&pgbouncer=true", "");
  const isSupabase = cleanUrl.includes("supabase.com");
  return new Pool({
    connectionString: cleanUrl,
    ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });
}

const pool = buildPool();
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const STATUSES = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "DELAYED", "CANCELLED"];
const STATUS_WEIGHTS = [12, 18, 15, 40, 10, 5]; // sum 100

function weightedStatus(rng) {
  const n = rng() * 100;
  let acc = 0;
  for (let i = 0; i < STATUSES.length; i++) {
    acc += STATUS_WEIGHTS[i];
    if (n < acc) return STATUSES[i];
  }
  return "DELIVERED";
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function daysAgo(rng, maxDays) {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(rng() * maxDays));
  d.setHours(Math.floor(rng() * 24), Math.floor(rng() * 60), 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

const PACKS = {
  chemical: {
    seed: 42,
    prefix: "CHEM",
    productCount: 140,
    customerCount: 55,
    warehouseCount: 5,
    orderCount: 1000,
    products: [
      ["Sodium Hydroxide 50%", "Caustic", 48, 32, "CAS 1310-73-2 · 200kg drum"],
      ["Isopropyl Alcohol 99%", "Solvents", 95, 62, "CAS 67-63-0 · 160kg drum"],
      ["Hydrochloric Acid 37%", "Acids", 28, 18, "CAS 7647-01-0 · 250kg IBC"],
      ["Sulphuric Acid 98%", "Acids", 36, 22, "CAS 7664-93-9 · 300kg IBC"],
      ["Acetone Industrial", "Solvents", 72, 48, "CAS 67-64-1 · 160kg drum"],
      ["Toluene Pure", "Solvents", 68, 45, "CAS 108-88-3 · 180kg drum"],
      ["Methanol AR", "Solvents", 42, 28, "CAS 67-56-1 · 160kg drum"],
      ["Ethyl Acetate", "Solvents", 78, 52, "CAS 141-78-6 · 180kg drum"],
      ["Caustic Soda Flakes", "Caustic", 55, 36, "CAS 1310-73-2 · 25kg bag"],
      ["Hydrogen Peroxide 50%", "Oxidisers", 88, 58, "CAS 7722-84-1 · 30kg jerry"],
      ["Citric Acid Anhydrous", "Organics", 120, 80, "CAS 77-92-9 · 25kg bag"],
      ["Glycerine USP", "Organics", 110, 74, "CAS 56-81-5 · 250kg drum"],
      ["Methylene Dichloride", "Solvents", 64, 42, "CAS 75-09-2 · 250kg drum"],
      ["Xylene Mixed", "Solvents", 70, 46, "CAS 1330-20-7 · 180kg drum"],
      ["Phosphoric Acid 85%", "Acids", 52, 34, "CAS 7664-38-2 · 35kg jerry"],
      ["Formaldehyde 37%", "Intermediates", 40, 26, "CAS 50-00-0 · 200kg drum"],
      ["Ammonia Solution 25%", "Alkalis", 34, 22, "CAS 1336-21-6 · 200kg drum"],
      ["Sodium Carbonate Dense", "Alkalis", 26, 16, "CAS 497-19-8 · 50kg bag"],
      ["Potassium Hydroxide", "Caustic", 92, 60, "CAS 1310-58-3 · 25kg bag"],
      ["Nitric Acid 68%", "Acids", 58, 38, "CAS 7697-37-2 · 35kg jerry"],
    ],
    customers: [
      ["Bharat Fine Chemicals", "Mumbai"],
      ["Gujarat Solvents Pvt Ltd", "Ahmedabad"],
      ["Eastern Specialty Chem", "Kolkata"],
      ["Deccan Process Aids", "Hyderabad"],
      ["Northern Alkali Traders", "Delhi"],
      ["Coastal Industrial Chem", "Chennai"],
      ["Pune Polymer Inputs", "Pune"],
      ["Rajasthan Dye Intermediates", "Jaipur"],
      ["Kerala Agro Chem", "Kochi"],
      ["Indore Specialty Oils", "Indore"],
      ["Vizag Port Chemicals", "Visakhapatnam"],
      ["Ludhiana Textile Chem", "Ludhiana"],
      ["Nagpur Bulk Solvents", "Nagpur"],
      ["Surat Colorants Hub", "Surat"],
      ["Bhopal Water Treatment", "Bhopal"],
    ],
    warehouses: [
      ["Mumbai Hub", "Mumbai, MH", 80000],
      ["Pune Central Warehouse", "Pune, MH", 65000],
      ["Ahmedabad West Hub", "Ahmedabad, GJ", 70000],
      ["Chennai South Hub", "Chennai, TN", 55000],
      ["Delhi NCR Hub", "Gurugram, HR", 60000],
    ],
  },
  automobile: {
    seed: 77,
    prefix: "AUTO",
    productCount: 150,
    customerCount: 50,
    warehouseCount: 4,
    orderCount: 900,
    products: [
      ["Front Brake Pad Set", "Brakes", 1850, 1200, "OEM fitment · passenger"],
      ["Oil Filter 5W Compatible", "Filters", 420, 260, "Spin-on cartridge"],
      ["Alternator 12V 90A", "Electrical", 7800, 5200, "Reman-ready"],
      ["Clutch Plate Assembly", "Transmission", 4200, 2800, "Light CV"],
      ["Radiator Coolant 5L", "Fluids", 680, 420, "Ready-mix"],
      ["Spark Plug Iridium", "Ignition", 340, 210, "Long life"],
      ["Air Filter Panel", "Filters", 520, 310, "Cabin/engine"],
      ["Shock Absorber Front", "Suspension", 3100, 2050, "Gas charged"],
      ["Wiper Blade 22in", "Body", 280, 160, "Beam style"],
      ["Battery 35Ah", "Electrical", 5600, 3900, "MF"],
      ["Timing Belt Kit", "Engine", 4800, 3200, "With tensioner"],
      ["Fuel Pump Module", "Fuel", 6200, 4100, "In-tank"],
      ["CV Joint Outer", "Drivetrain", 2900, 1900, "ABS ring"],
      ["Headlamp Assembly LH", "Lighting", 5400, 3600, "Halogen"],
      ["AC Compressor", "HVAC", 9800, 6700, "R134a"],
      ["Brake Disc Pair", "Brakes", 3600, 2400, "Vented"],
      ["Power Steering Fluid", "Fluids", 390, 240, "1L ATF"],
      ["Cabin Filter Carbon", "Filters", 610, 380, "Anti-odour"],
      ["Starter Motor 12V", "Electrical", 7200, 4800, "Gear reduction"],
      ["Wheel Bearing Hub", "Drivetrain", 4100, 2700, "ABS"],
    ],
    customers: [
      ["Bharat Auto Parts Distributors", "Mumbai"],
      ["Chennai Motor Components", "Chennai"],
      ["Delhi Automotive Traders", "Delhi"],
      ["Pune Fleet Spares", "Pune"],
      ["Jaipur Highway Motors", "Jaipur"],
      ["Kochi Coastal Auto", "Kochi"],
      ["Hyderabad Drive Line", "Hyderabad"],
      ["Ahmedabad Garage Hub", "Ahmedabad"],
      ["Kolkata Metro Spares", "Kolkata"],
      ["Indore Central Motors", "Indore"],
      ["Nagpur Truck Parts", "Nagpur"],
      ["Surat City Auto", "Surat"],
      ["Ludhiana Tractor Spares", "Ludhiana"],
      ["Vizag Port Motors", "Visakhapatnam"],
      ["Bhopal Roadside Parts", "Bhopal"],
    ],
    warehouses: [
      ["Western Region Hub", "Mumbai, MH", 50000],
      ["Central Warehouse Pune", "Pune, MH", 45000],
      ["South Auto Hub", "Chennai, TN", 40000],
      ["North Auto Hub", "Delhi NCR", 42000],
    ],
  },
  pharma: {
    seed: 91,
    prefix: "PHAR",
    productCount: 110,
    customerCount: 42,
    warehouseCount: 4,
    orderCount: 850,
    products: [
      ["Amoxicillin 500mg Caps", "Antibiotics", 420, 260, "Demo pack · 10x10"],
      ["Paracetamol 650mg Tab", "Analgesics", 180, 95, "Demo pack · 15x10"],
      ["Metformin 500mg Tab", "Metabolic", 210, 120, "Demo pack · 10x10"],
      ["Omeprazole 20mg Cap", "GI", 260, 150, "Demo pack · 10x10"],
      ["Cetirizine 10mg Tab", "Allergy", 140, 80, "Demo pack · 10x10"],
      ["Azithromycin 500mg Tab", "Antibiotics", 480, 300, "Demo pack · 3x10"],
      ["Ibuprofen 400mg Tab", "Analgesics", 160, 90, "Demo pack · 10x10"],
      ["ORS Sachet Box", "Hydration", 320, 190, "20 sachets"],
      ["Vitamin D3 Drops", "Supplements", 290, 170, "15ml"],
      ["Insulin NPH Demo Vial", "Cold-chain", 890, 560, "Demo label only"],
      ["Salbutamol Inhaler", "Respiratory", 310, 190, "200 md"],
      ["Cough Syrup 100ml", "Respiratory", 150, 85, "Demo"],
      ["Antacid Suspension", "GI", 120, 70, "200ml"],
      ["Calcium + D3 Tab", "Supplements", 200, 110, "30 tabs"],
      ["Diclofenac Gel 30g", "Topicals", 110, 65, "Tube"],
      ["Povidone Iodine 100ml", "Antiseptic", 95, 55, "Solution"],
      ["Surgical Gloves Box", "Consumables", 480, 300, "100 pcs"],
      ["Syringe 5ml Box", "Consumables", 360, 220, "100 pcs"],
      ["Face Mask Box", "Consumables", 280, 160, "50 pcs"],
      ["Hand Sanitizer 5L", "Hygiene", 520, 340, "Jerry can"],
    ],
    customers: [
      ["City Care Hospitals", "Mumbai"],
      ["MediLink Distributors", "Pune"],
      ["Arogya Pharmacy Chain", "Ahmedabad"],
      ["South Health Network", "Chennai"],
      ["Capital Pharma Hub", "Delhi"],
      ["Eastern Care Supplies", "Kolkata"],
      ["Deccan Hospital Group", "Hyderabad"],
      ["Coastal Clinics Co-op", "Kochi"],
      ["Indore Medi Mart", "Indore"],
      ["Jaipur Wellness Dist", "Jaipur"],
      ["Nagpur Care Link", "Nagpur"],
      ["Surat Pharma Traders", "Surat"],
      ["Ludhiana Chemist Hub", "Ludhiana"],
      ["Vizag Port Pharma", "Visakhapatnam"],
      ["Bhopal District Stores", "Bhopal"],
    ],
    warehouses: [
      ["Mumbai Pharma Hub", "Mumbai, MH", 35000],
      ["Pune Cold Store", "Pune, MH", 28000],
      ["Chennai Pharma Hub", "Chennai, TN", 30000],
      ["Delhi Pharma Hub", "Delhi NCR", 32000],
    ],
  },
  agriculture: {
    seed: 55,
    prefix: "AGRI",
    productCount: 120,
    customerCount: 45,
    warehouseCount: 4,
    orderCount: 880,
    products: [
      ["Urea 46% Bag 50kg", "Fertilizer", 1450, 1100, "Neem coated"],
      ["NPK 19-19-19 Bag", "Fertilizer", 1680, 1250, "Water soluble"],
      ["DAP Bag 50kg", "Fertilizer", 1720, 1300, "Granular"],
      ["MOP Potash Bag", "Fertilizer", 1380, 1050, "50kg"],
      ["Wheat Seed Certified", "Seeds", 2400, 1800, "Demo lot"],
      ["Hybrid Maize Seed", "Seeds", 3200, 2400, "Demo lot"],
      ["Paddy Seed Pack", "Seeds", 2100, 1550, "Demo lot"],
      ["Herbicide Glyphosate 1L", "CropCare", 480, 320, "SL"],
      ["Insecticide Emamectin", "CropCare", 620, 410, "5% SG"],
      ["Fungicide Mancozeb", "CropCare", 390, 250, "75% WP"],
      ["Micronutrient Mix", "Nutrition", 560, 360, "1kg"],
      ["Bio Fertilizer Liquid", "Bio", 720, 480, "5L"],
      ["Drip Emitter Pack", "Irrigation", 890, 580, "100 pcs"],
      ["Sprayer Pump 16L", "Equipment", 2100, 1450, "Knapsack"],
      ["Mulch Film Roll", "Field", 1850, 1200, "1m x 400m"],
      ["Shade Net 50%", "Field", 2400, 1600, "3m roll"],
      ["Organic Compost Bag", "Soil", 420, 260, "25kg"],
      ["Gypsum Soil Conditioner", "Soil", 380, 240, "50kg"],
      ["Zinc Sulphate Bag", "Nutrition", 510, 330, "25kg"],
      ["Neem Cake Organic", "Bio", 460, 290, "25kg"],
    ],
    customers: [
      ["Punjab Krishi Co-op", "Ludhiana"],
      ["Deccan Agri Dealers", "Hyderabad"],
      ["GreenField Inputs Ltd", "Pune"],
      ["Gujarat Farm Hub", "Ahmedabad"],
      ["Kaveri Agro Traders", "Chennai"],
      ["Ganga Basin Co-op", "Lucknow"],
      ["Malwa Seed Mart", "Indore"],
      ["Konkan Agri Link", "Mumbai"],
      ["Eastern Growers Dist", "Kolkata"],
      ["Rajasthan Desert Inputs", "Jaipur"],
      ["Kerala Spice Growers", "Kochi"],
      ["Vidarbha Cotton Co-op", "Nagpur"],
      ["Saurashtra Dealers", "Surat"],
      ["Coastal Paddy Union", "Visakhapatnam"],
      ["Central Plains Mart", "Bhopal"],
    ],
    warehouses: [
      ["Punjab Agri Hub", "Ludhiana, PB", 70000],
      ["Pune Agri Hub", "Pune, MH", 55000],
      ["Hyderabad Agri Hub", "Hyderabad, TS", 50000],
      ["Indore Agri Hub", "Indore, MP", 48000],
    ],
  },
};

function expandProducts(base, count, prefix, rng) {
  const out = [];
  let i = 0;
  while (out.length < count) {
    const [name, cat, price, cost, desc] = base[i % base.length];
    const variant = Math.floor(i / base.length);
    const sku = `${prefix}-${cat.slice(0, 4).toUpperCase()}-${String(out.length + 1).padStart(3, "0")}`;
    const fullName = variant === 0 ? name : `${name} · Grade ${variant + 1}`;
    out.push({
      sku,
      name: fullName,
      category: cat,
      price: Math.round(price * (0.9 + rng() * 0.25)),
      cost: Math.round(cost * (0.9 + rng() * 0.2)),
      description: desc,
    });
    i++;
  }
  return out;
}

function expandCustomers(base, count, prefix, rng) {
  const out = [];
  let i = 0;
  while (out.length < count) {
    const [name, loc] = base[i % base.length];
    const variant = Math.floor(i / base.length);
    const fullName = variant === 0 ? name : `${name} · Branch ${variant + 1}`;
    const slug = fullName.toLowerCase().replace(/[^a-z0-9]+/g, ".").slice(0, 28);
    out.push({
      name: fullName,
      email: `${slug}@${prefix.toLowerCase()}-demo.in`,
      phone: `+91${String(9000000000 + Math.floor(rng() * 99999999))}`,
      location: loc,
      address: `${Math.floor(100 + rng() * 800)}, Industrial Area, ${loc}`,
      status: rng() < 0.12 ? "INACTIVE" : "ACTIVE",
    });
    i++;
  }
  return out;
}

async function clearIndustry(industry) {
  // Delete in FK-safe order via raw-ish cascades: order items via orders
  const orders = await prisma.order.findMany({ where: { industry }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  if (orderIds.length) {
    await prisma.invoice.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { industry } });
  } else {
    await prisma.invoice.deleteMany({ where: { industry } });
  }
  await prisma.inventoryMovement.deleteMany({ where: { industry } });
  await prisma.product.deleteMany({ where: { industry } });
  await prisma.customer.deleteMany({ where: { industry } });
  await prisma.warehouse.deleteMany({ where: { industry } });
}

async function seedPack(industry, cfg) {
  const rng = mulberry32(cfg.seed);
  console.log(`\n=== Seeding ${industry} (${cfg.orderCount} orders) ===`);

  await clearIndustry(industry);

  const productDefs = expandProducts(cfg.products, cfg.productCount, cfg.prefix, rng);
  const customerDefs = expandCustomers(cfg.customers, cfg.customerCount, cfg.prefix, rng);

  const warehouses = [];
  for (const [name, location, capacity] of cfg.warehouses.slice(0, cfg.warehouseCount)) {
    warehouses.push(
      await prisma.warehouse.create({
        data: { name, location, capacity, industry },
      }),
    );
  }

  const products = [];
  // batch create products
  for (let i = 0; i < productDefs.length; i += 40) {
    const chunk = productDefs.slice(i, i + 40);
    await prisma.product.createMany({
      data: chunk.map((p) => ({ ...p, industry })),
    });
  }
  const allProducts = await prisma.product.findMany({ where: { industry } });
  products.push(...allProducts);

  for (let i = 0; i < customerDefs.length; i += 40) {
    const chunk = customerDefs.slice(i, i + 40);
    await prisma.customer.createMany({
      data: chunk.map((c) => ({ ...c, industry })),
    });
  }
  const customers = await prisma.customer.findMany({ where: { industry } });

  // Inventory: every product × warehouse with intentional low/OOS pockets
  const movements = [];
  for (const wh of warehouses) {
    for (const p of products) {
      let qty = Math.floor(20 + rng() * 400);
      // Force some low / out of stock for alerts & tips
      if (rng() < 0.08) qty = Math.floor(rng() * 25);
      if (rng() < 0.03) qty = 0;
      movements.push({
        productId: p.id,
        warehouseId: wh.id,
        quantity: qty,
        type: "RESTOCK",
        industry,
      });
    }
  }
  for (let i = 0; i < movements.length; i += 200) {
    await prisma.inventoryMovement.createMany({ data: movements.slice(i, i + 200) });
  }

  // Named hero entities for demos
  const heroCustomer = customers.find((c) =>
    /Bharat Fine|Bharat Auto|City Care|Punjab Krishi/i.test(c.name),
  ) || customers[0];
  const heroProduct = products[0];
  const heroWarehouse = warehouses[0];

  const orderBatch = [];
  const itemBatch = [];
  const invoiceBatch = [];

  // Guarantee hero order CHEM-1042 / AUTO-1042 etc.
  const heroOrderNum = `${cfg.prefix}-1042`;
  const heroDate = daysAgo(rng, 12);
  const heroOrderId = randomUUID();
  orderBatch.push({
    id: heroOrderId,
    orderNumber: heroOrderNum,
    customerId: heroCustomer.id,
    warehouseId: heroWarehouse.id,
    status: "DELAYED",
    totalAmount: heroProduct.price * 24,
    industry,
    orderDate: heroDate,
    expectedDelivery: addDays(heroDate, 3),
    createdAt: heroDate,
    updatedAt: heroDate,
  });
  itemBatch.push({
    id: randomUUID(),
    orderId: heroOrderId,
    productId: heroProduct.id,
    quantity: 24,
    unitPrice: heroProduct.price,
    totalPrice: heroProduct.price * 24,
  });
  invoiceBatch.push({
    id: randomUUID(),
    invoiceNumber: `INV-${cfg.prefix}-1042`,
    orderId: heroOrderId,
    amount: heroProduct.price * 24,
    status: "OVERDUE",
    industry,
    dueDate: addDays(heroDate, 7),
    createdAt: heroDate,
    updatedAt: heroDate,
  });

  // Extra named orders
  for (const n of [2187, 3301, 4402, 5510]) {
    const od = daysAgo(rng, 40);
    const id = randomUUID();
    const cust = pick(rng, customers);
    const wh = pick(rng, warehouses);
    const p = pick(rng, products);
    const qty = 5 + Math.floor(rng() * 40);
    const status = n === 2187 ? "PROCESSING" : n === 3301 ? "SHIPPED" : weightedStatus(rng);
    const total = p.price * qty;
    orderBatch.push({
      id,
      orderNumber: `${cfg.prefix}-${n}`,
      customerId: cust.id,
      warehouseId: wh.id,
      status,
      totalAmount: total,
      industry,
      orderDate: od,
      expectedDelivery: addDays(od, 5 + Math.floor(rng() * 10)),
      createdAt: od,
      updatedAt: od,
    });
    itemBatch.push({
      id: randomUUID(),
      orderId: id,
      productId: p.id,
      quantity: qty,
      unitPrice: p.price,
      totalPrice: total,
    });
  }

  // Bulk orders — capture target once so growing orderBatch.length does not shrink the loop
  const bulkTarget = Math.max(0, cfg.orderCount - orderBatch.length);
  for (let i = 0; i < bulkTarget; i++) {
    const od = daysAgo(rng, 90);
    const id = randomUUID();
    const cust = pick(rng, customers);
    const wh = pick(rng, warehouses);
    const status = weightedStatus(rng);
    const lineCount = 1 + Math.floor(rng() * 3);
    let total = 0;
    const lines = [];
    for (let L = 0; L < lineCount; L++) {
      const p = pick(rng, products);
      const qty = 2 + Math.floor(rng() * 50);
      const lineTotal = p.price * qty;
      total += lineTotal;
      lines.push({ p, qty, lineTotal });
    }
    const orderNumber = `${cfg.prefix}-${String(6000 + i).padStart(4, "0")}`;
    orderBatch.push({
      id,
      orderNumber,
      customerId: cust.id,
      warehouseId: wh.id,
      status,
      totalAmount: total,
      industry,
      orderDate: od,
      expectedDelivery: addDays(od, 4 + Math.floor(rng() * 14)),
      createdAt: od,
      updatedAt: od,
    });
    for (const line of lines) {
      itemBatch.push({
        id: randomUUID(),
        orderId: id,
        productId: line.p.id,
        quantity: line.qty,
        unitPrice: line.p.price,
        totalPrice: line.lineTotal,
      });
    }

    // ~55% of orders get an invoice (skip invoices on cancelled)
    if (status !== "CANCELLED" && rng() < 0.55) {
      let invStatus = "PAID";
      if (rng() < 0.18) invStatus = "OVERDUE";
      else if (rng() < 0.35) invStatus = "UNPAID";
      invoiceBatch.push({
        id: randomUUID(),
        invoiceNumber: `INV-${cfg.prefix}-${String(7000 + i).padStart(4, "0")}`,
        orderId: id,
        amount: total,
        status: invStatus,
        industry,
        dueDate: addDays(od, 15),
        createdAt: od,
        updatedAt: od,
      });
    }
  }

  // Ensure some customers stay inactive (no recent orders) — already have INACTIVE status;
  // also leave last 8 customers with no orders in batch by skipping them in picks occasionally.
  // Force: remove recent orders for a few customers by not assigning — create dedicated inactive ones.
  // (Handled via status + 30-day filter naturally for older-only customers)

  console.log(`  warehouses=${warehouses.length} products=${products.length} customers=${customers.length}`);
  console.log(`  writing orders=${orderBatch.length} items=${itemBatch.length} invoices=${invoiceBatch.length}`);

  for (let i = 0; i < orderBatch.length; i += 100) {
    await prisma.order.createMany({ data: orderBatch.slice(i, i + 100) });
  }
  for (let i = 0; i < itemBatch.length; i += 200) {
    await prisma.orderItem.createMany({ data: itemBatch.slice(i, i + 200) });
  }
  for (let i = 0; i < invoiceBatch.length; i += 100) {
    await prisma.invoice.createMany({ data: invoiceBatch.slice(i, i + 100) });
  }

  console.log(`  ✓ ${industry} done. Hero order: ${heroOrderNum} · customer: ${heroCustomer.name}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  console.log("Seeding industry packs into Prisma DB...");
  for (const [industry, cfg] of Object.entries(PACKS)) {
    await seedPack(industry, cfg);
  }
  console.log("\nAll industry packs seeded.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
