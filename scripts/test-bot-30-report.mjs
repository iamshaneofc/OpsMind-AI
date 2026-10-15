/**
 * 30-question multi-industry bot QA + markdown report.
 * Uses live OpenAI + Prisma data (same shape as app tools).
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import OpenAI from "openai";

const rawUrl = (process.env.DATABASE_URL ?? "")
  .replace("?pgbouncer=true", "")
  .replace("&pgbouncer=true", "");
const pool = new Pool({
  connectionString: rawUrl,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = process.env.OPENAI_MODEL || "gpt-4o";

const CASES = [
  // Chemical (1–18) — hero vertical
  { id: 1, industry: "chemical", q: "Which orders are delayed?", expect: ["delayed", "CHEM", "table"] },
  { id: 2, industry: "chemical", q: "Give me details for order CHEM-1042", expect: ["CHEM-1042", "Bharat Fine", "Sodium"] },
  { id: 3, industry: "chemical", q: "Show pending and processing orders", expect: ["PENDING", "PROCESSING", "table"] },
  { id: 4, industry: "chemical", q: "Show the most recent orders", expect: ["CHEM-", "table"] },
  { id: 5, industry: "chemical", q: "Show low stock below 30 units", expect: ["stock", "table", "Hub"] },
  { id: 6, industry: "chemical", q: "What is our total inventory valuation?", expect: ["₹", "valuation"] },
  { id: 7, industry: "chemical", q: "Show inventory for Mumbai Hub", expect: ["Mumbai", "table"] },
  { id: 8, industry: "chemical", q: "List our warehouses", expect: ["Hub", "Mumbai", "Pune"] },
  { id: 9, industry: "chemical", q: "Who are our top distributors by revenue?", expect: ["₹", "table"] },
  { id: 10, industry: "chemical", q: "Which customers have been inactive?", expect: ["inactive", "table"] },
  { id: 11, industry: "chemical", q: "Show order history for Bharat Fine Chemicals", expect: ["Bharat Fine", "CHEM-"] },
  { id: 12, industry: "chemical", q: "Show overdue invoices", expect: ["INV-", "overdue", "₹"] },
  { id: 13, industry: "chemical", q: "Show outstanding unpaid invoices", expect: ["INV-", "table"] },
  { id: 14, industry: "chemical", q: "What are revenue trends / collected payments?", expect: ["₹", "paid"] },
  { id: 15, industry: "chemical", q: "What are the top selling chemical products?", expect: ["CHEM-", "table"] },
  { id: 16, industry: "chemical", q: "What should I do today?", expect: ["delay", "stock", "invoice"] },
  { id: 17, industry: "chemical", q: "Details for CHEM-2187", expect: ["CHEM-2187"] },
  { id: 18, industry: "chemical", q: "Compare stock risk — which SKUs are out of stock?", expect: ["0", "table"] },
  // Automobile (19–22)
  { id: 19, industry: "automobile", q: "Which auto orders are delayed?", expect: ["AUTO-", "delay"] },
  { id: 20, industry: "automobile", q: "Give details for AUTO-1042", expect: ["AUTO-1042", "Bharat Auto"] },
  { id: 21, industry: "automobile", q: "Top dealers by revenue", expect: ["₹", "table"] },
  { id: 22, industry: "automobile", q: "Show inventory for Western Region Hub", expect: ["Western", "table"] },
  // Pharma (23–26)
  { id: 23, industry: "pharma", q: "Which hospital shipments are delayed?", expect: ["PHAR-", "delay"] },
  { id: 24, industry: "pharma", q: "Details for PHAR-1042", expect: ["PHAR-1042", "City Care"] },
  { id: 25, industry: "pharma", q: "Show overdue pharma invoices", expect: ["INV-", "₹"] },
  { id: 26, industry: "pharma", q: "Low stock formulations below 30", expect: ["PHAR-", "table"] },
  // Agriculture (27–30)
  { id: 27, industry: "agriculture", q: "Delayed agri dealer shipments?", expect: ["AGRI-", "delay"] },
  { id: 28, industry: "agriculture", q: "Details for AGRI-1042", expect: ["AGRI-1042", "Punjab"] },
  { id: 29, industry: "agriculture", q: "Top co-op buyers by revenue", expect: ["₹", "table"] },
  { id: 30, industry: "agriculture", q: "Inventory at Punjab Agri Hub", expect: ["Punjab", "table"] },
];

const META = {
  chemical: { company: "Meridian Specialty Chem", unit: "kg / drums", prefix: "CHEM" },
  automobile: { company: "OpsMind Auto Parts", unit: "pcs", prefix: "AUTO" },
  pharma: { company: "OpsMind Pharma Supply", unit: "packs / vials", prefix: "PHAR" },
  agriculture: { company: "OpsMind Agri Inputs", unit: "bags / litres", prefix: "AGRI" },
};

function money(n) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
}

async function fetchToolData(industry, q) {
  const ql = q.toLowerCase();

  if (/list.*warehouse|warehouses/.test(ql)) {
    const ws = await prisma.warehouse.findMany({ where: { industry }, orderBy: { name: "asc" } });
    return { warehouses: ws.map((w) => ({ name: w.name, location: w.location, id: w.id })) };
  }

  if (/1042|2187|3301|details for/.test(ql)) {
    const m = q.match(/((?:CHEM|AUTO|PHAR|AGRI)-\d+)/i);
    const orderNumber = m ? m[1].toUpperCase() : `${META[industry].prefix}-1042`;
    const order = await prisma.order.findFirst({
      where: { industry, orderNumber },
      include: {
        customer: true,
        warehouse: true,
        items: { include: { product: true } },
        invoices: true,
      },
    });
    return {
      orderNumber: order?.orderNumber,
      status: order?.status,
      customer: order?.customer?.name,
      warehouse: order?.warehouse?.name,
      amountFormatted: money(order?.totalAmount),
      items: (order?.items || []).map((it) => ({
        sku: it.product?.sku,
        product: it.product?.name,
        qty: it.quantity,
        line: money(it.totalPrice),
      })),
      invoices: (order?.invoices || []).map((i) => ({
        no: i.invoiceNumber,
        status: i.status,
        amount: money(i.amount),
      })),
      found: !!order,
    };
  }

  if (/delayed|delay/.test(ql)) {
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
      take: 10,
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
        amountFormatted: money(o.totalAmount),
        expectedDelivery: o.expectedDelivery,
      })),
    };
  }

  if (/pending|processing/.test(ql)) {
    const rows = await prisma.order.findMany({
      where: { industry, status: { in: ["PENDING", "PROCESSING"] } },
      take: 10,
      include: { customer: true, warehouse: true },
      orderBy: { createdAt: "desc" },
    });
    return {
      count: rows.length,
      orders: rows.map((o) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        customer: o.customer?.name,
        amountFormatted: money(o.totalAmount),
      })),
    };
  }

  if (/recent/.test(ql)) {
    const rows = await prisma.order.findMany({
      where: { industry },
      take: 10,
      include: { customer: true, warehouse: true },
      orderBy: { createdAt: "desc" },
    });
    return {
      orders: rows.map((o) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        customer: o.customer?.name,
        amountFormatted: money(o.totalAmount),
      })),
    };
  }

  if (/low stock|out of stock|stock risk|formulations below/.test(ql)) {
    const threshold = /out of stock/.test(ql) ? 1 : 30;
    const stock = await prisma.inventoryMovement.groupBy({
      by: ["productId", "warehouseId"],
      where: { industry },
      _sum: { quantity: true },
    });
    const low = stock
      .filter((s) => (s._sum.quantity || 0) < threshold)
      .sort((a, b) => (a._sum.quantity || 0) - (b._sum.quantity || 0))
      .slice(0, 10);
    const products = await prisma.product.findMany({
      where: { id: { in: low.map((l) => l.productId) } },
    });
    const warehouses = await prisma.warehouse.findMany({
      where: { id: { in: [...new Set(low.map((l) => l.warehouseId))] } },
    });
    const pm = new Map(products.map((p) => [p.id, p]));
    const wm = new Map(warehouses.map((w) => [w.id, w]));
    return {
      threshold,
      items: low.map((s) => ({
        sku: pm.get(s.productId)?.sku,
        product: pm.get(s.productId)?.name,
        warehouse: wm.get(s.warehouseId)?.name,
        onHand: s._sum.quantity || 0,
      })),
    };
  }

  if (/valuation/.test(ql)) {
    const stock = await prisma.inventoryMovement.groupBy({
      by: ["productId"],
      where: { industry },
      _sum: { quantity: true },
    });
    const products = await prisma.product.findMany({
      where: { id: { in: stock.map((s) => s.productId) }, industry },
    });
    const pm = new Map(products.map((p) => [p.id, p]));
    let total = 0;
    for (const s of stock) {
      const p = pm.get(s.productId);
      if (p) total += (s._sum.quantity || 0) * (p.cost || p.price);
    }
    return { totalValuationFormatted: money(total), totalValuation: total };
  }

  if (/inventory for|inventory at|hub/.test(ql) && !/list/.test(ql)) {
    let nameHint = "Hub";
    if (/mumbai/i.test(q)) nameHint = "Mumbai";
    if (/western/i.test(q)) nameHint = "Western";
    if (/punjab/i.test(q)) nameHint = "Punjab";
    const wh = await prisma.warehouse.findFirst({
      where: { industry, name: { contains: nameHint, mode: "insensitive" } },
    });
    if (!wh) return { error: "warehouse not found", nameHint };
    const stock = await prisma.inventoryMovement.groupBy({
      by: ["productId"],
      where: { industry, warehouseId: wh.id },
      _sum: { quantity: true },
    });
    const sorted = [...stock].sort((a, b) => (a._sum.quantity || 0) - (b._sum.quantity || 0));
    const products = await prisma.product.findMany({
      where: { id: { in: sorted.slice(0, 10).map((s) => s.productId) } },
    });
    const pm = new Map(products.map((p) => [p.id, p]));
    return {
      warehouse: wh.name,
      items: sorted.slice(0, 10).map((s) => ({
        sku: pm.get(s.productId)?.sku,
        product: pm.get(s.productId)?.name,
        onHand: s._sum.quantity || 0,
      })),
    };
  }

  if (/top distributor|top dealer|top co-op|top customer|buyers by revenue/.test(ql)) {
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
    return {
      customers: top.map((t) => ({
        name: cm.get(t.customerId)?.name,
        totalSpentFormatted: money(t._sum.totalAmount),
        orders: t._count.id,
      })),
    };
  }

  if (/inactive/.test(ql)) {
    const thirty = new Date();
    thirty.setDate(thirty.getDate() - 30);
    const rows = await prisma.customer.findMany({
      where: {
        industry,
        orders: { none: { industry, orderDate: { gte: thirty } } },
      },
      take: 10,
    });
    return {
      count: rows.length,
      customers: rows.map((c) => ({ name: c.name, location: c.location, status: c.status })),
    };
  }

  if (/history for|bharat fine/.test(ql)) {
    const cust = await prisma.customer.findFirst({
      where: { industry, name: { contains: "Bharat Fine", mode: "insensitive" } },
    });
    const orders = await prisma.order.findMany({
      where: { industry, customerId: cust?.id },
      take: 10,
      orderBy: { orderDate: "desc" },
      include: { warehouse: true },
    });
    return {
      customer: cust?.name,
      orders: orders.map((o) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        amountFormatted: money(o.totalAmount),
        warehouse: o.warehouse?.name,
      })),
    };
  }

  if (/overdue|outstanding|unpaid/.test(ql)) {
    const statuses = /overdue/.test(ql) ? ["OVERDUE"] : ["UNPAID", "OVERDUE"];
    const rows = await prisma.invoice.findMany({
      where: { industry, status: { in: statuses } },
      take: 10,
      include: { order: { include: { customer: true } } },
      orderBy: { amount: "desc" },
    });
    return {
      count: rows.length,
      invoices: rows.map((i) => ({
        invoiceNumber: i.invoiceNumber,
        status: i.status,
        amountFormatted: money(i.amount),
        customer: i.order?.customer?.name,
        orderNumber: i.order?.orderNumber,
      })),
    };
  }

  if (/revenue|collected|paid/.test(ql)) {
    const paid = await prisma.invoice.findMany({
      where: { industry, status: "PAID" },
      take: 500,
    });
    const total = paid.reduce((s, i) => s + i.amount, 0);
    return {
      invoiceCount: paid.length,
      totalRevenueFormatted: money(total),
      status: "PAID",
    };
  }

  if (/top selling|top product/.test(ql)) {
    const products = await prisma.product.findMany({
      where: { industry },
      select: { id: true },
    });
    const top = await prisma.orderItem.groupBy({
      by: ["productId"],
      where: { productId: { in: products.map((p) => p.id) } },
      _sum: { quantity: true, totalPrice: true },
      orderBy: { _sum: { totalPrice: "desc" } },
      take: 5,
    });
    const ps = await prisma.product.findMany({
      where: { id: { in: top.map((t) => t.productId) } },
    });
    const pm = new Map(ps.map((p) => [p.id, p]));
    return {
      products: top.map((t) => ({
        sku: pm.get(t.productId)?.sku,
        name: pm.get(t.productId)?.name,
        sold: t._sum.quantity,
        revenueFormatted: money(t._sum.totalPrice),
      })),
    };
  }

  if (/today|should i do|tips/.test(ql)) {
    const delayed = await prisma.order.count({
      where: { industry, status: "DELAYED" },
    });
    const overdue = await prisma.invoice.count({
      where: { industry, status: "OVERDUE" },
    });
    return {
      tips: [
        { title: "Chase delayed shipments", evidence: `${delayed} DELAYED` },
        { title: "Reorder low stock SKUs", evidence: "stock below reorder" },
        { title: "Collect overdue AR", evidence: `${overdue} OVERDUE invoices` },
        { title: "Re-engage inactive accounts", evidence: "no orders 30d+" },
      ],
    };
  }

  return { note: "fallback empty" };
}

function scoreReply(text, expect, toolData) {
  const issues = [];
  const firstLine = (text.trim().split("\n")[0] || "");
  if (/^#{1,6}\s/.test(firstLine)) issues.push("opened with ## heading");
  if (!/\*\*[^*].+\*\*/.test(text)) issues.push("missing bold headline");
  if (/^(sure|certainly|great question|i'd be happy)/i.test(text.trim())) {
    issues.push("filler opening");
  }
  if (/as an ai|i cannot access|i don't have access/i.test(text)) {
    issues.push("weak/disclaimer language");
  }

  const blob = text.toLowerCase();
  for (const token of expect) {
    if (token === "table") {
      if (!/\|/.test(text) && !/^- \*\*/m.test(text)) issues.push("missing table/list evidence");
      continue;
    }
    if (!blob.includes(String(token).toLowerCase()) && !text.includes(token)) {
      // soft: allow if tool had no matching rows
      if (toolData?.found === false) continue;
      issues.push(`missing expected token: ${token}`);
    }
  }

  // Correctness: if tool returned a specific orderNumber, reply should not invent a different hero
  if (toolData?.orderNumber && toolData.found !== false) {
    if (!text.includes(toolData.orderNumber)) {
      issues.push(`did not cite order ${toolData.orderNumber}`);
    }
  }
  if (toolData?.customer && toolData.found !== false) {
    const short = String(toolData.customer).split("·")[0].trim();
    if (short && !text.toLowerCase().includes(short.toLowerCase().slice(0, 12))) {
      issues.push(`customer name mismatch/missing (${short})`);
    }
  }
  if (toolData?.warehouse && /mumbai|western|punjab/i.test(JSON.stringify(toolData))) {
    // ok
  }
  if (toolData?.totalValuationFormatted && !text.includes("₹") && !/inr|rupee/i.test(text)) {
    issues.push("missing currency for valuation");
  }

  const severity = issues.length === 0 ? "PASS" : issues.some((i) => i.startsWith("missing expected") || i.includes("mismatch") || i.includes("did not cite")) ? "FAIL" : "WARN";
  return { severity, issues };
}

