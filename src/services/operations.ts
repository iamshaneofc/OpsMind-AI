import type { AppRole, UserProfile } from "@/types/auth";
import { prisma } from "@/lib/db";
import { getCached } from "@/lib/cache";
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
  profit: number;
  inventoryHealth: number;
  fulfillmentRate: number;
  customerGrowth: number;
  ordersByStatus: Array<{ name: string; value: number }>;
  ordersPipeline: Array<{ name: string; value: number }>;
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

const emptyMetrics = (): DashboardMetrics => ({
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
});

export async function getDashboardMetrics(profile: UserProfile): Promise<DashboardMetrics> {
  return getCached(`metrics:${profile.role}:${profile.user_id}`, 15_000, async () => {
    // Run all independent queries in parallel
    const [orders, customersCount, allInvoices, inventoryMovements, totalSkus] = await Promise.all([
      getOrdersForRole(profile, { balanced: false, limit: 200 }),
      prisma.customer.count(),
      prisma.invoice.findMany({ where: { status: { in: ["PAID", "UNPAID", "OVERDUE"] } }, select: { amount: true, status: true } }),
      prisma.inventoryMovement.groupBy({ by: ['productId', 'warehouseId'], _sum: { quantity: true } }),
      prisma.product.count(),
    ]);

    if (!orders.length) {
      return { ...emptyMetrics(), customerGrowth: customersCount };
    }

    const totalOrders = orders.length;
    const inProgress = orders.filter((o) => isOrdersInProgressStatus(o.status)).length;
    const ordersInLocalWarehouse = orders.filter((o) => isOrdersLocalWarehouseStatus(o.status)).length;
    const awaitingFactory = orders.filter((o) => isOrdersAwaitingFactoryStatus(o.status)).length;
    const ordersInCentralWarehouse = orders.filter((o) => isOrdersCentralWarehouseStatus(o.status)).length;

    const revenue = orders.reduce((sum, order) => sum + (order.order_value || 0), 0);
    const deliveredCount = orders.filter(o => o.status === "DELIVERED").length;
    const fulfillmentRate = totalOrders > 0 ? (deliveredCount / totalOrders) * 100 : 0;

    // Compute from single invoice query
    const totalPaid = allInvoices.filter(i => i.status === "PAID").reduce((sum, inv) => sum + inv.amount, 0);

    // Compute inventory health
    const lowStockCount = inventoryMovements.filter(m => (m._sum.quantity || 0) < 30).length;
    const inventoryHealth = totalSkus > 0
      ? Math.round(((totalSkus - lowStockCount) / totalSkus) * 100)
      : 100;

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
    };
  });
}

export async function getOrdersForRole(
  profile: UserProfile,
  options: { balanced?: boolean; limit?: number } = {},
) {
  const shouldBalance = options.balanced !== false;
  const requestedLimit = Number(options.limit);
  const sqlLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(Math.trunc(requestedLimit), 5000)
    : 5000;

  const cacheKey = `orders:${profile.role}:${profile.user_id}:${shouldBalance}:${sqlLimit}`;
  return getCached(cacheKey, 10_000, async () => {
    let whereClause: any = {};
    if (profile.role === "manager" && profile.company_id) {
      // For V1 demo purposes, we can link manager to specific customers if needed, otherwise fetch all
    } else if (profile.role === "analyst" && profile.warehouse_id) {
      whereClause.warehouseId = String(profile.warehouse_id);
    }

    const rows = await prisma.order.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: shouldBalance ? (profile.role === "admin" ? 100 : 50) : Math.min(sqlLimit, profile.role === "admin" ? 5000 : 1000),
      include: { customer: true }
    });

    return rows.map(r => ({
      id: r.id,
      order_number: r.orderNumber,
      status: r.status,
      customer_name: r.customer?.name || "Unknown",
      customer_email: r.customer?.email || null,
      expected_delivery_date: r.expectedDelivery?.toISOString() || null,
      created_at: r.createdAt.toISOString(),
      order_value: r.totalAmount
    }));
  });
}

