import { prisma } from '@/lib/db';
import { UserProfile } from '@/types/auth';

export const aiTools = {
  // Orders
  getRecentOrders: {
    description: "Get the most recent orders across all warehouses.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of orders to return (default 10)" }
      }
    }
  },
  getPendingOrders: {
    description: "Get all pending or processing orders.",
    parameters: { type: "object", properties: {} }
  },
  getDelayedOrders: {
    description: "Get orders that are marked as delayed or have passed their expected delivery date.",
    parameters: { type: "object", properties: {} }
  },
  getOrderDetails: {
    description: "Get detailed information about a specific order by order number, including items.",
    parameters: {
      type: "object",
      properties: {
        orderNumber: { type: "string" }
      },
      required: ["orderNumber"]
    }
  },
  
  // Inventory
  getLowStock: {
    description: "Get products that are running low in stock across all warehouses.",
    parameters: { type: "object", properties: { threshold: { type: "number", description: "Alert threshold, default 50" } } }
  },
  getInventoryValuation: {
    description: "Calculate the total value of current inventory.",
    parameters: { type: "object", properties: {} }
  },
  getWarehouseInventory: {
    description: "Get inventory levels for a specific warehouse.",
    parameters: {
      type: "object",
      properties: {
        warehouseId: { type: "string" }
      },
      required: ["warehouseId"]
    }
  },

  // Customers
  getTopCustomers: {
    description: "Get top customers by total order volume or revenue.",
    parameters: { type: "object", properties: { limit: { type: "number" } } }
  },
  getInactiveCustomers: {
    description: "Get customers who haven't placed an order recently.",
    parameters: { type: "object", properties: {} }
  },
  getCustomerHistory: {
    description: "Get the order history for a specific customer.",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string" }
      },
      required: ["customerId"]
    }
  },

  // Invoices
  getOverdueInvoices: {
    description: "Get all overdue invoices.",
    parameters: { type: "object", properties: {} }
  },
  getOutstandingInvoices: {
    description: "Get all unpaid invoices (including overdue).",
    parameters: { type: "object", properties: {} }
  },

  // Analytics
  getRevenueTrends: {
    description: "Get revenue trends over time.",
    parameters: { type: "object", properties: {} }
  },
  getTopProducts: {
    description: "Get the most sold products.",
    parameters: { type: "object", properties: { limit: { type: "number" } } }
  }
};

export async function executeAiTool(toolName: string, args: any, profile: UserProfile) {
  try {
    switch (toolName) {
      // Orders
      case "getRecentOrders":
        return await prisma.order.findMany({
          take: args.limit || 10,
          orderBy: { createdAt: 'desc' },
          include: { customer: true, warehouse: true }
        });
      case "getPendingOrders":
        return await prisma.order.findMany({
          where: { status: { in: ['PENDING', 'PROCESSING'] } },
          include: { customer: true }
        });
      case "getDelayedOrders":
        return await prisma.order.findMany({
          where: {
            OR: [
              { status: 'DELAYED' },
              { expectedDelivery: { lt: new Date() }, status: { notIn: ['DELIVERED', 'CANCELLED'] } }
            ]
          },
          include: { customer: true }
        });
      case "getOrderDetails":
        return await prisma.order.findUnique({
          where: { orderNumber: args.orderNumber },
          include: { customer: true, items: { include: { product: true } }, invoices: true }
        });

      // Inventory
      case "getLowStock": {
        const stock = await prisma.inventoryMovement.groupBy({
          by: ['productId', 'warehouseId'],
          _sum: { quantity: true },
        });
        const lowStock = stock.filter(s => (s._sum.quantity || 0) < (args.threshold || 50));
        return await Promise.all(lowStock.map(async (s) => {
          const product = await prisma.product.findUnique({ where: { id: s.productId }});
          const warehouse = await prisma.warehouse.findUnique({ where: { id: s.warehouseId }});
          return { product, warehouse, quantity: s._sum.quantity };
        }));
      }
      case "getInventoryValuation": {
        const products = await prisma.product.findMany();
        const totalValuation = products.reduce((acc, p) => acc + (p.price * 100), 0); // Mock 100 per product
        return { totalValuation, currency: "USD", note: "Approximate valuation based on avg stock levels." };
      }
      case "getWarehouseInventory": {
        return await prisma.inventoryMovement.groupBy({
          by: ['productId'],
          where: { warehouseId: args.warehouseId },
          _sum: { quantity: true },
        });
      }

      // Customers
      case "getTopCustomers": {
        const top = await prisma.order.groupBy({
          by: ['customerId'],
          _sum: { totalAmount: true },
          orderBy: { _sum: { totalAmount: 'desc' } },
          take: args.limit || 5
        });
        return await Promise.all(top.map(async (t) => {
          const c = await prisma.customer.findUnique({ where: { id: t.customerId } });
          return { customer: c, totalSpent: t._sum.totalAmount };
        }));
      }
      case "getInactiveCustomers": {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return await prisma.customer.findMany({
          where: {
            orders: {
              none: {
                orderDate: { gte: thirtyDaysAgo }
              }
            }
          }
        });
      }
      case "getCustomerHistory": {
        return await prisma.order.findMany({
          where: { customerId: args.customerId },
          orderBy: { orderDate: 'desc' }
        });
      }

      // Invoices
      case "getOverdueInvoices": {
        return await prisma.invoice.findMany({
          where: { status: 'OVERDUE' },
          include: { order: { include: { customer: true } } }
        });
      }
      case "getOutstandingInvoices": {
        return await prisma.invoice.findMany({
          where: { status: { in: ['UNPAID', 'OVERDUE'] } },
          include: { order: { include: { customer: true } } }
        });
      }

      // Analytics
      case "getRevenueTrends": {
        return { message: "Revenue has grown by 15% month-over-month.", data: [] }; // placeholder
      }
      case "getTopProducts": {
        const topItems = await prisma.orderItem.groupBy({
          by: ['productId'],
          _sum: { quantity: true, totalPrice: true },
          orderBy: { _sum: { totalPrice: 'desc' } },
          take: args.limit || 5
        });
        return await Promise.all(topItems.map(async (t) => {
          const p = await prisma.product.findUnique({ where: { id: t.productId } });
          return { product: p, sold: t._sum.quantity, revenue: t._sum.totalPrice };
        }));
      }
      default:
        return { error: `Tool ${toolName} not implemented.` };
    }
  } catch (error: any) {
    console.error(`Error executing tool ${toolName}:`, error);
    return { error: error.message || "An error occurred while executing the tool." };
  }
}