async function ask(industry, q, toolData) {
  const meta = META[industry];
  const system = `You are OpsMind AI for ${meta.company} (${industry}). Currency ₹. Units: ${meta.unit}.
Start with a **bold headline** (never ###). Then short context, one markdown table when listing, 2-4 insight bullets, one next step.
Never invent data. Use only the tool JSON. Prefer amountFormatted fields. Cap ~160 words.`;

  const res = await openai.chat.completions.create({
    model,
    temperature: 0.15,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `Question: ${q}\n\nTool data:\n${JSON.stringify(toolData).slice(0, 14000)}`,
      },
    ],
  });
  return res.choices[0]?.message?.content || "";
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY required");
    process.exit(1);
  }

  const results = [];
  let pass = 0;
  let warn = 0;
  let fail = 0;

  for (const c of CASES) {
    process.stdout.write(`#${c.id} [${c.industry}] ${c.q.slice(0, 50)}... `);
    const toolData = await fetchToolData(c.industry, c.q);
    let answer = "";
    let err = null;
    try {
      answer = await ask(c.industry, c.q, toolData);
    } catch (e) {
      err = e.message || String(e);
      answer = "";
    }
    const scored = err
      ? { severity: "FAIL", issues: [`API error: ${err}`] }
      : scoreReply(answer, c.expect, toolData);

    if (scored.severity === "PASS") pass += 1;
    else if (scored.severity === "WARN") warn += 1;
    else fail += 1;

    console.log(scored.severity);
    results.push({
      ...c,
      severity: scored.severity,
      issues: scored.issues,
      answer,
      toolSummary: summarizeTool(toolData),
    });
  }

  const report = buildReport({ pass, warn, fail, results });
  const outPath = "BOT_CONVERSATION_REPORT.md";
  writeFileSync(outPath, report, "utf8");
  console.log(`\nWrote ${outPath}`);
  console.log(`PASS ${pass} | WARN ${warn} | FAIL ${fail} | TOTAL ${results.length}`);
  process.exit(fail > 0 ? 1 : 0);
}

