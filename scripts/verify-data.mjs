// Quick verification of seeded data
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { loadLocalEnv } from "./_env.mjs";

loadLocalEnv();

const rawUrl = process.env.DATABASE_URL ?? "";
const cleanUrl = rawUrl.replace("?pgbouncer=true", "").replace("&pgbouncer=true", "");
const pool = new Pool({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false }, max: 5 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function verify() {
  console.log("=== Data Verification ===\n");

  const [customers, orders, products, warehouses, invoices, movements, userRoles] = await Promise.all([
    prisma.customer.count(),
    prisma.order.count(),
    prisma.product.count(),
    prisma.warehouse.count(),
    prisma.invoice.count(),
    prisma.inventoryMovement.count(),
    prisma.userRole.count(),
  ]);

  console.log(`Customers:       ${customers}`);
  console.log(`Orders:          ${orders}`);
  console.log(`Products:        ${products}`);
  console.log(`Warehouses:      ${warehouses}`);
  console.log(`Invoices:        ${invoices}`);
  console.log(`Inv. Movements:  ${movements}`);
  console.log(`User Roles:      ${userRoles}`);

  // Status distribution
  const statusCounts = await prisma.order.groupBy({ by: ["status"], _count: true });
  console.log("\nOrder Status Distribution:");
  for (const s of statusCounts.sort((a, b) => b._count - a._count)) {
    console.log(`  ${s.status}: ${s._count}`);
  }

  // Invoice status distribution
  const invStatusCounts = await prisma.invoice.groupBy({ by: ["status"], _count: true });
  console.log("\nInvoice Status Distribution:");
  for (const s of invStatusCounts.sort((a, b) => b._count - a._count)) {
    console.log(`  ${s.status}: ${s._count}`);
  }

  // Revenue
  const totalRevenue = await prisma.order.aggregate({ _sum: { totalAmount: true } });
  console.log(`\nTotal Revenue: ₹${(totalRevenue._sum.totalAmount || 0).toLocaleString()}`);

  const paidInvoices = await prisma.invoice.aggregate({ where: { status: "PAID" }, _sum: { amount: true } });
  console.log(`Paid Invoices:  ₹${(paidInvoices._sum.amount || 0).toLocaleString()}`);

  // Customers per company
  const customersWithOrders = await prisma.customer.findMany({
    include: { _count: { select: { orders: true } } },
    orderBy: { orders: { _count: "desc" } },
    take: 5,
  });
  console.log("\nTop Customers by Orders:");
  for (const c of customersWithOrders) {
    console.log(`  ${c.name}: ${c._count.orders} orders`);
  }

  await prisma.$disconnect();
  await pool.end();
}

verify().catch((err) => { console.error(err); process.exit(1); });
