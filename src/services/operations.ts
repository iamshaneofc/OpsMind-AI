import type { AppRole, UserProfile } from "@/types/auth";
import { prisma } from "@/lib/db";
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
  ordersByStatus: [],
  ordersPipeline: [],
});

export async function getDashboardMetrics(profile: UserProfile): Promise<DashboardMetrics> {
  const orders = await getOrdersForRole(profile, { balanced: false, limit: 5000 });
  if (!orders.length) {
    return emptyMetrics();
  }
  const totalOrders = orders.length;
  const inProgress = orders.filter((o) => isOrdersInProgressStatus(o.status)).length;
  const ordersInLocalWarehouse = orders.filter((o) => isOrdersLocalWarehouseStatus(o.status)).length;
  const awaitingFactory = orders.filter((o) => isOrdersAwaitingFactoryStatus(o.status)).length;
  const ordersInCentralWarehouse = orders.filter((o) => isOrdersCentralWarehouseStatus(o.status)).length;
  return {
    totalOrders,
    inProgress,
    ordersInLocalWarehouse,
    awaitingFactory,
    ordersInCentralWarehouse,
    ordersByStatus: buildStatusCounts(orders),
    ordersPipeline: buildPipelineCounts(orders),
  };
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
    expected_delivery_date: r.expectedDelivery?.toISOString() || null,
    created_at: r.createdAt.toISOString(),
    order_value: r.totalAmount
  }));
}

export async function getInventoryForRole(profile: UserProfile) {
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

  return await Promise.all(stock.map(async (s) => {
    const product = await prisma.product.findUnique({ where: { id: s.productId } });
    const warehouse = await prisma.warehouse.findUnique({ where: { id: s.warehouseId } });
    
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
        sku: product.sku
      } : null
    };
  }));
}

export async function getAlerts(profile: UserProfile) {
  return [];
}

export function roleLabel(role: AppRole) {
  if (role === "admin") return "Administrator";
  if (role === "analyst") return "Analyst";
  return "Manager";
}

export async function getCustomersForRole(profile: UserProfile) {
  // Can filter by company_id or warehouse_id if we want, but since they're global customers in this demo:
  return await prisma.customer.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100
  });
}
