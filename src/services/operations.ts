import type { AppRole, UserProfile } from "@/types/auth";
import { prisma } from "@/lib/db";
import { getCached } from "@/lib/cache";
import { getActiveIndustry } from "@/lib/industry-server";
import type { IndustryId } from "@/lib/industry";
import type { OperationalTip } from "@/types/operations";
import {
  isOrdersAwaitingFactoryStatus,
  isOrdersCentralWarehouseStatus,
  isOrdersInProgressStatus,
  isOrdersLocalWarehouseStatus,
} from "@/lib/orders-view-filters";

export interface DashboardMetrics {
  totalOrders: number;
  inProgress: number;
  ordersInLocalWarehouse: number;
  awaitingFactory: number;
  ordersInCentralWarehouse: number;
  revenue: number;
  /** Collected = sum of PAID invoices (not margin). */
  profit: number;
  inventoryHealth: number;
  fulfillmentRate: number;
  customerGrowth: number;
  ordersByStatus: Array<{ name: string; value: number }>;
  ordersPipeline: Array<{ name: string; value: number }>;
  industry: IndustryId;
}

function buildStatusCounts(orders: Array<{ status: string }>) {
  const byStatus = new Map<string, number>();
  for (const o of orders) {
    const k = String(o.status ?? "UNKNOWN");
    byStatus.set(k, (byStatus.get(k) ?? 0) + 1);
  }
  return Array.from(byStatus.entries())
    .map(([name, value]) => ({ name, value }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
}

function buildPipelineCounts(orders: Array<{ status: string }>) {
  let receivedLocal = 0;
  let inPrep = 0;
  let dispatchReady = 0;
  let delivered = 0;
  for (const o of orders) {
    const s = String(o.status ?? "").toUpperCase();
    if (s === "DELIVERED") delivered++;
    else if (s === "SHIPPED") dispatchReady++;
    else if (s === "PROCESSING") inPrep++;
    else receivedLocal++;
  }
  return [
    { name: "Received", value: receivedLocal },
    { name: "Processing", value: inPrep },
    { name: "Shipped", value: dispatchReady },
    { name: "Delivered", value: delivered },
  ].filter((x) => x.value > 0);
}

const emptyMetrics = (industry: IndustryId): DashboardMetrics => ({
  totalOrders: 0,
  inProgress: 0,
  ordersInLocalWarehouse: 0,
  awaitingFactory: 0,
  ordersInCentralWarehouse: 0,
  revenue: 0,
  profit: 0,
  inventoryHealth: 0,
  fulfillmentRate: 0,
  customerGrowth: 0,
  ordersByStatus: [],
  ordersPipeline: [],
  industry,
});

function warehouseWhere(profile: UserProfile) {
  if (profile.role === "manager" || profile.role === "analyst") {
    if (!profile.warehouse_id) return null;
    return String(profile.warehouse_id);
  }
  return undefined;
}

export async function getDashboardMetrics(profile: UserProfile): Promise<DashboardMetrics> {
  const industry = getActiveIndustry();
  return getCached(`metrics:${industry}:${profile.role}:${profile.user_id}`, 15_000, async () => {
    const [orders, customersCount, allInvoices, inventoryMovements, totalSkus] = await Promise.all([
      getOrdersForRole(profile, { balanced: false, limit: 500 }),
      prisma.customer.count({ where: { industry } }),
      prisma.invoice.findMany({
        where: { industry, status: { in: ["PAID", "UNPAID", "OVERDUE"] } },
        select: { amount: true, status: true },
      }),
      prisma.inventoryMovement.groupBy({
        by: ["productId", "warehouseId"],
        where: { industry },
        _sum: { quantity: true },
      }),
      prisma.product.count({ where: { industry } }),
    ]);

    if (!orders.length) {
      return { ...emptyMetrics(industry), customerGrowth: customersCount };
    }

    const totalOrders = orders.length;
    const inProgress = orders.filter((o) => isOrdersInProgressStatus(o.status)).length;
    const ordersInLocalWarehouse = orders.filter((o) => isOrdersLocalWarehouseStatus(o.status)).length;
    const awaitingFactory = orders.filter((o) => isOrdersAwaitingFactoryStatus(o.status)).length;
    const ordersInCentralWarehouse = orders.filter((o) => isOrdersCentralWarehouseStatus(o.status)).length;

    const revenue = orders.reduce((sum, order) => sum + (order.order_value || 0), 0);
    const deliveredCount = orders.filter((o) => o.status === "DELIVERED").length;
    const fulfillmentRate = totalOrders > 0 ? (deliveredCount / totalOrders) * 100 : 0;

    const totalPaid = allInvoices
      .filter((i) => i.status === "PAID")
      .reduce((sum, inv) => sum + inv.amount, 0);

    const lowStockCount = inventoryMovements.filter((m) => (m._sum.quantity || 0) < 30).length;
    const inventoryHealth =
      totalSkus > 0 ? Math.round(((totalSkus - lowStockCount) / totalSkus) * 100) : 100;

    return {
      totalOrders,
      inProgress,
      ordersInLocalWarehouse,
      awaitingFactory,
      ordersInCentralWarehouse,
      revenue,
      profit: totalPaid,
      inventoryHealth,
      fulfillmentRate,
      customerGrowth: customersCount,
      ordersByStatus: buildStatusCounts(orders),
      ordersPipeline: buildPipelineCounts(orders),
      industry,
    };
  });
}

export async function getOrdersForRole(
  profile: UserProfile,
  options: { balanced?: boolean; limit?: number } = {},
) {
  const industry = getActiveIndustry();
  const shouldBalance = options.balanced !== false;
  const requestedLimit = Number(options.limit);
  const sqlLimit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.trunc(requestedLimit), 5000)
      : 5000;

  const cacheKey = `orders:${industry}:${profile.role}:${profile.user_id}:${shouldBalance}:${sqlLimit}`;
  return getCached(cacheKey, 10_000, async () => {
    const wh = warehouseWhere(profile);
    if (wh === null) return [];

    const whereClause: Record<string, unknown> = { industry };
    if (wh) whereClause.warehouseId = wh;

    const rows = await prisma.order.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: shouldBalance
        ? profile.role === "admin"
          ? 100
          : 50
        : Math.min(sqlLimit, profile.role === "admin" ? 5000 : 1000),
      include: { customer: true },
    });

    return rows.map((r) => ({
      id: r.id,
      order_number: r.orderNumber,
      status: r.status,
      customer_name: r.customer?.name || "Unknown",
      customer_email: r.customer?.email || null,
      expected_delivery_date: r.expectedDelivery?.toISOString() || null,
      created_at: r.createdAt.toISOString(),
      order_value: r.totalAmount,
    }));
  });
}

