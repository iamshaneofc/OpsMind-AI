import { prisma } from "@/lib/db";
import { UserProfile } from "@/types/auth";
import { getIndustryMeta, type IndustryId } from "@/lib/industry";
import { getActiveIndustry } from "@/lib/industry-server";
import {
  formatInvoicesForBot,
  formatLowStockForBot,
  formatOrderDetailsForBot,
  formatOrdersForBot,
  formatTopCustomersForBot,
  formatTopProductsForBot,
} from "@/lib/ai-tool-format";

export const aiTools = {
  getRecentOrders: {
    description:
      "Get the most recent orders for the active industry (CHEM-/AUTO-/PHAR-/AGRI-). Returns customer, warehouse, amount, dates.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of orders to return (default 10)" },
      },
    },
  },
  getPendingOrders: {
    description: "Get PENDING and PROCESSING orders waiting to be fulfilled.",
    parameters: { type: "object", properties: {} },
  },
  getDelayedOrders: {
    description:
      "Get DELAYED orders or past expected delivery — use for SLA chase. Includes daysLate and customer names.",
    parameters: { type: "object", properties: {} },
  },
  getOrderDetails: {
    description:
      "Get one order by order number (e.g. CHEM-1042, AUTO-1042) with line items and invoices.",
    parameters: {
      type: "object",
      properties: { orderNumber: { type: "string" } },
      required: ["orderNumber"],
    },
  },
  getLowStock: {
    description: "Products below stock threshold across hubs (SKU, product, warehouse, onHand).",
    parameters: {
      type: "object",
      properties: {
        threshold: { type: "number", description: "Alert threshold, default 50" },
      },
    },
  },
  getInventoryValuation: {
    description: "Total on-hand inventory value for the active industry in INR.",
    parameters: { type: "object", properties: {} },
  },
  getWarehouseInventory: {
    description:
      "Inventory for a warehouse. Pass warehouseId OR warehouseName (e.g. 'Mumbai Hub', 'Western Region Hub').",
    parameters: {
      type: "object",
      properties: {
        warehouseId: { type: "string" },
        warehouseName: {
          type: "string",
          description: "Warehouse / hub name if id unknown",
        },
      },
    },
  },
  getTopCustomers: {
    description: "Top distributors/dealers/hospitals by revenue.",
    parameters: { type: "object", properties: { limit: { type: "number" } } },
  },
  getInactiveCustomers: {
    description: "Customers with no orders in the last 30 days (re-engagement list).",
    parameters: { type: "object", properties: {} },
  },
  getCustomerHistory: {
    description:
      "Order history for a customer. Pass customerId OR customerName (partial match ok).",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string" },
        customerName: { type: "string" },
      },
    },
  },
  getOverdueInvoices: {
    description: "OVERDUE invoices for AR chase with customer and daysOverdue.",
    parameters: { type: "object", properties: {} },
  },
  getOutstandingInvoices: {
    description: "UNPAID + OVERDUE invoices.",
    parameters: { type: "object", properties: {} },
  },
  getRevenueTrends: {
    description: "Collected revenue from PAID invoices for the active industry.",
    parameters: { type: "object", properties: {} },
  },
  getTopProducts: {
    description: "Best-selling SKUs by revenue.",
    parameters: { type: "object", properties: { limit: { type: "number" } } },
  },
  getOperationalTips: {
    description:
      "Prioritized tips for today: delays, low stock, overdue AR, inactive accounts, hub imbalance.",
    parameters: { type: "object", properties: {} },
  },
  listWarehouses: {
    description: "List warehouses/hubs in the active industry with ids and names.",
    parameters: { type: "object", properties: {} },
  },
};

async function resolveWarehouseId(
  industry: IndustryId,
  warehouseId?: string,
  warehouseName?: string,
) {
  if (warehouseId) {
    const byId = await prisma.warehouse.findFirst({
      where: { id: warehouseId, industry },
    });
    if (byId) return byId;
  }
  if (warehouseName) {
    const byName = await prisma.warehouse.findFirst({
      where: {
        industry,
        name: { contains: warehouseName, mode: "insensitive" },
      },
    });
    if (byName) return byName;
  }
  return null;
}

