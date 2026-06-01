import type { UserProfile } from "@/types/auth";
import { getDistributorSqlAccountIds } from "@/lib/distributor-sql-accounts";
import { createSupabaseAdminClient } from "@/supabase/admin";
import { getSupabaseEnv } from "@/supabase/env";
import { createSupabaseServerClient } from "@/supabase/server";
import { isSqlServerDataEnabled } from "@/sql-server/config";
import * as sqlServerOps from "@/sql-server/operations";
import { buildLaneAOrderSnapshot } from "@/sql-server/lane-a-snapshot";
import { estimateExpectedDeliveryDate } from "@/sql-server/order-lifecycle";
import { buildLaneAForSupabaseOrder } from "@/services/lane-a-supabase";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const aiTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "getOrderStatus",
      description:
        "Get status and line items for a SALES ORDER. Accepts ERP voucher numbers (e.g., 6.105.260218.2, OpsMind-2026-001) OR numeric sales_order_id values (e.g., 830401). Use this first for minimal/ambiguous numeric inputs before invoice tools.",
      parameters: {
        type: "object",
        properties: {
          orderNumber: {
            type: "string",
            description: "Sales order identifier: voucher_number (e.g., 6.105.260218.2, OpsMind-1024) OR numeric sales_order_id (e.g., 830401)",
          },
        },
        required: ["orderNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getDistributorOrders",
      description: "Get pending/in-progress orders for a distributor company.",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "number" },
        },
        required: ["companyId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getDistributors",
      description: "List distributor companies. Use when super admin asks for distributors/company list.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum distributors to return (default 50, max 50)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchDistributors",
      description: "Search for distributor companies by name or ERP account ID. Use when super admin wants to find a specific distributor or extract their details (address, GST, contact) from ERP.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search term (name or ID)" },
        },
        required: ["search"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getDistributorOrdersByName",
      description: "Get orders for a distributor using the distributor ERP customer name (FULL_NAME) from ACCOUNT_MASTER.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Distributor name to search (e.g., 'Petru Poni ...')" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getWarehouseInventory",
      description: "Get general inventory listing for a warehouse (TOP 50 items by quantity). DO NOT USE THIS for checking stock of a specific product name or SKU; use getProductTrackingAndInventory instead. If the user is a warehouse user (role='warehouse') and asks for 'inventory' without a specific product, use their profile warehouse_id. To find a warehouse_id from a name, call searchWarehouseByName first.",
      parameters: {
        type: "object",
        properties: {
          warehouseId: { type: "number", description: "Numeric warehouse_id. For warehouse users asking for their own inventory, use their profile warehouse_id. Get this from searchWarehouseByName if user provides a warehouse name." },
        },
        required: ["warehouseId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getDelayedOrders",
      description: "Get delayed orders where expected delivery date is in the past.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getLowStockProducts",
      description: "Get low-stock products below reorder level.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchWarehouseByName",
      description: "Search for warehouse by name or location (e.g., 'Mumbai', 'Delhi', 'Mumbai West'). Returns warehouse_id and details.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Warehouse name or location like 'Mumbai', 'Delhi Central', 'Mumbai West'" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getDispatchQueue",
      description: "Get orders ready for dispatch (status = DISPATCH_READY) with future delivery dates only. Excludes orders with past delivery dates or already delivered orders.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getOrdersByWarehouse",
      description:
        "Get ERP orders tied to a warehouse location: sales_order_header.analysis_id matches OR a sales_order_body line has Despatch_Location_ID = warehouseId. Warehouse users: default to profile warehouse_id. Distributors: default to profile base_warehouse_id for 'local/base warehouse' orders. Super admin: scoped to Krisshna/Viraj-style accounts at that location. If the user names a warehouse, call searchWarehouseByName first.",
      parameters: {
        type: "object",
        properties: {
          warehouseId: {
            type: "number",
            description:
              "ERP Location_id. Omit or 0 only when warehouse or distributor profile supplies warehouse_id / base_warehouse_id automatically.",
          },
        },
        required: ["warehouseId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getAllWarehouses",
      description: "Get list of all warehouses. Use this when super admin OR distributor asks for inventory/orders without specifying a warehouse, so they can pick a warehouse. Returns warehouse_id, warehouse_name, and location.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getAllInventory",
      description: "Get inventory for all warehouses. Available for super admin and distributor. Use this when they ask for 'inventory' or 'check inventory' without specifying a warehouse name.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getInvoiceDetails",
      description:
        "Get a TAX / SALES INVOICE by invoice voucher number from Sales_Invoice_Header. ERP rule: invoice vouchers use series **106** in the second segment (e.g. 8.106.0.52690); sales **orders** use **105** (e.g. 8.105.260218.39). If the user says 'order' but the number has .106., they mean the invoice — use this tool. For 8.105... order tracking use getOrderStatus.",
      parameters: {
        type: "object",
        properties: {
          invoiceNumber: {
            type: "string",
            description: "Invoice voucher number (not the sales order voucher)",
          },
        },
        required: ["invoiceNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getInvoicesByOrder",
      description: "Get all invoices (final invoices) linked to a specific order number. Shows the complete invoice hierarchy for an order.",
      parameters: {
        type: "object",
        properties: {
          orderNumber: { type: "string", description: "Order number to get invoices for" },
        },
        required: ["orderNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getProformaInvoices",
      description: "Get all proforma invoices for a specific order number. Shows proforma invoices and their linked final invoices.",
      parameters: {
        type: "object",
        properties: {
          orderNumber: { type: "string", description: "Order number to get proforma invoices for" },
        },
        required: ["orderNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getOrderDrilldown",
      description:
        "Get detailed SALES ORDER line-item breakdown (ERP). ALWAYS use this when the user asks for 'details', 'products', 'all', or 'full details' of an order. Say order/sales order in replies, not invoice.",
      parameters: {
        type: "object",
        properties: {
          orderNumber: { type: "string", description: "Order number for detailed breakdown" },
        },
        required: ["orderNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getCompanyInvoices",
      description: "Get all invoices for a company. Super admin can query any company, company admin can only see their own company's invoices. Can filter by date using dateFilter parameter (e.g., 'today' for today's invoices). Always returns maximum 5 invoices initially to prevent system crashes.",
      parameters: {
        type: "object",
        properties: {
          companyName: { type: "string", description: "Company name (optional - if not provided, uses user's company)" },
          limit: { type: "number", description: "Maximum number of invoices to return (default: 5, max: 5 to prevent crashes)" },
          dateFilter: { type: "string", description: "Filter by date: 'today' for today's invoices, or specific date like '2026-02-17' (optional)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getInvoiceStatus",
      description: "Get status and tracking information for an invoice including delivery status, estimated delivery, and any delays.",
      parameters: {
        type: "object",
        properties: {
          invoiceNumber: { type: "string", description: "Invoice number to get status for" },
        },
        required: ["invoiceNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getDelayedInvoices",
      description: "Get invoices that are running late (past their expected delivery date or estimated delivery date). Shows invoices with delay information.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getProductTrackingAndInventory",
      description:
        "Track a specific product and stock by warehouse from ERP Product_Master + CurrentStock. ALWAYS USE THIS for product/stock/which-warehouse questions. Pass productQuery as the user's exact text when it contains '(SKU: …)' or a catalogue code (e.g. H-00101) — the backend extracts SKU and resolves the product. For distributors, uses company base_warehouse_id when no warehouse is specified. If the user names a warehouse, call searchWarehouseByName first, then pass warehouseId. Set includeOtherWarehouses to 1 when they ask availability across warehouses or which warehouse has stock.",
      parameters: {
        type: "object",
        properties: {
          productQuery: {
            type: "string",
            description:
              "Product name, SKU/catalogue_no, or the full user sentence (e.g. 'Hydrochloric Acid (SKU: H-00101) which warehouse') — full text is OK; ERP resolves embedded SKU.",
          },
          includeOtherWarehouses: { type: "number", description: "0 or 1. Set to 1 if the user wants to know where it is available across all warehouses." },
          warehouseId: { type: "number", description: "Optional warehouse_id override. If omitted, uses warehouse staff warehouse_id, else company base_warehouse_id for distributors, else profile warehouse_id." },
        },
        required: ["productQuery"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getOrdersByLineItem",
      description:
        "Get orders that contain a specific product as a line item. Use for queries like 'show all orders that have Ammonium Phosphate as a line item'.",
      parameters: {
        type: "object",
        properties: {
          productQuery: { type: "string", description: "Product name or SKU/catalogue number." },
          limit: { type: "number", description: "Maximum rows to return (default 50)." },
        },
        required: ["productQuery"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getProductOrderedQuantity",
      description:
        "Get how much quantity of a specific product was ordered in the last N months (default 3). Use for queries like 'how much did I order Evans Blue in last three months'.",
      parameters: {
        type: "object",
        properties: {
          productQuery: { type: "string", description: "Product name or SKU/catalogue number." },
          months: { type: "number", description: "Number of months to look back (default 3)." },
        },
        required: ["productQuery"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getProductSupplyStatus",
      description:
        "Trace the supply chain for a specific product from ERP (Stock -> Requisitions -> BOM -> Raw Materials). USE THIS when a user asks 'why is it out of stock?', 'when will it be back?', or after they see 'Awaiting Factory' and want more details. Always use this for deep supply-side visibility.",
      parameters: {
        type: "object",
        properties: {
          productQuery: {
            type: "string",
            description: "Product name or SKU/catalogue number.",
          },
        },
        required: ["productQuery"],
      },
    },
  },
];

export async function executeTool(
  toolName: string,
  args: Record<string, string | number>,
  profile: UserProfile,
) {
  // Auto-fill warehouse_id for warehouse users if not provided
  if (profile.role === "warehouse" && profile.warehouse_id) {
    if (toolName === "getWarehouseInventory" && (!args.warehouseId || Number(args.warehouseId) === 0)) {
      args.warehouseId = profile.warehouse_id;
    }
    if (toolName === "getOrdersByWarehouse" && (!args.warehouseId || Number(args.warehouseId) === 0)) {
      args.warehouseId = profile.warehouse_id;
    }
  }
  if (profile.role === "distributor" && profile.base_warehouse_id) {
    if (toolName === "getOrdersByWarehouse" && (!args.warehouseId || Number(args.warehouseId) === 0)) {
      args.warehouseId = profile.base_warehouse_id;
    }
  }
  
  if (toolName === "getOrderStatus") return getOrderStatus(args.orderNumber, profile);
  if (toolName === "getDistributors") return getDistributors(Number(args.limit || 50), profile);
  if (toolName === "searchDistributors") return searchDistributors(String(args.search || ""), profile);
  if (toolName === "getDistributorOrdersByName") return getDistributorOrdersByName(String(args.name || ""), profile);
  if (toolName === "getDistributorOrders")
    return getDistributorOrders(Number(args.companyId), profile);
  if (toolName === "getWarehouseInventory")
    return getWarehouseInventory(Number(args.warehouseId), profile);
  if (toolName === "getDelayedOrders") return getDelayedOrders(profile);
  if (toolName === "getLowStockProducts") return getLowStockProducts(profile);
  if (toolName === "searchWarehouseByName") return searchWarehouseByName(String(args.name || ""), profile);
  if (toolName === "getDispatchQueue") return getDispatchQueue(profile);
  if (toolName === "getOrdersByWarehouse") return getOrdersByWarehouse(Number(args.warehouseId), profile);
  if (toolName === "getAllWarehouses") return getAllWarehouses(profile);
  if (toolName === "getAllInventory") return getAllInventory(profile);
  if (toolName === "getInvoiceDetails") return getInvoiceDetails(String(args.invoiceNumber || ""), profile);
  if (toolName === "getInvoicesByOrder") return getInvoicesByOrder(String(args.orderNumber || ""), profile);
  if (toolName === "getProformaInvoices") return getProformaInvoices(String(args.orderNumber || ""), profile);
  if (toolName === "getOrderDrilldown") return getOrderDrilldown(String(args.orderNumber || ""), profile);
  if (toolName === "getCompanyInvoices") return getCompanyInvoices(String(args.companyName || ""), Number(args.limit || 5), String(args.dateFilter || ""), profile);
  if (toolName === "getInvoiceStatus") return getInvoiceStatus(String(args.invoiceNumber || ""), profile);
  if (toolName === "getDelayedInvoices") return getDelayedInvoices(profile);
  if (toolName === "getProductTrackingAndInventory") {
    const includeOtherWarehouses =
      args.includeOtherWarehouses != null ? Number(args.includeOtherWarehouses) : undefined;
    const warehouseId = args.warehouseId != null ? Number(args.warehouseId) : undefined;
    return getProductTrackingAndInventory(
      String(args.productQuery || ""),
      includeOtherWarehouses,
      warehouseId,
      profile,
    );
  }
  if (toolName === "getOrdersByLineItem") {
    if (isSqlServerDataEnabled()) {
      return sqlServerOps.sqlServerGetOrdersByLineItem(
        String(args.productQuery || ""),
        args.limit != null ? Number(args.limit) : undefined,
        profile,
      );
    }
    return { error: "Orders by line item is not implemented for Supabase mode yet. Enable USE_SQL_SERVER_DATA." };
  }
  if (toolName === "getProductOrderedQuantity") {
    if (isSqlServerDataEnabled()) {
      return sqlServerOps.sqlServerGetProductOrderedQuantity(
        String(args.productQuery || ""),
        args.months != null ? Number(args.months) : undefined,
        profile,
      );
    }
    return { error: "Product ordered quantity is not implemented for Supabase mode yet. Enable USE_SQL_SERVER_DATA." };
  }
  if (toolName === "getProductSupplyStatus") {
    if (isSqlServerDataEnabled()) {
      return sqlServerOps.sqlServerGetProductSupplyStatus(
        String(args.productQuery || ""),
        profile,
      );
    }
    return { error: "Supply status is not implemented for Supabase mode yet. Enable USE_SQL_SERVER_DATA." };
  }
  if (toolName === "getDemoOrder") return getDemoOrder(Number(args.step || 1));
  return { error: `Unknown tool: ${toolName}` };
}

/**
 * Demo / fallback tool: create a realistic stage snapshot without live ERP data.
 * Prevents `/api/chat` from crashing when the model requests a demo stage.
 */
async function getDemoOrder(step: number) {
  const n = Number.isFinite(step) ? Math.max(1, Math.min(7, step)) : 1;
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  // Placeholder estimated-delivery offsets per client demo requirement (estimated delivery, not next_update_by).
  const statusByStep: Record<number, string> = {
    1: "ORDER_RECEIVED",
    2: "ALLOCATED_LOCAL_WAREHOUSE",
    3: "ALLOCATED_CENTRAL_WAREHOUSE",
    4: "IN_PREPARATION",
    5: "AWAITING_FACTORY",
    6: "DISPATCH_READY",
    7: "DELIVERED",
  };

  const baseDaysByStatus: Record<string, number> = {
    ORDER_RECEIVED: 3,
    ALLOCATED_LOCAL_WAREHOUSE: 3,
    ALLOCATED_CENTRAL_WAREHOUSE: 5,
    IN_PREPARATION: 7,
    AWAITING_FACTORY: 7,
    DISPATCH_READY: 5,
    DELIVERED: 0,
  };

  const status = statusByStep[n] ?? "ORDER_RECEIVED";
  const expectedDeliveryDate =
    status === "DELIVERED"
      ? null
      : (() => {
          const d = new Date();
          const add = baseDaysByStatus[status] ?? 3;
          d.setUTCDate(d.getUTCDate() + add);
          return d.toISOString().slice(0, 10);
        })();

  const orderNumber = `DEMO-${todayIso}-${n}`;
  const laneA = buildLaneAOrderSnapshot({
    status,
    orderNumber,
    voucherDate: todayIso,
    expectedDeliveryDate,
    isStockTransferOrder: false,
    dateOfRemoval: status === "DELIVERED" ? todayIso : null,
  });

  return {
    document_type: "erp_sales_order",
    matched_on: "demo",
    queried_value: orderNumber,
    assistant_reply_rules: "This is a DEMO SALES ORDER truth layer used for presentations.",
    order_number: orderNumber,
    order_date: todayIso,
    status: status,
    order_status: status,
    invoice_count: 0,
    warehouse_id: null,
    warehouse_name: null,
    company_id: null,
    order_value: null,
    order_value_display: null,
    expected_delivery_date: expectedDeliveryDate,
    original_eta: null,
    revised_eta: null,
    delivery_date: status === "DELIVERED" ? todayIso : null,
    delay_reason: null,
    customer_name: "DEMO CUSTOMER",
    customer_po_number: "DEMO-PO",
    items: [],
    items_count: 0,
    lane_a: laneA,
  };
}

async function getOrderStatus(orderNumber: string | number | undefined, profile: UserProfile) {
  if (isSqlServerDataEnabled()) return sqlServerOps.sqlServerGetOrderStatus(orderNumber, profile);
  const supabase = createSupabaseServerClient();
  if (!orderNumber) return { error: "Order number is required." };

  const query = supabase
    .from("orders")
    .select(
      "id,order_id,order_number,status,order_status,expected_delivery_date,original_eta,revised_eta,delivery_date,delay_reason,company_id,warehouse_id,order_date,order_value,delivery_location,customer_po_number",
    )
    .eq("order_number", String(orderNumber));

  if (profile.role === "distributor" && profile.company_id) {
    query.eq("company_id", profile.company_id);
  }
  if (profile.role === "warehouse" && profile.warehouse_id) {
    query.eq("warehouse_id", profile.warehouse_id);
  }

  const { data, error } = await query.single();
  if (error || !data) return { error: sqlServerOps.ERP_ORDER_NOT_FOUND_MSG };
  
  // Parallelize all database queries for better performance
  const [warehouseResult, companyResult, invoiceOrdersResult, orderItemsResult] = await Promise.all([
    supabase
      .from("warehouses")
      .select("warehouse_name")
      .eq("warehouse_id", data.warehouse_id)
      .single(),
    supabase
      .from("companies")
      .select("company_name")
      .eq("company_id", data.company_id)
      .single(),
    supabase
      .from("invoice_orders")
      .select("invoice_id")
      .eq("order_number", String(orderNumber)),
    supabase
      .from("order_items")
      .select("id, product_id, quantity")
      .eq("order_id", data.order_id)
  ]);

  const warehouse = warehouseResult.data;
  const company = companyResult.data;
  const invoiceOrders = invoiceOrdersResult.data;
  const orderItems = orderItemsResult.data;

  const invoiceCount = invoiceOrders?.length || 0;

  let items: Array<{
    product_id: number | null;
    product_name: string;
    sku: string;
    quantity: number;
  }> = [];
  if (orderItems && orderItems.length > 0) {
    // Get product details in parallel
    const productIds = orderItems.map((oi) => oi.product_id).filter(Boolean);
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("product_id, product_name, sku, catalogue_number")
        .in("product_id", productIds)
        .limit(50); // Limit to prevent large queries

      const productMap = new Map((products || []).map((p) => [p.product_id, p]));

      items = orderItems.map((item) => {
        const product = productMap.get(item.product_id);
        return {
          product_id: item.product_id,
          product_name: product?.product_name || "Unknown Product",
          sku: product?.sku || product?.catalogue_number || "N/A",
          quantity: Number(item.quantity) || 0,
        };
      });
    }
  }

  // Calculate order status if not set
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let calculatedStatus = data.order_status;
  if (!calculatedStatus) {
    if (data.delivery_date) {
      calculatedStatus = "Delivered";
    } else if (data.original_eta) {
      const etaDate = new Date(data.original_eta);
      etaDate.setHours(0, 0, 0, 0);
      if (today > etaDate) {
        calculatedStatus = "Running Late";
      } else {
        calculatedStatus = "Work in Progress";
      }
    } else {
      calculatedStatus = "Work in Progress";
    }
  }

  const laneA = buildLaneAForSupabaseOrder({
    order_number: String(data.order_number),
    status: data.status,
    order_status: calculatedStatus,
    order_date: data.order_date,
    expected_delivery_date: data.expected_delivery_date,
    original_eta: data.original_eta,
    delivery_date: data.delivery_date,
    customer_po_number: data.customer_po_number,
  });

  return {
    document_type: "erp_sales_order" as const,
    matched_on: "order_number" as const,
    queried_value: String(orderNumber),
    assistant_reply_rules:
      "CRITICAL: You MUST output the line items of this order as a Markdown Table with columns for #, Product, SKU, Qty, and Line Total. You MUST ALSO output a separate Markdown Table for order details (Distributor, Status, Value, Expected Delivery). DO NOT use conversational bullet lists for these items. Let the UI parser handle tables.",
    ...data,
    warehouse_name: warehouse?.warehouse_name ?? null,
    company_name: company?.company_name ?? null,
    order_status: calculatedStatus,
    invoice_count: invoiceCount,
    items: items,
    items_count: items.length,
    /** Phase 1 Step C: same shape as SQL Server `getOrderStatus` for Lane A UI. */
    lane_a: laneA,
  };
}

async function getDistributorOrdersByName(name: string, profile: UserProfile) {
  // SQL-only mapping by ERP FULL_NAME.
  return sqlServerOps.sqlServerGetDistributorOrdersByName(name, profile);
}

async function getDistributorOrders(companyId: number, profile: UserProfile) {
  if (isSqlServerDataEnabled()) return sqlServerOps.sqlServerGetDistributorOrders(companyId, profile);
  const supabase = createSupabaseServerClient();
  if (!Number.isFinite(companyId)) return { error: "Invalid company id." };
  if (profile.role === "distributor" && profile.company_id !== companyId) {
    return { error: "Access denied for this company." };
  }
  const { data } = await supabase
    .from("orders")
    .select("order_number,status,expected_delivery_date")
    .eq("company_id", companyId)
    .in("status", ["IN_PREPARATION", "AWAITING_FACTORY", "IN_TRANSIT", "DISPATCH_READY"])
    .order("created_at", { ascending: false })
    .limit(5); // Limited to 5 for initial display

  // Get total count
  const { count: totalCount } = await supabase
    .from("orders")
    .select("order_id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .in("status", ["IN_PREPARATION", "AWAITING_FACTORY", "IN_TRANSIT", "DISPATCH_READY"]);

  if (!data || data.length === 0) {
    return { orders: [], total_count: 0, message: "No pending orders found." };
  }

  return {
    orders: data,
    total_count: totalCount || 0,
    showing: data.length,
    message: totalCount && totalCount > 5 ? `Showing first 5 of ${totalCount} pending orders. Ask for more if needed.` : undefined,
  };
}

async function getDistributors(limit: number, profile: UserProfile) {
  if (profile.role !== "super_admin" && profile.role !== "distributor") {
    return { error: "Access denied. Only Super Admin or Distributors can view distributor information." };
  }

  if (profile.role === "distributor") {
    const accountIds = getDistributorSqlAccountIds(profile);
    if (!accountIds.length) {
      return { error: "No ERP accounts linked to your profile." };
    }
    const distributors = await Promise.all(
      accountIds.map(async (id) => {
        const name = await sqlServerOps.getAccountName(id);
        return {
          company_id: profile.company_id ?? null,
          distributor_name: name ?? `ERP Account ${id}`,
          erp_account_id: id,
          erp_account_ids: [id],
        };
      }),
    );
    return {
      distributors,
      count: distributors.length,
      showing: distributors.length,
      source: "sql_server_profile",
    };
  }

  // Distributor listing must come from SQL Server only.
  const result = await sqlServerOps.sqlServerListErpAccounts(limit, profile);
  if (result && typeof result === "object" && "error" in result && (result as any).error) {
    return { error: (result as any).error?.message ?? String((result as any).error) };
  }

  const accounts =
    (result as { accounts?: Array<{ erp_account_id: number; account_name: string | null; order_count: number | null }> }).accounts ?? [];

  // We don't have a perfect "app company" mapping in SQL-only mode, so we return ERP accounts
  // with `company_id: null` and `distributor_name` from ERP FULL_NAME.
  const distributors = accounts.map((a) => ({
    company_id: null,
    distributor_name: a.account_name ?? `ERP Account ${a.erp_account_id}`,
    erp_account_id: a.erp_account_id,
    erp_account_ids: [a.erp_account_id],
    order_count: a.order_count ?? null,
  }));

  return {
    distributors,
    count: distributors.length,
    showing: distributors.length,
    source: result?.source ?? "sql_server",
  };
}

async function searchDistributors(search: string, profile: UserProfile) {
  return sqlServerOps.sqlServerSearchDistributors(search, profile);
}

async function getWarehouseInventory(warehouseId: number, profile: UserProfile) {
  if (isSqlServerDataEnabled()) return sqlServerOps.sqlServerGetWarehouseInventory(warehouseId, profile);
  const supabase = createSupabaseServerClient();
  if (!Number.isFinite(warehouseId)) return { error: "Invalid warehouse id." };

  // Authorization checks
  // Super admin can access any warehouse
  if (profile.role === "super_admin") {
    // Allow access, continue to query
  } else if (profile.role === "warehouse") {
    // Warehouse users can only access their own warehouse
    if (!profile.warehouse_id) {
      return { error: "Access denied. Your account is not associated with a warehouse." };
    }
    if (profile.warehouse_id !== warehouseId) {
      return { error: "Access denied for this warehouse. You can only access inventory for your assigned warehouse." };
    }
  }
      const { data } = await supabase
        .from("inventory")
        .select("product_id,available_quantity")
        .eq("warehouse_id", warehouseId)
        .order("updated_at", { ascending: false })
        .limit(5); // Limited to 5 for initial display

  const rows = data ?? [];
  if (!rows.length) return [];
  const productIds = Array.from(new Set(rows.map((row) => row.product_id)));
  const { data: products } = await supabase
    .from("products")
    .select("product_id,product_name,sku")
    .in("product_id", productIds);
  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("warehouse_name")
    .eq("warehouse_id", warehouseId)
    .single();
  const pMap = new Map((products ?? []).map((p) => [p.product_id, p]));
  return rows.map((row) => ({
    available_qty: row.available_quantity,
    reorder_level: 30,
    product_name: pMap.get(row.product_id)?.product_name ?? null,
    sku: pMap.get(row.product_id)?.sku ?? null,
    warehouse_name: warehouse?.warehouse_name ?? null,
  }));
}

async function getDelayedOrders(profile: UserProfile) {
  if (isSqlServerDataEnabled()) return sqlServerOps.sqlServerGetDelayedOrders(profile);
  const supabase = createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);
  const query = supabase
    .from("orders")
    .select("order_id,order_number,status,expected_delivery_date,company_id,warehouse_id,order_status,original_eta,revised_eta,delay_reason")
    .or(`expected_delivery_date.lt.${today},original_eta.lt.${today}`)
    .neq("status", "DELIVERED")
    .neq("order_status", "Delivered")
    .order("expected_delivery_date", { ascending: true })
    .limit(20);

  if (profile.role === "distributor" && profile.company_id) query.eq("company_id", profile.company_id);
  if (profile.role === "warehouse" && profile.warehouse_id) query.eq("warehouse_id", profile.warehouse_id);

  const { data } = await query;
  if (!data || data.length === 0) return [];

  const warehouseIds = Array.from(new Set(data.map((o) => o.warehouse_id).filter(Boolean)));
  const { data: warehouses } = await supabase
    .from("warehouses")
    .select("warehouse_id,warehouse_name")
    .in("warehouse_id", warehouseIds);

  const warehouseMap = new Map((warehouses ?? []).map((w) => [w.warehouse_id, w.warehouse_name]));

  // Calculate days delayed for each order
  const delayedOrders = data.map((order) => {
    const deliveryDate = order.expected_delivery_date || order.original_eta;
    const deliveryDateObj = deliveryDate ? new Date(deliveryDate) : null;
    const todayObj = new Date(today);
    const daysDelayed = deliveryDateObj ? Math.floor((todayObj.getTime() - deliveryDateObj.getTime()) / (1000 * 60 * 60 * 24)) : 0;

    return {
      order_id: order.order_id,
      order_number: order.order_number,
      status: order.status,
      order_status: order.order_status || "Running Late",
      expected_delivery_date: order.expected_delivery_date,
      original_eta: order.original_eta,
      revised_eta: order.revised_eta,
      delay_reason: order.delay_reason,
      days_delayed: daysDelayed,
      warehouse_name: warehouseMap.get(order.warehouse_id) ?? null,
    };
  });

  // Get total count for delayed orders
  const countQuery = supabase
    .from("orders")
    .select("order_id", { count: "exact", head: true })
    .or(`expected_delivery_date.lt.${today},original_eta.lt.${today}`)
    .neq("status", "DELIVERED")
    .neq("order_status", "Delivered");

  if (profile.role === "distributor" && profile.company_id) countQuery.eq("company_id", profile.company_id);
  if (profile.role === "warehouse" && profile.warehouse_id) countQuery.eq("warehouse_id", profile.warehouse_id);

  const { count: totalCount } = await countQuery;

  return {
    delayed_orders: delayedOrders,
    total_count: totalCount || 0,
    showing: delayedOrders.length,
    message: totalCount && totalCount > 20 ? `Showing first 20 of ${totalCount} delayed orders. Ask for more if needed.` : undefined,
  };
}

async function getLowStockProducts(profile: UserProfile) {
  if (isSqlServerDataEnabled()) return sqlServerOps.sqlServerGetLowStockProducts(profile);
  const supabase = createSupabaseServerClient();
  const query = supabase
    .from("inventory")
    .select("product_id,available_quantity,warehouse_id")
    .lte("available_quantity", 30)
    .order("available_quantity", { ascending: true })
    .limit(5); // Limited to 5 for initial display

  if (profile.role === "warehouse" && profile.warehouse_id) query.eq("warehouse_id", profile.warehouse_id);

  const { data } = await query;
  const rows = data ?? [];
  if (!rows.length) return { low_stock_products: [], total_count: 0, message: "No low stock products found." };

  // Get total count
  const countQuery = supabase
    .from("inventory")
    .select("*", { count: "exact", head: true })
    .lte("available_quantity", 30);
  
  if (profile.role === "warehouse" && profile.warehouse_id) countQuery.eq("warehouse_id", profile.warehouse_id);
  const { count: totalCount } = await countQuery;

  const productIds = Array.from(new Set(rows.map((row) => row.product_id)));
  const { data: products } = await supabase
    .from("products")
    .select("product_id,product_name,sku")
    .in("product_id", productIds);
  const pMap = new Map((products ?? []).map((p) => [p.product_id, p]));

  const lowStockItems = rows.map((row) => ({
    available_qty: row.available_quantity,
    reorder_level: 30,
    warehouse_id: row.warehouse_id,
    product_name: pMap.get(row.product_id)?.product_name ?? null,
    sku: pMap.get(row.product_id)?.sku ?? null,
  }));

  return {
    low_stock_products: lowStockItems,
    total_count: totalCount || 0,
    showing: lowStockItems.length,
    message: totalCount && totalCount > 5 ? `Showing first 5 of ${totalCount} low stock products. Ask for more if needed.` : undefined,
  };
}

async function getProductTrackingAndInventory(
  productQuery: string,
  includeOtherWarehouses: number | undefined,
  warehouseId: number | undefined,
  profile: UserProfile,
) {
  if (isSqlServerDataEnabled()) {
    return sqlServerOps.sqlServerGetProductTrackingAndInventory(productQuery, includeOtherWarehouses, warehouseId, profile);
  }
  return { error: "Product tracking + inventory availability is not implemented for Supabase mode yet. Enable USE_SQL_SERVER_DATA." };
}

async function searchWarehouseByName(name: string, profile: UserProfile) {
  if (isSqlServerDataEnabled()) return sqlServerOps.sqlServerSearchWarehouseByName(name, profile);
  const supabase = createSupabaseServerClient();
  if (!name.trim()) return { error: "Warehouse name is required." };

  const searchTerm = name.trim().toLowerCase();
  const { data, error } = await supabase
    .from("warehouses")
    .select("warehouse_id,warehouse_name,location")
    .or(`warehouse_name.ilike.%${searchTerm}%,location.ilike.%${searchTerm}%`)
    .limit(5);

  if (error || !data || data.length === 0) {
    return { error: `No warehouse found matching "${name}".` };
  }

  if (data.length === 1) {
    return data[0];
  }

  return { matches: data, message: `Found ${data.length} warehouses matching "${name}".` };
}

async function getDispatchQueue(profile: UserProfile) {
  if (isSqlServerDataEnabled()) return sqlServerOps.sqlServerGetDispatchQueue(profile);
  const supabase = createSupabaseServerClient();
  const today = new Date().toISOString().split("T")[0];
  
  const query = supabase
    .from("orders")
    .select("order_id,order_number,status,expected_delivery_date,warehouse_id,order_status,delivery_date")
    .eq("status", "DISPATCH_READY")
    // Only show orders with future delivery dates or no delivery date set
    .or(`expected_delivery_date.gte.${today},expected_delivery_date.is.null`)
    // Exclude already delivered orders
    .is("delivery_date", null)
    .order("expected_delivery_date", { ascending: true })
    .limit(5); // Limited to 5 for initial display to prevent crashes

  if (profile.role === "distributor" && profile.company_id) {
    query.eq("company_id", profile.company_id);
  }
  if (profile.role === "warehouse" && profile.warehouse_id) {
    query.eq("warehouse_id", profile.warehouse_id);
  }

  const { data } = await query;
  if (!data || data.length === 0) return [];

  const warehouseIds = Array.from(new Set(data.map((o) => o.warehouse_id).filter(Boolean)));
  const { data: warehouses } = await supabase
    .from("warehouses")
    .select("warehouse_id,warehouse_name")
    .in("warehouse_id", warehouseIds);

  const warehouseMap = new Map((warehouses ?? []).map((w) => [w.warehouse_id, w.warehouse_name]));

  return data.map((order) => ({
    ...order,
    warehouse_name: warehouseMap.get(order.warehouse_id) ?? null,
  }));
}

function erpCentralWarehouseLocationIdForAccess(): number {
  const n = Number(process.env.ERP_CENTRAL_WAREHOUSE_LOCATION_ID);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 6;
}

async function getOrdersByWarehouse(warehouseId: number, profile: UserProfile) {
  if (isSqlServerDataEnabled()) return sqlServerOps.sqlServerGetOrdersByWarehouse(warehouseId, profile);
  const supabase = createSupabaseServerClient();
  if (!Number.isFinite(warehouseId)) return { error: "Invalid warehouse id." };
  
  // Authorization checks
  if (profile.role === "warehouse") {
    // Warehouse users can only access their own warehouse orders
    if (!profile.warehouse_id) {
      return { error: "Access denied. Your account is not associated with a warehouse." };
    }
    const centralId = erpCentralWarehouseLocationIdForAccess();
    if (profile.warehouse_id !== warehouseId && warehouseId !== centralId) {
      return { error: "Access denied for this warehouse. You can only access orders for your assigned warehouse." };
    }
  }
  // Super admin and distributors (if they have access) can access any warehouse orders

  const query = supabase
    .from("orders")
    .select("order_id,order_number,status,expected_delivery_date,warehouse_id")
    .eq("warehouse_id", warehouseId)
    .order("created_at", { ascending: false })
    .limit(5); // Limited to 5 for initial display

  if (profile.role === "distributor" && profile.company_id) {
    query.eq("company_id", profile.company_id);
  }

  const { data } = await query;
  if (!data || data.length === 0) return [];

  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("warehouse_name")
    .eq("warehouse_id", warehouseId)
    .single();

  return data.map((order) => ({
    ...order,
    warehouse_name: warehouse?.warehouse_name ?? null,
  }));
}

async function getAllWarehouses(profile: UserProfile) {
  if (isSqlServerDataEnabled()) return sqlServerOps.sqlServerGetAllWarehouses(profile);
  const supabase = createSupabaseServerClient();
  // Super admin and distributor can see all warehouses.
  if (profile.role !== "super_admin" && profile.role !== "distributor") {
    return { error: "Access denied. Only Super Admin and Distributor can view all warehouses." };
  }
  
  const { data, error } = await supabase
    .from("warehouses")
    .select("warehouse_id,warehouse_name,location")
    .order("warehouse_name", { ascending: true });
  
  if (error || !data) {
    return { error: error?.message ?? "Failed to fetch warehouses." };
  }
  
  return data;
}

async function getAllInventory(profile: UserProfile) {
  if (isSqlServerDataEnabled()) return sqlServerOps.sqlServerGetAllInventory(profile);
  const supabase = createSupabaseServerClient();
  // Super admin and distributor can see all inventory.
  if (profile.role !== "super_admin" && profile.role !== "distributor") {
    return { error: "Access denied. Only Super Admin and Distributor can view all inventory." };
  }
  
  const { data } = await supabase
    .from("inventory")
    .select("product_id,available_quantity,warehouse_id")
    .order("updated_at", { ascending: false })
    .limit(5); // Limited to 5 for initial display to prevent crashes
  
  const rows = data ?? [];
  if (!rows.length) return [];
  
  const productIds = Array.from(new Set(rows.map((row) => row.product_id).filter(Boolean)));
  const warehouseIds = Array.from(new Set(rows.map((row) => row.warehouse_id).filter(Boolean)));
  
  const [productsResult, warehousesResult] = await Promise.all([
    supabase
      .from("products")
      .select("product_id,product_name,sku")
      .in("product_id", productIds),
    supabase
      .from("warehouses")
      .select("warehouse_id,warehouse_name")
      .in("warehouse_id", warehouseIds),
  ]);
  
  const pMap = new Map((productsResult.data ?? []).map((p) => [p.product_id, p]));
  const wMap = new Map((warehousesResult.data ?? []).map((w) => [w.warehouse_id, w.warehouse_name]));
  
  return rows.map((row) => ({
    available_qty: row.available_quantity,
    reorder_level: 30,
    warehouse_id: row.warehouse_id,
    warehouse_name: wMap.get(row.warehouse_id) ?? null,
    product_name: pMap.get(row.product_id)?.product_name ?? null,
    sku: pMap.get(row.product_id)?.sku ?? null,
  }));
}

// ============================================================================
// INVOICE QUERY FUNCTIONS
// ============================================================================

async function getInvoiceDetails(invoiceNumber: string, profile: UserProfile) {
  if (isSqlServerDataEnabled()) {
    const clean = invoiceNumber.trim();
    // IMPORTANT: invoice queries must resolve to invoices first.
    // Some invoice vouchers look like sales-order vouchers (e.g. N.N.N.N[.N]), so we:
    // 1) Try invoice header first
    // 2) Only if invoice is not found, fall back to order-status lookup
    //    (covers numeric-only inputs and ERP-like voucher strings).
    const looksNumeric = /^\d+$/.test(clean);

    const invoiceRes = await sqlServerOps.sqlServerGetInvoiceDetails(invoiceNumber, profile);
    if (!(invoiceRes as { error?: string }).error) {
      return invoiceRes;
    }

    if (looksNumeric || sqlServerOps.looksLikeErpSalesOrderVoucherNumber(clean)) {
      const orderRes = await sqlServerOps.sqlServerGetOrderStatus(clean, profile);
      if (!(orderRes as { error?: string }).error) return orderRes;
    }

    return invoiceRes;
  }
  const supabase = createSupabaseServerClient();
  if (!invoiceNumber.trim()) return { error: "Invoice number is required." };

  const cleanInvoiceNumber = invoiceNumber.trim();

  // Try multiple lookup strategies
  // 1. Try exact match on invoice_number
  let query = supabase
    .from("invoices")
    .select(`
      id,
      invoice_id,
      invoice_number,
      invoice_date,
      invoice_total_amount,
      base_amount,
      tax_amount,
      discount_amount,
      confirmed,
      transport_name,
      vehicle_number,
      date_of_removal,
      company_id,
      customer_id,
      account_id,
      customer_full_name,
      customer_email,
      customer_telephone
    `)
    .eq("invoice_number", cleanInvoiceNumber)
    .limit(1);

  let { data: invoice, error: invoiceError } = await query.maybeSingle();

  // 2. If not found, try invoice_id (if it's numeric)
  if ((invoiceError || !invoice) && !isNaN(Number(cleanInvoiceNumber))) {
    query = supabase
      .from("invoices")
      .select(`
        id,
        invoice_id,
        invoice_number,
        invoice_date,
        invoice_total_amount,
        base_amount,
        tax_amount,
        discount_amount,
        confirmed,
        transport_name,
        vehicle_number,
        date_of_removal,
        company_id,
        customer_id,
        account_id,
        customer_full_name,
        customer_email,
        customer_telephone
      `)
      .eq("invoice_id", cleanInvoiceNumber)
      .limit(1);
    
    const result = await query.maybeSingle();
    invoice = result.data;
    invoiceError = result.error;
  }

  // 3. If still not found, try case-insensitive partial match
  if (invoiceError || !invoice) {
    query = supabase
      .from("invoices")
      .select(`
        id,
        invoice_id,
        invoice_number,
        invoice_date,
        invoice_total_amount,
        base_amount,
        tax_amount,
        discount_amount,
        confirmed,
        transport_name,
        vehicle_number,
        date_of_removal,
        company_id,
        customer_id,
        account_id,
        customer_full_name,
        customer_email,
        customer_telephone
      `)
      .ilike("invoice_number", `%${cleanInvoiceNumber}%`)
      .limit(1);
    
    const result = await query.maybeSingle();
    invoice = result.data;
    invoiceError = result.error;
  }

  if (invoiceError || !invoice) {
    return { error: `Invoice not found: ${invoiceNumber}. Please check the invoice number and try again.` };
  }

  // Authorization check
  if (profile.role !== "super_admin" && profile.company_id && invoice.company_id && String(invoice.company_id) !== String(profile.company_id)) {
    return { error: "Access denied. You can only view invoices for your company." };
  }

  // Authorization check - RLS should handle this, but double-check
  if (profile.role !== "super_admin") {
    // Check if user's company matches invoice company
    // This is handled by RLS, but we can add explicit check if needed
  }

  // Parallelize all queries for better performance
  const [itemsResult, ordersResult, companyResult] = await Promise.all([
    supabase
      .from("invoice_items")
      .select(`
        id,
        invoice_body_id,
        invoice_quantity,
        invoice_line_base_amount,
        invoice_line_item_amount,
        product_id,
        product_catalogue_number,
        product_description,
        order_product_printing_name
      `)
      .eq("invoice_id", invoice.id)
      .order("invoice_body_id"), // Fetch ALL invoice line items for full invoice mapping (no truncation).
    supabase
      .from("invoice_orders")
      .select(`
        id,
        order_id,
        order_number,
        order_date,
        customer_po_number,
        order_total_amount
      `)
      .eq("invoice_id", invoice.id), // Fetch ALL linked orders for the invoice (no truncation).
    invoice.company_id
      ? supabase
          .from("companies")
          .select("company_name")
          .eq("company_id", invoice.company_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const items = itemsResult.data || [];
  const orders = ordersResult.data || [];
  const company = companyResult.data;
  const companyName = company?.company_name || null;

  const invoiceStatus: string =
    invoice.date_of_removal ? "Delivered" : invoice.confirmed ? "In Transit" : "Pending";

  // Compute a single invoice-level estimated delivery date from the linked orders (earliest expected date).
  let invoiceEta: string | null = null;
  const orderIds = Array.from(
    new Set(
      (orders ?? [])
        .map((o) => o.order_id)
        .filter((x): x is number => x != null && Number.isFinite(Number(x)))
        .map((x) => Number(x)),
    ),
  );
  if (orderIds.length) {
    const { data: orderRows } = await supabase
      .from("orders")
      .select("order_id,expected_delivery_date,revised_eta,original_eta,delivery_date")
      .in("order_id", orderIds);

    const candidateDates = (orderRows ?? [])
      .map((r) => r.expected_delivery_date ?? r.revised_eta ?? r.original_eta ?? null)
      .filter((d): d is string => typeof d === "string" && !!d.trim());

    if (candidateDates.length) {
      // Choose the earliest date.
      const sorted = [...candidateDates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      invoiceEta = sorted[0] ?? null;
    }
  }

  // Format items for better display
  const formattedItems = (items || []).map((item) => ({
    line_number: item.invoice_body_id,
    product_catalogue_number: item.product_catalogue_number,
    product_description: item.product_description || item.order_product_printing_name,
    sku: item.product_catalogue_number ?? null,
    quantity: item.invoice_quantity,
    unit_price: item.invoice_line_base_amount,
    line_total: item.invoice_line_item_amount,
    status: invoiceStatus,
    eta: invoiceEta,
    invoice_date: invoice.invoice_date,
  }));

  // Format linked orders
  const formattedOrders = (orders || []).map((order) => ({
    order_number: order.order_number,
    order_date: order.order_date,
    customer_po_number: order.customer_po_number,
    order_total_amount: order.order_total_amount,
  }));

  return {
    invoice: {
      invoice_id: invoice.invoice_id,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      total_amount: invoice.invoice_total_amount,
      base_amount: invoice.base_amount,
      tax_amount: invoice.tax_amount,
      discount_amount: invoice.discount_amount,
      confirmed: invoice.confirmed,
      transport_name: invoice.transport_name,
      vehicle_number: invoice.vehicle_number,
      date_of_removal: invoice.date_of_removal,
      company_name: companyName,
      customer_name: invoice.customer_full_name,
      customer_full_name: invoice.customer_full_name,
      customer_email: invoice.customer_email,
      customer_telephone: invoice.customer_telephone,
    },
    items: formattedItems,
    items_count: formattedItems.length,
    linked_orders: formattedOrders,
    orders_count: formattedOrders.length,
    // Also return as comprehensive array for card rendering with ALL details
    invoice_card: [{
      invoice_id: invoice.invoice_id,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      invoice_total_amount: invoice.invoice_total_amount,
      total_amount: invoice.invoice_total_amount,
      base_amount: invoice.base_amount,
      tax_amount: invoice.tax_amount,
      discount_amount: invoice.discount_amount,
      customer_full_name: invoice.customer_full_name,
      customer_name: invoice.customer_full_name,
      customer_email: invoice.customer_email,
      customer_telephone: invoice.customer_telephone,
      confirmed: invoice.confirmed,
      company_name: companyName,
      transport_name: invoice.transport_name,
      vehicle_number: invoice.vehicle_number,
      date_of_removal: invoice.date_of_removal,
      items: formattedItems,
      items_count: formattedItems.length,
      linked_orders: formattedOrders,
      orders_count: formattedOrders.length,
    }],
  };
}

async function getInvoicesByOrder(orderNumber: string, profile: UserProfile) {
  if (isSqlServerDataEnabled()) return sqlServerOps.sqlServerGetInvoicesByOrder(orderNumber, profile);
  const supabase = createSupabaseServerClient();
  if (!orderNumber.trim()) return { error: "Order number is required." };

  // First verify order access
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, company_id, order_status, original_eta, revised_eta")
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (!order) {
    return { error: `Order not found: ${orderNumber}` };
  }

  // Authorization check
  if (profile.role === "distributor" && profile.company_id && order.company_id !== profile.company_id) {
    return { error: "Access denied for this order." };
  }

  // Get invoices linked to this order via invoice_orders
  const { data: invoiceOrders } = await supabase
    .from("invoice_orders")
    .select("invoice_id, order_number, order_date, order_total_amount")
    .eq("order_number", orderNumber);

  if (!invoiceOrders || invoiceOrders.length === 0) {
    return {
      order: {
        order_number: order.order_number,
        order_status: order.order_status,
        original_eta: order.original_eta,
        revised_eta: order.revised_eta,
      },
      invoices: [],
      message: "No invoices found for this order.",
    };
  }

  const invoiceIds = invoiceOrders.map((io) => io.invoice_id).filter(Boolean);

  // Get invoice details
  const { data: invoices } = await supabase
    .from("invoices")
    .select(`
      id,
      invoice_id,
      invoice_number,
      invoice_date,
      invoice_total_amount,
      confirmed,
      date_of_removal
    `)
    .in("id", invoiceIds)
    .order("invoice_date", { ascending: false });

  return {
    order: {
      order_number: order.order_number,
      order_status: order.order_status,
      original_eta: order.original_eta,
      revised_eta: order.revised_eta,
    },
    invoices: (invoices || []).map((inv) => ({
      invoice_id: inv.invoice_id,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      total_amount: inv.invoice_total_amount,
      confirmed: inv.confirmed,
      date_of_removal: inv.date_of_removal,
    })),
    invoice_count: invoices?.length || 0,
  };
}

async function getProformaInvoices(orderNumber: string, profile: UserProfile) {
  if (isSqlServerDataEnabled()) return sqlServerOps.sqlServerGetProformaInvoices(orderNumber, profile);
  const supabase = createSupabaseServerClient();
  if (!orderNumber.trim()) return { error: "Order number is required." };

  // Get order to verify access
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, company_id")
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (!order) {
    return { error: `Order not found: ${orderNumber}` };
  }

  // Authorization check
  if (profile.role === "distributor" && profile.company_id && order.company_id !== profile.company_id) {
    return { error: "Access denied for this order." };
  }

  // Get proforma invoices for this order
  const { data: proformaInvoices } = await supabase
    .from("proforma_invoices")
    .select(`
      id,
      proforma_number,
      proforma_date,
      status,
      total_amount,
      base_amount,
      tax_amount
    `)
    .eq("order_id", order.id)
    .order("proforma_date", { ascending: false });

  if (!proformaInvoices || proformaInvoices.length === 0) {
    return {
      order_number: orderNumber,
      proforma_invoices: [],
      message: "No proforma invoices found for this order.",
    };
  }

  // Get final invoices linked to each proforma invoice
  const proformaIds = proformaInvoices.map((pi) => pi.id);
  const { data: finalInvoices } = await supabase
    .from("invoices")
    .select("id, invoice_id, invoice_number, invoice_date, invoice_total_amount, proforma_invoice_id")
    .in("proforma_invoice_id", proformaIds)
    .order("invoice_date", { ascending: false });

  // Group invoices by proforma invoice
  const invoicesByProforma = new Map<string, any[]>();
  finalInvoices?.forEach((inv) => {
    if (inv.proforma_invoice_id) {
      const key = inv.proforma_invoice_id;
      if (!invoicesByProforma.has(key)) {
        invoicesByProforma.set(key, []);
      }
      invoicesByProforma.get(key)!.push({
        invoice_id: inv.invoice_id,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        total_amount: inv.invoice_total_amount,
      });
    }
  });

  return {
    order_number: orderNumber,
    proforma_invoices: proformaInvoices.map((pi) => ({
      proforma_number: pi.proforma_number,
      proforma_date: pi.proforma_date,
      status: pi.status,
      total_amount: pi.total_amount,
      base_amount: pi.base_amount,
      tax_amount: pi.tax_amount,
      final_invoices: invoicesByProforma.get(pi.id) || [],
      final_invoice_count: invoicesByProforma.get(pi.id)?.length || 0,
    })),
  };
}

async function getOrderDrilldown(orderNumber: string, profile: UserProfile) {
  if (isSqlServerDataEnabled()) return sqlServerOps.sqlServerGetOrderDrilldown(orderNumber, profile);
  const supabase = createSupabaseServerClient();
  if (!orderNumber.trim()) return { error: "Order number is required." };

  const orderQuery = supabase
    .from("orders")
    .select(
      "id,order_id,order_number,status,order_status,expected_delivery_date,original_eta,revised_eta,delivery_date,delay_reason,company_id,warehouse_id,order_date,order_value,delivery_location,customer_po_number",
    )
    .eq("order_number", orderNumber);

  if (profile.role === "distributor" && profile.company_id) {
    orderQuery.eq("company_id", profile.company_id);
  }
  if (profile.role === "warehouse" && profile.warehouse_id) {
    orderQuery.eq("warehouse_id", profile.warehouse_id);
  }

  const { data: order } = await orderQuery.maybeSingle();

  if (!order) {
    return { error: `Order not found or access denied: ${orderNumber}` };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let calculatedStatus = order.order_status;
  if (!calculatedStatus) {
    if (order.delivery_date) {
      calculatedStatus = "Delivered";
    } else if (order.original_eta) {
      const etaDate = new Date(order.original_eta);
      etaDate.setHours(0, 0, 0, 0);
      if (today > etaDate) {
        calculatedStatus = "Running Late";
      } else {
        calculatedStatus = "Work in Progress";
      }
    } else {
      calculatedStatus = "Work in Progress";
    }
  }

  const laneA = buildLaneAForSupabaseOrder({
    order_number: String(order.order_number),
    status: order.status,
    order_status: calculatedStatus,
    order_date: order.order_date,
    expected_delivery_date: order.expected_delivery_date,
    original_eta: order.original_eta,
    delivery_date: order.delivery_date,
    customer_po_number: order.customer_po_number,
  });

  const drilldownTruth = {
    document_type: "erp_sales_order" as const,
    matched_on: "order_number" as const,
    queried_value: orderNumber.trim(),
    assistant_reply_rules:
      "CRITICAL: You MUST output all the product line items of this order as a Markdown Table. DO NOT format them as a conversational or numbered list. Say **order** / **line items**.",
    order_number: order.order_number,
    // lane_a: laneA, // Omitted to prioritize product table over truth layer
    status: laneA.external_status,
    order_status: calculatedStatus,
    expected_delivery_date: order.expected_delivery_date ?? order.original_eta ?? null,
  };

  // Get order items
  const { data: orderItems } = await supabase
    .from("order_items")
    .select(`
      id,
      product_id,
      quantity,
      item_status,
      processed_quantity,
      pending_quantity,
      delayed_quantity
    `)
    .eq("order_id", order.id);

  if (!orderItems || orderItems.length === 0) {
    return {
      ...drilldownTruth,
      order: {
        order_number: order.order_number,
        order_status: calculatedStatus,
        original_eta: order.original_eta,
        revised_eta: order.revised_eta,
        delivery_date: order.delivery_date,
        delay_reason: order.delay_reason,
        expected_delivery_date: order.expected_delivery_date ?? order.original_eta ?? null,
      },
      items: [],
      message: "No items found for this order.",
    };
  }

  // Get product details
  const productIds = orderItems.map((oi) => oi.product_id).filter(Boolean);
  const { data: products } = await supabase
    .from("products")
    .select("id, name, sku, catalogue_number, description")
    .in("id", productIds);

  const productMap = new Map((products || []).map((p) => [p.id, p]));

  // Get invoices for this order to calculate processed quantities
  const { data: invoiceOrders } = await supabase
    .from("invoice_orders")
    .select("invoice_id")
    .eq("order_number", orderNumber);

  const invoiceIds = invoiceOrders?.map((io) => io.invoice_id).filter(Boolean) || [];

  // Calculate item statuses
  const itemsWithStatus = await Promise.all(
    orderItems.map(async (item) => {
      const product = productMap.get(item.product_id);
      
      // Get processed quantity from invoices
      let processedQty = item.processed_quantity || 0;
      if (invoiceIds.length > 0) {
        const { data: invoiceItems } = await supabase
          .from("invoice_items")
          .select("invoice_quantity")
          .eq("product_id", item.product_id)
          .in("invoice_id", invoiceIds);
        
        processedQty = invoiceItems?.reduce((sum, ii) => sum + (Number(ii.invoice_quantity) || 0), 0) || 0;
      }

      const orderedQty = Number(item.quantity) || 0;
      const pendingQty = Math.max(0, orderedQty - processedQty);
      const delayedQty = item.delayed_quantity || 0;

      return {
        product_id: item.product_id,
        product_name: product?.name || product?.description || "Unknown Product",
        product_sku: product?.sku || product?.catalogue_number || "N/A",
        ordered: orderedQty,
        processed: processedQty,
        pending: pendingQty,
        delayed: delayedQty,
        item_status: item.item_status || "Ordered",
      };
    })
  );

  return {
    ...drilldownTruth,
    order: {
      order_number: order.order_number,
      order_status: calculatedStatus,
      original_eta: order.original_eta,
      revised_eta: order.revised_eta,
      delivery_date: order.delivery_date,
      delay_reason: order.delay_reason,
      expected_delivery_date: order.expected_delivery_date ?? order.original_eta ?? null,
    },
    items: itemsWithStatus,
    summary: {
      total_items: itemsWithStatus.length,
      total_ordered: itemsWithStatus.reduce((sum, item) => sum + item.ordered, 0),
      total_processed: itemsWithStatus.reduce((sum, item) => sum + item.processed, 0),
      total_pending: itemsWithStatus.reduce((sum, item) => sum + item.pending, 0),
      total_delayed: itemsWithStatus.reduce((sum, item) => sum + item.delayed, 0),
    },
  };
}

async function getCompanyInvoices(companyName: string, limit: number | undefined, dateFilter: string, profile: UserProfile) {
  if (isSqlServerDataEnabled()) return sqlServerOps.sqlServerGetCompanyInvoices(companyName, limit ?? 5, dateFilter, profile);
  // Default to 5 items to prevent crashes
  const displayLimit = limit && limit > 0 ? Math.min(limit, 5) : 5;
  const supabase = createSupabaseServerClient();
  
  // Handle date filtering
  let invoiceDateFilter: string | null = null;
  if (dateFilter && dateFilter.trim()) {
    const filterLower = dateFilter.trim().toLowerCase();
    if (filterLower === "today" || filterLower === "todays" || filterLower === "today's") {
      // Get today's date in YYYY-MM-DD format
      invoiceDateFilter = new Date().toISOString().split("T")[0];
    } else {
      // Try to parse as date
      try {
        const date = new Date(filterLower);
        if (!isNaN(date.getTime())) {
          invoiceDateFilter = date.toISOString().split("T")[0];
        }
      } catch {
        // Invalid date format, ignore
      }
    }
  }
  
  let companyId: string | null = null;

  // If company name provided, find it (super admin only)
  if (companyName.trim()) {
    if (profile.role !== "super_admin") {
      return { error: "Only Super Admin can query invoices for other companies." };
    }

    const { data: company } = await supabase
      .from("companies")
      .select("id, company_id")
      .or(`name.ilike.%${companyName}%,company_name.ilike.%${companyName}%`)
      .limit(1)
      .maybeSingle();

    if (company) {
      companyId = company.id || company.company_id;
    } else {
      return { error: `Company not found: ${companyName}` };
    }
    } else {
      // Use user's company
      if (profile.role === "super_admin") {
        // Super admin without company name - return all invoices
        let superAdminQuery = supabase
          .from("invoices")
          .select(`
            id,
            invoice_id,
            invoice_number,
            invoice_date,
            invoice_total_amount,
            confirmed,
            company_id,
            customer_full_name
          `);
        
        // Apply date filter if provided
        if (invoiceDateFilter) {
          superAdminQuery = superAdminQuery.eq("invoice_date", invoiceDateFilter);
        }
        
        const { data: invoices } = await superAdminQuery
          .order("invoice_date", { ascending: false })
          .limit(displayLimit);

        // Get total count first
        let countQuery = supabase
          .from("invoices")
          .select("*", { count: "exact", head: true });
        
        if (invoiceDateFilter) {
          countQuery = countQuery.eq("invoice_date", invoiceDateFilter);
        }
        
        const { count: totalCount } = await countQuery;

        return {
          invoices: invoices || [],
          count: invoices?.length || 0,
          total_count: totalCount || 0,
          message: totalCount && totalCount > displayLimit ? `Showing first ${displayLimit} of ${totalCount} total invoices. Ask for more if needed.` : undefined,
        };
      } else if (profile.company_id) {
        companyId = String(profile.company_id);
      } else {
        // If no company_id, return all invoices (for cases where company_id is null in invoices)
        // This handles the case where invoices don't have company_id set
        const { data: invoices } = await supabase
          .from("invoices")
          .select(`
            id,
            invoice_id,
            invoice_number,
            invoice_date,
            invoice_total_amount,
            confirmed,
            customer_full_name
          `)
          .order("invoice_date", { ascending: false })
          .limit(displayLimit);

        // Get total count
        const { count: totalCount } = await supabase
          .from("invoices")
          .select("*", { count: "exact", head: true });

        return {
          invoices: invoices || [],
          count: invoices?.length || 0,
          total_count: totalCount || 0,
          message: totalCount && totalCount > displayLimit ? `Showing first ${displayLimit} of ${totalCount} invoices. Ask for more if needed.` : undefined,
        };
      }
    }

    // Get invoices for the company
    let invoiceQuery = supabase
      .from("invoices")
      .select(`
        id,
        invoice_id,
        invoice_number,
        invoice_date,
        invoice_total_amount,
        confirmed,
        customer_full_name,
        company_id
      `);

    if (companyId) {
      invoiceQuery = invoiceQuery.eq("company_id", companyId);
    }
    // If no companyId, don't filter - let RLS handle it
    
    // Apply date filter if provided
    if (invoiceDateFilter) {
      invoiceQuery = invoiceQuery.eq("invoice_date", invoiceDateFilter);
    }

    const { data: invoices } = await invoiceQuery
      .order("invoice_date", { ascending: false })
      .limit(displayLimit);

    // Get total count for this company
    let totalCount = 0;
    if (companyId) {
      let countQuery = supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId);
      
      if (invoiceDateFilter) {
        countQuery = countQuery.eq("invoice_date", invoiceDateFilter);
      }
      
      const { count } = await countQuery;
      totalCount = count || 0;
    } else {
      // For non-company queries, get total count (RLS will filter)
      let countQuery = supabase
        .from("invoices")
        .select("*", { count: "exact", head: true });
      
      if (invoiceDateFilter) {
        countQuery = countQuery.eq("invoice_date", invoiceDateFilter);
      }
      
      const { count } = await countQuery;
      totalCount = count || 0;
    }

    return {
      company_id: companyId,
      invoices: invoices || [],
      count: invoices?.length || 0,
      total_count: totalCount,
      message: totalCount > displayLimit ? `Showing first ${displayLimit} of ${totalCount} total invoices. Ask for more if needed.` : undefined,
    };
  }

async function getInvoiceStatus(invoiceNumber: string, profile: UserProfile) {
  if (isSqlServerDataEnabled()) return sqlServerOps.sqlServerGetInvoiceStatus(invoiceNumber, profile);
  const supabase = createSupabaseServerClient();
  if (!invoiceNumber.trim()) return { error: "Invoice number is required." };

  // Get invoice
  const { data: invoice } = await supabase
    .from("invoices")
    .select(`
      id,
      invoice_id,
      invoice_number,
      invoice_date,
      invoice_total_amount,
      confirmed,
      date_of_removal,
      company_id
    `)
    .or(`invoice_number.eq.${invoiceNumber},invoice_id.eq.${invoiceNumber}`)
    .maybeSingle();

  if (!invoice) {
    return { error: `Invoice not found: ${invoiceNumber}` };
  }

  // Get linked order to check status
  const { data: invoiceOrder } = await supabase
    .from("invoice_orders")
    .select("order_number, order_date")
    .eq("invoice_id", invoice.id)
    .limit(1)
    .maybeSingle();

  let orderStatus = null;
  let linkedOrderExpectedDelivery: string | null = null;
  let isDelayed = false;

  if (invoiceOrder?.order_number) {
    const { data: order } = await supabase
      .from("orders")
      .select("order_status, original_eta, revised_eta, delivery_date")
      .eq("order_number", invoiceOrder.order_number)
      .maybeSingle();

    if (order) {
      orderStatus = order.order_status;
      linkedOrderExpectedDelivery = order.revised_eta || order.original_eta;

      // Check if delayed
      if (order.order_status === "Running Late") {
        isDelayed = true;
      } else if (linkedOrderExpectedDelivery) {
        const today = new Date();
        const expectedAt = new Date(linkedOrderExpectedDelivery);
        if (today > expectedAt && !order.delivery_date) {
          isDelayed = true;
        }
      }
    }
  }

  return {
    invoice: {
      invoice_id: invoice.invoice_id,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      total_amount: invoice.invoice_total_amount,
      confirmed: invoice.confirmed,
      date_of_removal: invoice.date_of_removal,
    },
    status: {
      order_status: orderStatus || "Unknown",
      expected_delivery: linkedOrderExpectedDelivery,
      is_delayed: isDelayed,
      is_delivered: invoice.date_of_removal !== null,
    },
    linked_order: invoiceOrder ? {
      order_number: invoiceOrder.order_number,
      order_date: invoiceOrder.order_date,
    } : null,
  };
}

async function getDelayedInvoices(profile: UserProfile) {
  if (isSqlServerDataEnabled()) return sqlServerOps.sqlServerGetDelayedInvoices(profile);
  const supabase = createSupabaseServerClient();
  const today = new Date().toISOString().split("T")[0];

  // Get orders that are running late
  const { data: delayedOrders } = await supabase
    .from("orders")
    .select("id, order_number, order_status, original_eta, revised_eta, delay_reason, company_id")
    .or(`order_status.eq.Running Late,order_status.eq.RUNNING_LATE`)
    .order("original_eta", { ascending: true })
    .limit(5); // Limited to 5 for initial display to prevent crashes

  if (!delayedOrders || delayedOrders.length === 0) {
    return {
      delayed_invoices: [],
      message: "No delayed invoices found.",
    };
  }

  // Filter by company if not super admin
  let filteredOrders = delayedOrders;
  if (profile.role === "distributor" && profile.company_id) {
    filteredOrders = delayedOrders.filter((o) => o.company_id === profile.company_id);
  }

  const orderNumbers = filteredOrders.map((o) => o.order_number).filter(Boolean);

  // Get invoices for these orders
  const { data: invoiceOrders } = await supabase
    .from("invoice_orders")
    .select("invoice_id, order_number")
    .in("order_number", orderNumbers);

  if (!invoiceOrders || invoiceOrders.length === 0) {
    return {
      delayed_invoices: [],
      message: "No invoices found for delayed orders.",
    };
  }

  const invoiceIds = invoiceOrders.map((io) => io.invoice_id).filter(Boolean);

  // Get invoice details
  const { data: invoices } = await supabase
    .from("invoices")
    .select(`
      id,
      invoice_id,
      invoice_number,
      invoice_date,
      invoice_total_amount,
      date_of_removal,
      customer_full_name
    `)
    .in("id", invoiceIds)
    .order("invoice_date", { ascending: false });

  // Create order map for status
  const orderMap = new Map(filteredOrders.map((o) => [o.order_number, o]));

      const delayedInvoices = (invoices || []).slice(0, 5).map((inv) => {
        const linkedOrder = invoiceOrders.find((io) => io.invoice_id === inv.id);
        const order = linkedOrder ? orderMap.get(linkedOrder.order_number) : null;

        return {
          invoice_id: inv.invoice_id,
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date,
          total_amount: inv.invoice_total_amount,
          customer_name: inv.customer_full_name,
          order_number: linkedOrder?.order_number || null,
          order_status: order?.order_status || "Running Late",
          original_eta: order?.original_eta || null,
          revised_eta: order?.revised_eta || null,
          delay_reason: order?.delay_reason || null,
        };
      });

      return {
        delayed_invoices: delayedInvoices,
        count: delayedInvoices.length,
        total_count: invoices?.length || 0,
        showing: delayedInvoices.length,
        message: invoices && invoices.length > 5 ? `Showing first 5 of ${invoices.length} delayed invoices. Ask for more if needed.` : undefined,
      };
}