export async function getInventoryForRole(profile: UserProfile) {
  const industry = getActiveIndustry();
  const cacheKey = `inventory:${industry}:${profile.role}:${profile.user_id}`;
  return getCached(cacheKey, 15_000, async () => {
    const wh = warehouseWhere(profile);
    if (wh === null) return [];

    const whereClause: Record<string, unknown> = { industry };
    if (wh) whereClause.warehouseId = wh;

    const stock = await prisma.inventoryMovement.groupBy({
      by: ["productId", "warehouseId"],
      where: whereClause,
      _sum: { quantity: true },
    });

    if (!stock || stock.length === 0) return [];

    const productIds = [...new Set(stock.map((s) => s.productId))];
    const warehouseIds = [...new Set(stock.map((s) => s.warehouseId))];

    const [products, warehouses] = await Promise.all([
      prisma.product.findMany({ where: { id: { in: productIds }, industry } }),
      prisma.warehouse.findMany({ where: { id: { in: warehouseIds }, industry } }),
    ]);

    const productMap = new Map(products.map((p) => [p.id, p]));
    const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));

    return stock.map((s) => {
      const product = productMap.get(s.productId);
      const warehouse = warehouseMap.get(s.warehouseId);

      return {
        id: `${s.warehouseId}-${s.productId}`,
        warehouse_id: s.warehouseId,
        warehouse_name: warehouse?.name || null,
        product_id: s.productId,
        available_qty: s._sum.quantity || 0,
        reorder_level: 30,
        updated_at: new Date().toISOString(),
        products: product
          ? {
              name: product.name,
              sku: product.sku,
              cost: product.cost,
            }
          : null,
      };
    });
  });
}