export async function getInventoryForRole(profile: UserProfile) {
  const cacheKey = `inventory:${profile.role}:${profile.user_id}`;
  return getCached(cacheKey, 15_000, async () => {
    let whereClause: any = {};
    if (profile.role === "analyst" && profile.warehouse_id) {
      whereClause.warehouseId = String(profile.warehouse_id);
    }

    const stock = await prisma.inventoryMovement.groupBy({
      by: ['productId', 'warehouseId'],
      where: whereClause,
      _sum: { quantity: true },
    });

    if (!stock || stock.length === 0) return [];

    const productIds = [...new Set(stock.map(s => s.productId))];
    const warehouseIds = [...new Set(stock.map(s => s.warehouseId))];

    const [products, warehouses] = await Promise.all([
      prisma.product.findMany({ where: { id: { in: productIds } } }),
      prisma.warehouse.findMany({ where: { id: { in: warehouseIds } } }),
    ]);

    const productMap = new Map(products.map(p => [p.id, p]));
    const warehouseMap = new Map(warehouses.map(w => [w.id, w]));

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
        products: product ? {
          name: product.name,
          sku: product.sku,
          cost: product.cost
        } : null
      };
    });
  });
}

export async function getAlerts(profile: UserProfile) {
  const cacheKey = `alerts:${profile.role}:${profile.user_id}`;
  return getCached(cacheKey, 20_000, async () => {
    const alerts: Array<{ id: string; title: string; severity: "low" | "medium" | "high" | "critical"; status: string; created_at: string }> = [];

    try {
      const [delayedOrders, stockMovements, allInvoices] = await Promise.all([
        prisma.order.findMany({
          where: {
            OR: [
              { status: 'DELAYED' },
              { expectedDelivery: { lt: new Date() }, status: { notIn: ['DELIVERED', 'CANCELLED'] } }
            ]
          },
          select: { id: true }
        }),
        prisma.inventoryMovement.groupBy({
          by: ['productId', 'warehouseId'],
          _sum: { quantity: true },
        }),
        prisma.invoice.findMany({
          where: { status: { in: ['OVERDUE', 'UNPAID'] } },
          select: { amount: true, status: true }
        }),
      ]);

      if (delayedOrders.length > 0) {
        alerts.push({
          id: `delayed-${Date.now()}`,
          title: `Delayed Orders: ${delayedOrders.length} order(s) past delivery date`,
          severity: delayedOrders.length > 5 ? "critical" : "high",
          status: "active",
          created_at: new Date().toISOString()
        });
      }

      const lowStockItems = stockMovements.filter(m => (m._sum.quantity || 0) < 30 && (m._sum.quantity || 0) > 0);
      const outOfStockItems = stockMovements.filter(m => (m._sum.quantity || 0) <= 0);

      if (outOfStockItems.length > 0) {
        alerts.push({
          id: `out-of-stock-${Date.now()}`,
          title: `Out of Stock: ${outOfStockItems.length} product(s) unavailable`,
          severity: "critical",
          status: "active",
          created_at: new Date().toISOString()
        });
      } else if (lowStockItems.length > 0) {
        alerts.push({
          id: `low-stock-${Date.now()}`,
          title: `Low Stock: ${lowStockItems.length} product(s) below 30 units`,
          severity: "medium",
          status: "active",
          created_at: new Date().toISOString()
        });
      }

      const overdueInvoices = allInvoices.filter(i => i.status === 'OVERDUE');
      if (overdueInvoices.length > 0) {
        const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + inv.amount, 0);
        alerts.push({
          id: `overdue-${Date.now()}`,
          title: `Overdue Invoices: ${overdueInvoices.length} totaling ₹${totalOverdue.toLocaleString()}`,
          severity: "high",
          status: "active",
          created_at: new Date().toISOString()
        });
      }

      const unpaidInvoices = allInvoices.filter(i => i.status === 'UNPAID');
      if (unpaidInvoices.length > 3) {
        alerts.push({
          id: `unpaid-${Date.now()}`,
          title: `Pending Payments: ${unpaidInvoices.length} unpaid invoice(s)`,
          severity: "low",
          status: "active",
          created_at: new Date().toISOString()
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
  const cacheKey = `customers:${profile.role}`;
  return getCached(cacheKey, 30_000, async () => {
    return await prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100
    });
  });
}
