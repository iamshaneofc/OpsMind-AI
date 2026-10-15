/**
 * Conversation readiness suite — exercises every AI tool against each industry
 * without requiring OpenAI. Failures = demo-breaking gaps.
 *
 * Optional: set OPENAI_API_KEY to also score a few live LLM replies.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const industries = ["chemical", "automobile", "pharma", "agriculture"];
const prefixes = {
  chemical: "CHEM",
  automobile: "AUTO",
  pharma: "PHAR",
  agriculture: "AGRI",
};

const rawUrl = (process.env.DATABASE_URL ?? "")
  .replace("?pgbouncer=true", "")
  .replace("&pgbouncer=true", "");
const pool = new Pool({
  connectionString: rawUrl,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    failures += 1;
    console.error("  FAIL:", msg);
  } else {
    console.log("  OK:", msg);
  }
}

async function checkIndustry(industry) {
  console.log(`\n=== ${industry} ===`);
  const prefix = prefixes[industry];

  const recent = await prisma.order.findMany({
    where: { industry },
    take: 10,
    orderBy: { createdAt: "desc" },
    include: { customer: true, warehouse: true },
  });
  assert(recent.length >= 5, `getRecentOrders returns ${recent.length} rows`);
  assert(
    recent.every((o) => o.orderNumber.startsWith(prefix)),
    `recent orders use ${prefix}- prefix`,
  );

  const delayed = await prisma.order.findMany({
    where: {
      industry,
      OR: [
        { status: "DELAYED" },
        {
          expectedDelivery: { lt: new Date() },
          status: { notIn: ["DELIVERED", "CANCELLED"] },
        },
      ],
    },
    take: 20,
    include: { customer: true },
  });
  assert(delayed.length >= 1, `delayed orders: ${delayed.length}`);

  const hero = await prisma.order.findFirst({
    where: { orderNumber: `${prefix}-1042`, industry },
    include: {
      customer: true,
      warehouse: true,
      items: { include: { product: true } },
      invoices: true,
    },
  });
  assert(!!hero, `hero order ${prefix}-1042 exists`);
  assert(hero?.status === "DELAYED", `hero ${prefix}-1042 is DELAYED`);
  assert((hero?.items?.length ?? 0) >= 1, `hero has line items`);
  assert(!!hero?.customer?.name, `hero has customer name`);

  const pending = await prisma.order.count({
    where: { industry, status: { in: ["PENDING", "PROCESSING"] } },
  });
  assert(pending >= 5, `pending/processing count ${pending}`);

  const stock = await prisma.inventoryMovement.groupBy({
    by: ["productId", "warehouseId"],
    where: { industry },
    _sum: { quantity: true },
  });
  const low = stock.filter((s) => (s._sum.quantity || 0) < 50);
  assert(low.length >= 3, `low stock rows (<50): ${low.length}`);

  const warehouses = await prisma.warehouse.findMany({ where: { industry } });
  assert(warehouses.length >= 3, `warehouses: ${warehouses.length}`);
  const whStock = await prisma.inventoryMovement.groupBy({
    by: ["productId"],
    where: { industry, warehouseId: warehouses[0].id },
    _sum: { quantity: true },
  });
  assert(whStock.length >= 10, `warehouse inventory SKUs: ${whStock.length}`);

  const topCust = await prisma.order.groupBy({
    by: ["customerId"],
    where: { industry },
    _sum: { totalAmount: true },
    orderBy: { _sum: { totalAmount: "desc" } },
    take: 5,
  });
  assert(topCust.length >= 3, `top customers: ${topCust.length}`);

  const overdue = await prisma.invoice.count({
    where: { industry, status: "OVERDUE" },
  });
  assert(overdue >= 1, `overdue invoices: ${overdue}`);

  const outstanding = await prisma.invoice.count({
    where: { industry, status: { in: ["UNPAID", "OVERDUE"] } },
  });
  assert(outstanding >= 3, `outstanding invoices: ${outstanding}`);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const inactive = await prisma.customer.count({
    where: {
      industry,
      orders: { none: { industry, orderDate: { gte: thirtyDaysAgo } } },
    },
  });
  assert(inactive >= 0, `inactive customers query works (${inactive})`);

  const products = await prisma.product.findMany({
    where: { industry },
    select: { id: true },
  });
  const topProducts = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: { productId: { in: products.map((p) => p.id) } },
    _sum: { quantity: true, totalPrice: true },
    orderBy: { _sum: { totalPrice: "desc" } },
    take: 5,
  });
  assert(topProducts.length >= 3, `top products: ${topProducts.length}`);

  // Sample conversation entities for demos
  console.log(
    `  Demo ask: "details for ${prefix}-1042" → ${hero?.customer?.name} @ ${hero?.warehouse?.name}`,
  );
  console.log(
    `  Demo ask: delayed → ${delayed.length} rows; overdue → ${overdue}; low stock → ${low.length}`,
  );
}

async function optionalLiveLlm() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.log("\n=== Live LLM ===");
    console.log("  SKIP: OPENAI_API_KEY not set — add it to .env to score real bot replies.");
    return;
  }

  console.log("\n=== Live LLM (chemical) ===");
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: key });
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const delayed = await prisma.order.findMany({
    where: { industry: "chemical", status: "DELAYED" },
    take: 5,
    include: { customer: true },
  });

  const prompt = `You are OpsMind AI for Meridian Specialty Chem. Answer briefly with a bold headline, one markdown table, and a next step. Never invent data.\n\nUser: Which orders are delayed?\n\nTool result JSON:\n${JSON.stringify(delayed.slice(0, 5))}`;

  try {
    const res = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });
    const text = res.choices[0]?.message?.content || "";
    assert(/\*\*.+\*\*/.test(text) || text.includes("**"), "LLM reply has bold headline");
    assert(/\|/.test(text), "LLM reply includes a markdown table");
    assert(!/certainly|sure!|great question/i.test(text), "LLM avoids filler openings");
    console.log("  Sample reply preview:\n", text.slice(0, 400), "…");
  } catch (e) {
    console.log("  SKIP live LLM:", e?.message || e);
    console.log("  (Data/tool checks above still count. Fix OPENAI_API_KEY for live scoring.)");
  }
}

async function main() {
  for (const ind of industries) {
    await checkIndustry(ind);
  }
  await optionalLiveLlm();
  console.log(`\nDone. Failures: ${failures}`);
  process.exit(failures ? 1 : 0);
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
