/**
 * Live multi-question bot simulation for Chemical (and one Auto check).
 * Requires OPENAI_API_KEY. Uses the same tool catalog as the app.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import OpenAI from "openai";
import { createRequire } from "module";

// We call tools via SQL/Prisma mirrors of app tools for reliability outside Next runtime.
const rawUrl = (process.env.DATABASE_URL ?? "")
  .replace("?pgbouncer=true", "")
  .replace("&pgbouncer=true", "");
const pool = new Pool({
  connectionString: rawUrl,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error("OPENAI_API_KEY required");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: key });
const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

const questions = [
  "Which orders are delayed?",
  "Give me details for order CHEM-1042",
  "Show low stock below 30 units",
  "Who are our top distributors by revenue?",
  "Show overdue invoices",
  "What should I do today?",
  "Show inventory for Mumbai Hub",
  "Which customers have been inactive?",
];

async function toolPayload(q) {
  const industry = "chemical";
  if (/delayed/i.test(q)) {
    const rows = await prisma.order.findMany({
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
      take: 8,
      include: { customer: true, warehouse: true },
      orderBy: { expectedDelivery: "asc" },
    });
    return {
      count: rows.length,
      orders: rows.map((o) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        customer: o.customer?.name,
        warehouse: o.warehouse?.name,
        amount: o.totalAmount,
        expectedDelivery: o.expectedDelivery,
      })),
    };
  }
  if (/CHEM-1042/i.test(q)) {
    return prisma.order.findFirst({
      where: { orderNumber: "CHEM-1042", industry },
      include: {
        customer: true,
        warehouse: true,
        items: { include: { product: true } },
        invoices: true,
      },
    });
  }
  if (/low stock/i.test(q)) {
    const stock = await prisma.inventoryMovement.groupBy({
      by: ["productId", "warehouseId"],
      where: { industry },
      _sum: { quantity: true },
    });
    const low = stock
      .filter((s) => (s._sum.quantity || 0) < 30)
      .sort((a, b) => (a._sum.quantity || 0) - (b._sum.quantity || 0))
      .slice(0, 8);
    const products = await prisma.product.findMany({
      where: { id: { in: low.map((l) => l.productId) } },
    });
    const warehouses = await prisma.warehouse.findMany({
      where: { id: { in: low.map((l) => l.warehouseId) } },
    });
    const pm = new Map(products.map((p) => [p.id, p]));
    const wm = new Map(warehouses.map((w) => [w.id, w]));
    return low.map((s) => ({
      sku: pm.get(s.productId)?.sku,
      product: pm.get(s.productId)?.name,
      warehouse: wm.get(s.warehouseId)?.name,
      onHand: s._sum.quantity,
    }));
  }
  if (/top distributor|top customer/i.test(q)) {
    const top = await prisma.order.groupBy({
      by: ["customerId"],
      where: { industry },
      _sum: { totalAmount: true },
      _count: { id: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 5,
    });
    const customers = await prisma.customer.findMany({
      where: { id: { in: top.map((t) => t.customerId) } },
    });
    const cm = new Map(customers.map((c) => [c.id, c]));
    return top.map((t) => ({
      customer: cm.get(t.customerId)?.name,
      totalSpent: t._sum.totalAmount,
      orders: t._count.id,
    }));
  }
  if (/overdue/i.test(q)) {
    const rows = await prisma.invoice.findMany({
      where: { industry, status: "OVERDUE" },
      take: 8,
      include: { order: { include: { customer: true } } },
      orderBy: { amount: "desc" },
    });
    return rows.map((i) => ({
      invoice: i.invoiceNumber,
      amount: i.amount,
      customer: i.order?.customer?.name,
      order: i.order?.orderNumber,
    }));
  }
  if (/today|tips/i.test(q)) {
    return {
      tips: [
        "Chase delayed shipments",
        "Reorder low stock SKUs",
        "Collect overdue AR",
        "Re-engage inactive distributors",
      ],
    };
  }
  if (/Mumbai Hub|inventory for/i.test(q)) {
    const wh = await prisma.warehouse.findFirst({
      where: { industry, name: { contains: "Mumbai", mode: "insensitive" } },
    });
    const stock = await prisma.inventoryMovement.groupBy({
      by: ["productId"],
      where: { industry, warehouseId: wh.id },
      _sum: { quantity: true },
    });
    const products = await prisma.product.findMany({
      where: { id: { in: stock.slice(0, 8).map((s) => s.productId) } },
    });
    return {
      warehouse: wh?.name,
      sample: products.map((p, i) => ({
        sku: p.sku,
        product: p.name,
        onHand: stock[i]?._sum.quantity,
      })),
    };
  }
  if (/inactive/i.test(q)) {
    const thirty = new Date();
    thirty.setDate(thirty.getDate() - 30);
    return prisma.customer.findMany({
      where: {
        industry,
        orders: { none: { industry, orderDate: { gte: thirty } } },
      },
      take: 8,
    });
  }
  return { note: "no tool" };
}

function score(text, q) {
  const issues = [];
  if (/^(sure|certainly|great question|i'd be happy)/i.test(text.trim())) {
    issues.push("filler opening");
  }
  const firstLine = text.trim().split("\n")[0] || "";
  if (/^#{1,6}\s/.test(firstLine)) issues.push("opened with markdown heading instead of bold");
  if (!/\*\*[^*].+\*\*/.test(text)) issues.push("missing bold headline");
  if (/delayed|CHEM-1042|low stock|distributor|invoice|Mumbai|inactive|today|tip/i.test(q)) {
    if (!/\|/.test(text) && !/tip|priority|chase|reorder|collect/i.test(text)) {
      issues.push("missing table or action list");
    }
  }
  if (/certainly|as an ai|i cannot access/i.test(text)) issues.push("weak confidence language");
  return issues;
}

async function ask(q) {
  const payload = await toolPayload(q);
  const system = `You are OpsMind AI for Meridian Specialty Chem (chemical industry). Currency ₹. Units kg/drums.
Response MUST start with a **bold headline** using double asterisks (never ### or ## as the first line), then optional short context, one markdown table when listing, 2-4 insight bullets, one next step.
Never invent data. Never open with Sure/Certainly. Use tool JSON only.`;

  const res = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `Question: ${q}\n\nTool data:\n${JSON.stringify(payload).slice(0, 12000)}`,
      },
    ],
  });
  return res.choices[0]?.message?.content || "";
}

async function main() {
  let fails = 0;
  for (const q of questions) {
    process.stdout.write(`\nQ: ${q}\n`);
    const answer = await ask(q);
    const issues = score(answer, q);
    if (issues.length) {
      fails += 1;
      console.log("  SCORE FAIL:", issues.join(", "));
    } else {
      console.log("  SCORE OK");
    }
    console.log("  ---");
    console.log(answer.slice(0, 500) + (answer.length > 500 ? "…" : ""));
  }
  console.log(`\nLive conversation failures: ${fails}/${questions.length}`);
  process.exit(fails ? 1 : 0);
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