export async function getAlerts(profile: UserProfile) {
  const industry = getActiveIndustry();
  const cacheKey = `alerts:${industry}:${profile.role}:${profile.user_id}`;
  return getCached(cacheKey, 20_000, async () => {
    const alerts: Array<{
      id: string;
      title: string;
      severity: "low" | "medium" | "high" | "critical";
      status: string;
      created_at: string;
    }> = [];

    try {
      const wh = warehouseWhere(profile);
      const orderWhere: Record<string, unknown> = {
        industry,
        OR: [
          { status: "DELAYED" },
          {
            expectedDelivery: { lt: new Date() },
            status: { notIn: ["DELIVERED", "CANCELLED"] },
          },
        ],
      };
      if (wh) orderWhere.warehouseId = wh;
      if (wh === null) return [];

      const stockWhere: Record<string, unknown> = { industry };
      if (wh) stockWhere.warehouseId = wh;

      const [delayedOrders, stockMovements, allInvoices] = await Promise.all([
        prisma.order.findMany({ where: orderWhere, select: { id: true } }),
        prisma.inventoryMovement.groupBy({
          by: ["productId", "warehouseId"],
          where: stockWhere,
          _sum: { quantity: true },
        }),
        prisma.invoice.findMany({
          where: { industry, status: { in: ["OVERDUE", "UNPAID"] } },
          select: { amount: true, status: true },
        }),
      ]);

      if (delayedOrders.length > 0) {
        alerts.push({
          id: `delayed-${industry}`,
          title: `Delayed Orders: ${delayedOrders.length} order(s) past delivery date`,
          severity: delayedOrders.length > 5 ? "critical" : "high",
          status: "active",
          created_at: new Date().toISOString(),
        });
      }

      const lowStockItems = stockMovements.filter(
        (m) => (m._sum.quantity || 0) < 30 && (m._sum.quantity || 0) > 0,
      );
      const outOfStockItems = stockMovements.filter((m) => (m._sum.quantity || 0) <= 0);

      if (outOfStockItems.length > 0) {
        alerts.push({
          id: `out-of-stock-${industry}`,
          title: `Out of Stock: ${outOfStockItems.length} product(s) unavailable`,
          severity: "critical",
          status: "active",
          created_at: new Date().toISOString(),
        });
      } else if (lowStockItems.length > 0) {
        alerts.push({
          id: `low-stock-${industry}`,
          title: `Low Stock: ${lowStockItems.length} product(s) below 30 units`,
          severity: "medium",
          status: "active",
          created_at: new Date().toISOString(),
        });
      }

      const overdueInvoices = allInvoices.filter((i) => i.status === "OVERDUE");
      if (overdueInvoices.length > 0) {
        const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + inv.amount, 0);
        alerts.push({
          id: `overdue-${industry}`,
          title: `Overdue Invoices: ${overdueInvoices.length} totaling ₹${totalOverdue.toLocaleString("en-IN")}`,
          severity: "high",
          status: "active",
          created_at: new Date().toISOString(),
        });
      }

      const unpaidInvoices = allInvoices.filter((i) => i.status === "UNPAID");
      if (unpaidInvoices.length > 3) {
        alerts.push({
          id: `unpaid-${industry}`,
          title: `Pending Payments: ${unpaidInvoices.length} unpaid invoice(s)`,
          severity: "low",
          status: "active",
          created_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Error fetching alerts:", error);
    }

    return alerts;
  });
}

export function roleLabel(role: AppRole) {
  if (role === "admin") return "Administrator";
  if (role === "analyst") return "Analyst";
  return "Manager";
}

export async function getCustomersForRole(profile: UserProfile) {
  const industry = getActiveIndustry();
  const cacheKey = `customers:${industry}:${profile.role}`;
  return getCached(cacheKey, 30_000, async () => {
    return await prisma.customer.findMany({
      where: { industry },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });
}

/** Deterministic operational tips for the Insights page (works without LLM). */
export async function getOperationalTips(
  profile: UserProfile,
): Promise<{ tips: OperationalTip[]; industry: IndustryId }> {
  const industry = getActiveIndustry();
  const cacheKey = `tips:${industry}:${profile.role}:${profile.user_id}`;

  return getCached(cacheKey, 20_000, async () => {
    const tips: OperationalTip[] = [];
    const wh = warehouseWhere(profile);
    if (wh === null) return { tips, industry };

    const orderWhere: Record<string, unknown> = { industry };
    if (wh) orderWhere.warehouseId = wh;

    const stockWhere: Record<string, unknown> = { industry };
    if (wh) stockWhere.warehouseId = wh;

    const fortyFiveDaysAgo = new Date();
    fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);

    const [delayedOrders, stockMovements, overdueInvoices, warehouses, inactiveCustomers, recentOrders] =
      await Promise.all([
        prisma.order.findMany({
          where: {
            ...orderWhere,
            OR: [
              { status: "DELAYED" },
              {
                expectedDelivery: { lt: new Date() },
                status: { notIn: ["DELIVERED", "CANCELLED"] },
              },
            ],
          },
          take: 50,
          include: { customer: true },
          orderBy: { expectedDelivery: "asc" },
        }),
        prisma.inventoryMovement.groupBy({
          by: ["productId", "warehouseId"],
          where: stockWhere,
          _sum: { quantity: true },
        }),
        prisma.invoice.findMany({
          where: { industry, status: "OVERDUE" },
          include: { order: { include: { customer: true } } },
          take: 40,
          orderBy: { amount: "desc" },
        }),
        prisma.warehouse.findMany({ where: { industry } }),
        prisma.customer.findMany({
          where: {
            industry,
            orders: { none: { industry, orderDate: { gte: fortyFiveDaysAgo } } },
          },
          take: 20,
        }),
        prisma.order.findMany({
          where: orderWhere,
          select: { status: true, warehouseId: true },
          take: 500,
        }),
      ]);

    if (delayedOrders.length > 0) {
      const sample = delayedOrders[0];
      tips.push({
        id: "chase-delays",
        severity: delayedOrders.length > 8 ? "critical" : "high",
        title: `Chase ${delayedOrders.length} delayed shipment${delayedOrders.length === 1 ? "" : "s"}`,
        why: "Orders past expected delivery hurt distributor SLA and invite escalations.",
        action: `Prioritize ${sample.orderNumber} for ${sample.customer?.name ?? "customer"} and clear the backlog today.`,
        askPrompt: "Show me all delayed orders with customers and expected delivery dates",
        evidence: `${delayedOrders.length} delayed · top: ${sample.orderNumber}`,
      });
    }

    const lowStock = stockMovements
      .filter((m) => (m._sum.quantity || 0) > 0 && (m._sum.quantity || 0) < 30)
      .sort((a, b) => (a._sum.quantity || 0) - (b._sum.quantity || 0));
    const outOfStock = stockMovements.filter((m) => (m._sum.quantity || 0) <= 0);

    if (outOfStock.length > 0 || lowStock.length > 0) {
      const count = outOfStock.length + lowStock.length;
      const productIds = [...new Set([...outOfStock, ...lowStock].slice(0, 8).map((s) => s.productId))];
      const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
      const names = products.map((p) => p.sku).slice(0, 3).join(", ");
      tips.push({
        id: "reorder-stock",
        severity: outOfStock.length > 0 ? "critical" : "medium",
        title: `Reorder ${count} low / out-of-stock SKU${count === 1 ? "" : "s"}`,
        why: "Stockouts block dispatch and force factory escalations.",
        action: `Raise replenishment for ${names || "critical SKUs"} before next dispatch window.`,
        askPrompt: "Show low stock products below 30 units across warehouses",
        evidence: `${outOfStock.length} OOS · ${lowStock.length} low`,
      });
    }

    if (overdueInvoices.length > 0) {
      const total = overdueInvoices.reduce((s, i) => s + i.amount, 0);
      const top = overdueInvoices[0];
      tips.push({
        id: "collect-ar",
        severity: total > 500_000 ? "high" : "medium",
        title: `Collect AR on ${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? "" : "s"}`,
        why: "Overdue receivables freeze working capital and credit for new orders.",
        action: `Start with ${top.order?.customer?.name ?? "top account"} (${top.invoiceNumber}).`,
        askPrompt: "Show overdue invoices with customer names and amounts",
        evidence: `₹${Math.round(total).toLocaleString("en-IN")} overdue`,
      });
    }

    if (inactiveCustomers.length > 0) {
      tips.push({
        id: "reengage",
        severity: "low",
        title: `Re-engage ${inactiveCustomers.length} quiet account${inactiveCustomers.length === 1 ? "" : "s"}`,
        why: "No orders in 45+ days — churn risk for distributors/dealers.",
        action: `Call ${inactiveCustomers[0].name} with a replenishment offer on top movers.`,
        askPrompt: "Which customers have been inactive with no recent orders?",
        evidence: inactiveCustomers
          .slice(0, 3)
          .map((c) => c.name)
          .join(", "),
      });
    }

    if (warehouses.length >= 2 && stockMovements.length > 0) {
      const byWh = new Map<string, number>();
      for (const m of stockMovements) {
        byWh.set(m.warehouseId, (byWh.get(m.warehouseId) || 0) + (m._sum.quantity || 0));
      }
      const ranked = [...byWh.entries()].sort((a, b) => b[1] - a[1]);
      if (ranked.length >= 2 && ranked[0][1] > ranked[ranked.length - 1][1] * 2.5) {
        const rich = warehouses.find((w) => w.id === ranked[0][0]);
        const thin = warehouses.find((w) => w.id === ranked[ranked.length - 1][0]);
        tips.push({
          id: "balance-hubs",
          severity: "medium",
          title: "Balance stock across hubs",
          why: "One warehouse holds far more on-hand quantity than another — transfer risk and delay risk.",
          action: `Review transfer from ${rich?.name ?? "high hub"} toward ${thin?.name ?? "low hub"}.`,
          askPrompt: "Compare warehouse inventory levels and highlight imbalances",
          evidence: `${rich?.name ?? "Hub A"} vs ${thin?.name ?? "Hub B"}`,
        });
      }
    }

    const delivered = recentOrders.filter((o) => o.status === "DELIVERED").length;
    const fulfillment = recentOrders.length > 0 ? delivered / recentOrders.length : 1;
    if (recentOrders.length > 40 && fulfillment < 0.55) {
      tips.push({
        id: "fulfillment",
        severity: "high",
        title: "Lift fulfillment rate",
        why: `Only ${(fulfillment * 100).toFixed(1)}% of recent orders are delivered.`,
        action: "Clear PROCESSING backlog and escalate DELAYED lines before committing new load.",
        askPrompt: "Summarize order pipeline by status and what is blocking fulfillment",
        evidence: `${delivered}/${recentOrders.length} delivered`,
      });
    }

    const severityRank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    tips.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

    return { tips, industry };
  });
}