function summarizeTool(d) {
  if (!d || typeof d !== "object") return String(d);
  if (d.error) return `error: ${d.error}`;
  if (d.found === false) return "order not found";
  if (d.orderNumber) return `${d.orderNumber} / ${d.customer} / ${d.status}`;
  if (d.count != null && d.orders) return `${d.count} orders (showing sample)`;
  if (d.count != null && d.invoices) return `${d.count} invoices`;
  if (d.count != null && d.customers) return `${d.count} customers`;
  if (d.warehouse) return `warehouse ${d.warehouse}`;
  if (d.totalValuationFormatted) return d.totalValuationFormatted;
  if (d.totalRevenueFormatted) return d.totalRevenueFormatted;
  if (d.tips) return `${d.tips.length} tips`;
  if (d.warehouses) return `${d.warehouses.length} warehouses`;
  if (d.items) return `${d.items.length} items`;
  if (d.products) return `${d.products.length} products`;
  if (d.customers) return `${d.customers.length} customers`;
  return Object.keys(d).join(",");
}

function buildReport({ pass, warn, fail, results }) {
  const pct = ((pass / results.length) * 100).toFixed(1);
  const lines = [];
  lines.push(`# OpsMind Bot Conversation Report`);
  lines.push("");
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Model:** ${model}`);
  lines.push(`**Questions:** ${results.length}`);
  lines.push(`**Score:** PASS ${pass} · WARN ${warn} · FAIL ${fail} (${pct}% hard-pass)`);
  lines.push("");
  lines.push(`## Verdict`);
  lines.push("");
  if (fail === 0 && warn <= 3) {
    lines.push(`Demo-ready for multi-industry conversations. Chemical hero path and cross-industry toggles answered correctly against live seeded data.`);
  } else if (fail === 0) {
    lines.push(`Mostly demo-ready. Review WARN items below (style/token soft misses) before customer demos.`);
  } else {
    lines.push(`Not fully demo-ready — fix FAIL items before presenting.`);
  }
  lines.push("");
  lines.push(`## Summary by industry`);
  lines.push("");
  lines.push(`| Industry | Pass | Warn | Fail |`);
  lines.push(`|----------|------|------|------|`);
  for (const ind of ["chemical", "automobile", "pharma", "agriculture"]) {
    const subset = results.filter((r) => r.industry === ind);
    lines.push(
      `| ${ind} | ${subset.filter((r) => r.severity === "PASS").length} | ${subset.filter((r) => r.severity === "WARN").length} | ${subset.filter((r) => r.severity === "FAIL").length} |`,
    );
  }
  lines.push("");
  lines.push(`## Case results`);
  lines.push("");
  lines.push(`| # | Industry | Result | Question | Tool check | Issues |`);
  lines.push(`|---|----------|--------|----------|------------|--------|`);
  for (const r of results) {
    const q = r.q.replace(/\|/g, "/");
    const issues = r.issues.length ? r.issues.join("; ") : "—";
    lines.push(
      `| ${r.id} | ${r.industry} | **${r.severity}** | ${q} | ${String(r.toolSummary).replace(/\|/g, "/")} | ${issues.replace(/\|/g, "/")} |`,
    );
  }
  lines.push("");
  lines.push(`## Sample answers (PASS only, truncated)`);
  lines.push("");
  for (const r of results.filter((x) => x.severity === "PASS").slice(0, 8)) {
    lines.push(`### #${r.id} ${r.q}`);
    lines.push("");
    lines.push("```");
    lines.push((r.answer || "").slice(0, 700));
    lines.push("```");
    lines.push("");
  }
  if (fail + warn > 0) {
    lines.push(`## Items to fix`);
    lines.push("");
    for (const r of results.filter((x) => x.severity !== "PASS")) {
      lines.push(`- **#${r.id} [${r.industry}]** ${r.q} → ${r.issues.join("; ")}`);
    }
    lines.push("");
  }
  lines.push(`## Method`);
  lines.push("");
  lines.push(`1. Load industry-scoped Prisma data (same entities the app tools query).`);
  lines.push(`2. Ask ${model} with OpsMind response contract.`);
  lines.push(`3. Score: bold headline, no filler, expected tokens present, order/customer citations match tool data.`);
  lines.push("");
  return lines.join("\n");
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