async function runTool(
  toolName: string,
  args: Record<string, unknown>,
  profile: UserProfile,
  industry: IndustryId,
) {
  const meta = getIndustryMeta(industry);
  try {
    switch (toolName) {
      case "getRecentOrders": {
        const rows = await prisma.order.findMany({
          where: { industry },
          take: (args.limit as number) || 10,
          orderBy: { createdAt: "desc" },
          include: { customer: true, warehouse: true },
        });
        return {
          industry,
          count: rows.length,
          orders: formatOrdersForBot(rows, industry),
        };
      }
      case "getPendingOrders": {
        const rows = await prisma.order.findMany({
          where: { industry, status: { in: ["PENDING", "PROCESSING"] } },
          include: { customer: true, warehouse: true },
          take: 25,
          orderBy: { createdAt: "desc" },
        });
        return {
          industry,
          count: rows.length,
          orders: formatOrdersForBot(rows, industry),
        };
      }
      case "getDelayedOrders": {
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
          include: { customer: true, warehouse: true },
          take: 25,
          orderBy: { expectedDelivery: "asc" },
        });
        return {
          industry,
          count: rows.length,
          orders: formatOrdersForBot(rows, industry),
        };
      }
      case "getOrderDetails": {
        const order = await prisma.order.findFirst({
          where: { orderNumber: args.orderNumber as string, industry },
          include: {
            customer: true,
            warehouse: true,
            items: { include: { product: true } },
            invoices: true,
          },
        });
        if (!order) {
          return {
            error: `No order ${args.orderNumber} in ${meta.label} dataset. Try ${meta.exampleOrders.join(", ")}.`,
          };
        }
        return formatOrderDetailsForBot(order, industry);
      }

      case "getLowStock": {
        const stock = await prisma.inventoryMovement.groupBy({
          by: ["productId", "warehouseId"],
          where: { industry },
          _sum: { quantity: true },
        });
        const threshold = (args.threshold as number) || 50;
        const lowStock = stock
          .filter((s) => (s._sum.quantity || 0) < threshold)
          .sort((a, b) => (a._sum.quantity || 0) - (b._sum.quantity || 0));

        const productIds = [...new Set(lowStock.map((s) => s.productId))];
        const warehouseIds = [...new Set(lowStock.map((s) => s.warehouseId))];
        const [products, warehouses] = await Promise.all([
          prisma.product.findMany({ where: { id: { in: productIds }, industry } }),
          prisma.warehouse.findMany({ where: { id: { in: warehouseIds }, industry } }),
        ]);
        const productMap = new Map(products.map((p) => [p.id, p]));
        const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));

        const rows = lowStock.slice(0, 25).map((s) => ({
          product: productMap.get(s.productId) || null,
          warehouse: warehouseMap.get(s.warehouseId) || null,
          quantity: s._sum.quantity,
        }));
        return {
          industry,
          threshold,
          count: rows.length,
          unit: meta.unit,
          items: formatLowStockForBot(rows, industry),
        };
      }
      case "getInventoryValuation": {
        const stockMovements = await prisma.inventoryMovement.groupBy({
          by: ["productId"],
          where: { industry },
          _sum: { quantity: true },
        });
        const products = await prisma.product.findMany({
          where: { id: { in: stockMovements.map((s) => s.productId) }, industry },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));

        let totalValuation = 0;
        for (const movement of stockMovements) {
          const product = productMap.get(movement.productId);
          if (product) {
            totalValuation +=
              (movement._sum.quantity || 0) * (product.cost || product.price);
          }
        }
        return {
          industry,
          totalValuation,
          totalValuationFormatted: new Intl.NumberFormat(meta.locale, {
            style: "currency",
            currency: meta.currency,
            maximumFractionDigits: 0,
          }).format(totalValuation),
          currency: meta.currency,
          currencySymbol: meta.currencySymbol,
          unit: meta.unit,
        };
      }
      case "getWarehouseInventory":
      case "listWarehouses": {
        if (toolName === "listWarehouses") {
          const list = await prisma.warehouse.findMany({
            where: { industry },
            orderBy: { name: "asc" },
          });
          return {
            industry,
            warehouses: list.map((w) => ({
              id: w.id,
              name: w.name,
              location: w.location,
            })),
          };
        }
        const warehouse = await resolveWarehouseId(
          industry,
          args.warehouseId as string | undefined,
          args.warehouseName as string | undefined,
        );
        if (!warehouse) {
          const list = await prisma.warehouse.findMany({
            where: { industry },
            select: { id: true, name: true },
          });
          return {
            error: "Warehouse not found. Use one of these names:",
            warehouses: list,
          };
        }
        const stock = await prisma.inventoryMovement.groupBy({
          by: ["productId"],
          where: { warehouseId: warehouse.id, industry },
          _sum: { quantity: true },
        });
        const products = await prisma.product.findMany({
          where: { id: { in: stock.map((s) => s.productId) }, industry },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));
        const items = stock
          .map((s) => ({
            sku: productMap.get(s.productId)?.sku ?? null,
            product: productMap.get(s.productId)?.name ?? "Unknown",
            onHand: s._sum.quantity || 0,
            unit: meta.unit,
          }))
          .sort((a, b) => a.onHand - b.onHand)
          .slice(0, 40);
        return {
          warehouse: { id: warehouse.id, name: warehouse.name, location: warehouse.location },
          unit: meta.unit,
          count: items.length,
          items,
        };
      }

      case "getTopCustomers": {
        const top = await prisma.order.groupBy({
          by: ["customerId"],
          where: { industry },
          _sum: { totalAmount: true },
          _count: { id: true },
          orderBy: { _sum: { totalAmount: "desc" } },
          take: (args.limit as number) || 5,
        });
        const customers = await prisma.customer.findMany({
          where: { id: { in: top.map((t) => t.customerId) }, industry },
        });
        const customerMap = new Map(customers.map((c) => [c.id, c]));
        const rows = top.map((t) => ({
          customer: customerMap.get(t.customerId) || null,
          totalSpent: t._sum.totalAmount,
          orderCount: t._count.id,
        }));
        return {
          industry,
          customers: formatTopCustomersForBot(rows, industry),
        };
      }
      case "getInactiveCustomers": {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const rows = await prisma.customer.findMany({
          where: {
            industry,
            orders: {
              none: { industry, orderDate: { gte: thirtyDaysAgo } },
            },
          },
          take: 20,
          orderBy: { name: "asc" },
        });
        return {
          industry,
          count: rows.length,
          customers: rows.map((c) => ({
            id: c.id,
            name: c.name,
            location: c.location,
            status: c.status,
            email: c.email,
          })),
        };
      }
      case "getCustomerHistory": {
        let customerId = args.customerId as string | undefined;
        if (!customerId && args.customerName) {
          const match = await prisma.customer.findFirst({
            where: {
              industry,
              name: { contains: String(args.customerName), mode: "insensitive" },
            },
          });
          customerId = match?.id;
          if (!match) {
            return { error: `No customer matching "${args.customerName}" in ${meta.label}.` };
          }
        }
        if (!customerId) {
          return { error: "Provide customerId or customerName." };
        }
        const customer = await prisma.customer.findFirst({
          where: { id: customerId, industry },
        });
        const rows = await prisma.order.findMany({
          where: { customerId, industry },
          orderBy: { orderDate: "desc" },
          include: { warehouse: true, customer: true },
          take: 25,
        });
        return {
          customer: customer
            ? { id: customer.id, name: customer.name, location: customer.location }
            : null,
          count: rows.length,
          orders: formatOrdersForBot(rows, industry),
        };
      }

      case "getOverdueInvoices": {
        const rows = await prisma.invoice.findMany({
          where: { industry, status: "OVERDUE" },
          include: { order: { include: { customer: true } } },
          take: 25,
          orderBy: { amount: "desc" },
        });
        return {
          industry,
          count: rows.length,
          invoices: formatInvoicesForBot(rows, industry),
        };
      }
      case "getOutstandingInvoices": {
        const rows = await prisma.invoice.findMany({
          where: { industry, status: { in: ["UNPAID", "OVERDUE"] } },
          include: { order: { include: { customer: true } } },
          take: 25,
          orderBy: { dueDate: "asc" },
        });
        return {
          industry,
          count: rows.length,
          invoices: formatInvoicesForBot(rows, industry),
        };
      }

      case "getRevenueTrends": {
        const paidInvoices = await prisma.invoice.findMany({
          where: { industry, status: "PAID" },
          take: 500,
        });
        const totalRevenue = paidInvoices.reduce((sum, inv) => sum + inv.amount, 0);
        return {
          industry,
          totalRevenue,
          totalRevenueFormatted: new Intl.NumberFormat(meta.locale, {
            style: "currency",
            currency: meta.currency,
            maximumFractionDigits: 0,
          }).format(totalRevenue),
          currency: meta.currency,
          currencySymbol: meta.currencySymbol,
          invoiceCount: paidInvoices.length,
        };
      }
      case "getTopProducts": {
        const industryProducts = await prisma.product.findMany({
          where: { industry },
          select: { id: true },
        });
        const topItems = await prisma.orderItem.groupBy({
          by: ["productId"],
          where: { productId: { in: industryProducts.map((p) => p.id) } },
          _sum: { quantity: true, totalPrice: true },
          orderBy: { _sum: { totalPrice: "desc" } },
          take: (args.limit as number) || 5,
        });
        const products = await prisma.product.findMany({
          where: { id: { in: topItems.map((t) => t.productId) } },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));
        const rows = topItems.map((t) => ({
          product: productMap.get(t.productId) || null,
          sold: t._sum.quantity,
          revenue: t._sum.totalPrice,
        }));
        return {
          industry,
          products: formatTopProductsForBot(rows, industry),
        };
      }
      case "getOperationalTips": {
        const { getOperationalTips } = await import("@/services/operations");
        return await getOperationalTips(profile);
      }
      default:
        return { error: `Tool ${toolName} not implemented.` };
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An error occurred while executing the tool.";
    console.error(`Error executing tool ${toolName}:`, error);
    return { error: message };
  }
}

const SCOPABLE_TOOLS = new Set(Object.keys(aiTools));

const ADMIN_ONLY_MESSAGE = "This analysis is restricted to administrators.";

function recordWarehouseId(item: any): string | null {
  return item?.warehouseId ?? item?.warehouse?.id ?? item?.order?.warehouseId ?? null;
}

function applyWarehouseScope(result: any, warehouseId: string) {
  if (Array.isArray(result)) {
    return result.filter((item) => recordWarehouseId(item) === warehouseId);
  }
  if (result && typeof result === "object") {
    if ("tips" in result || "customers" in result || "invoices" in result || "orders" in result) {
      return result;
    }
    if ("items" in result && "warehouse" in result) {
      return result.warehouse?.id === warehouseId ? result : null;
    }
    const rec = recordWarehouseId(result);
    if (rec === null) return result;
    return rec === warehouseId ? result : null;
  }
  return { error: ADMIN_ONLY_MESSAGE };
}

export async function executeAiTool(
  toolName: string,
  args: Record<string, unknown>,
  profile: UserProfile,
  industryOverride?: IndustryId,
) {
  const industry = industryOverride ?? getActiveIndustry();

  if (profile.role === "admin") {
    return runTool(toolName, args, profile, industry);
  }

  if (!SCOPABLE_TOOLS.has(toolName)) {
    return { error: ADMIN_ONLY_MESSAGE };
  }

  const warehouseId = profile.warehouse_id ? String(profile.warehouse_id) : "";
  if (!warehouseId) {
    return runTool(toolName, args, profile, industry);
  }

  const scopedArgs =
    toolName === "getWarehouseInventory" ? { ...args, warehouseId } : args;

  try {
    const result = await runTool(toolName, scopedArgs, profile, industry);
    if (result && typeof result === "object" && "error" in (result as object)) {
      return result;
    }
    return applyWarehouseScope(result, warehouseId);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An error occurred while executing the tool.";
    console.error(`Error executing tool ${toolName}:`, error);
    return { error: message };
  }
}
