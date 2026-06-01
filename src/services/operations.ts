import type { AppRole, UserProfile } from "@/types/auth";
import { balanceOrdersForRole } from "@/lib/orders-balance";
import { getDistributorSqlAccountIds } from "@/lib/distributor-sql-accounts";
import {
  isOrdersAwaitingFactoryStatus,
  isOrdersCentralWarehouseStatus,
  isOrdersInProgressStatus,
  isOrdersLocalWarehouseStatus,
} from "@/lib/orders-view-filters";
import { isSqlServerDataEnabled } from "@/sql-server/config";
import { querySqlServer } from "@/sql-server/client";
import { ERP_ORDER_STATUS_CASE_SQL } from "@/sql-server/erp-order-status-case-sql";
import { estimateExpectedDeliveryDate, deriveOrderStatusFromERP } from "@/sql-server/order-lifecycle";
import { sqlServerGetLowStockProducts } from "@/sql-server/operations";

export interface DashboardMetrics {
  totalOrders: number;
  inProgress: number;
  ordersInLocalWarehouse: number;
  awaitingFactory: number;
  ordersInCentralWarehouse: number;
  ordersByStatus: Array<{ name: string; value: number }>;
  /** Grouped buckets for pipeline chart (same underlying rows as Orders tab). */
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
  let central = 0;
  let awaitingFactory = 0;
  let inPrep = 0;
  let dispatchReady = 0;
  let delivered = 0;
  for (const o of orders) {
    const s = String(o.status ?? "").toUpperCase();
    if (s === "DELIVERED") delivered++;
    else if (s === "DISPATCH_READY" || s.includes("DISPATCH")) dispatchReady++;
    else if (s === "AWAITING_FACTORY") awaitingFactory++;
    else if (s === "ALLOCATED_CENTRAL_WAREHOUSE") central++;
    else if (s === "IN_PREPARATION") inPrep++;
    else if (s === "ORDER_RECEIVED" || s === "ALLOCATED_LOCAL_WAREHOUSE") receivedLocal++;
    else receivedLocal++;
  }
  return [
    { name: "Received / local", value: receivedLocal },
    { name: "In preparation", value: inPrep },
    { name: "Central warehouse", value: central },
    { name: "Awaiting factory", value: awaitingFactory },
    { name: "Dispatch ready", value: dispatchReady },
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
  // If SQL Server is disabled, use Supabase fallback through getOrdersForRole
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

  if (isSqlServerDataEnabled()) {
    // SQL Server (ERP) orders list with role-based filtering and real status mapping.
    const ORDERS_LIMIT_DEFAULT = sqlLimit;

    if (profile.role === "warehouse" && profile.warehouse_id) {
      const { data } = await querySqlServer<{
        sales_order_id: number;
        voucher_number: string;
        voucher_date: string;
        analysis_id: number | null;
        shipping_type_ID: number | null;
        Total_Order_Amount: number | null;
        status: string;
      }>(
        `SELECT TOP ${ORDERS_LIMIT_DEFAULT}
           h.sales_order_id,
           h.voucher_number,
           h.voucher_date,
           h.analysis_id,
           h.shipping_type_ID,
           h.Total_Order_Amount,
           ${ERP_ORDER_STATUS_CASE_SQL} AS status
         FROM dbo.sales_order_header h
         WHERE EXISTS (
           SELECT 1
           FROM dbo.sales_order_body b
           WHERE b.sales_order_id = h.sales_order_id
             AND b.Despatch_Location_ID = @loc
         )
         ORDER BY h.voucher_date DESC`,
        { loc: profile.warehouse_id },
      );

      const ordersWithStatus = (data ?? []).map((r) => {
        const derivedStatus = String(r.status ?? "ORDER_RECEIVED");
        return {
          id: Number(r.sales_order_id),
          order_number: String(r.voucher_number ?? ""),
          status: derivedStatus,
          customer_name: null,
          expected_delivery_date: estimateExpectedDeliveryDate({
            voucherDate: String(r.voucher_date ?? ""),
            shippingTypeId: r.shipping_type_ID ?? null,
            warehouseId: r.analysis_id ?? profile.warehouse_id ?? null,
            status: derivedStatus,
            fromCreationDate: true,
          }),
          created_at: String(r.voucher_date ?? new Date().toISOString()),
          order_value: r.Total_Order_Amount == null ? null : Number(r.Total_Order_Amount),
        };
      });

      return shouldBalance ? balanceOrdersForRole(ordersWithStatus, profile.role) : ordersWithStatus;
    }

    if (profile.role === "distributor") {
      const accountIds = getDistributorSqlAccountIds(profile);
      console.log(`[getOrdersForRole] Distributor ${profile.user_id} (${profile.email}): resolved accountIds =`, accountIds);
      
      if (!accountIds.length) {
        console.warn(`[getOrdersForRole] No ERP account IDs for distributor company_id=${profile.company_id}. Set erp_account_ids in Supabase companies table.`);
        return [];
      }

      const placeholders = accountIds.map((_, i) => `@acc${i}`).join(", ");
      const params: Record<string, number> = {};
      accountIds.forEach((id, i) => {
        params[`acc${i}`] = id;
      });

      const { data } = await querySqlServer<{
        sales_order_id: number;
        voucher_number: string;
        voucher_date: any;
        analysis_id: number | null;
        shipping_type_ID: number | null;
        customer_name: string | null;
        Total_Order_Amount: number | null;
        status: string;
      }>(
        `SELECT TOP ${ORDERS_LIMIT_DEFAULT}
           h.sales_order_id,
           h.voucher_number,
           h.voucher_date,
           h.analysis_id,
           h.shipping_type_ID,
           h.Total_Order_Amount,
           LTRIM(RTRIM(m.FULL_NAME)) AS customer_name,
           ${ERP_ORDER_STATUS_CASE_SQL} AS status
         FROM dbo.sales_order_header h
         LEFT JOIN dbo.ACCOUNT_MASTER m ON m.ACCOUNT_ID = h.account_id
         WHERE h.account_id IN (${placeholders})
         ORDER BY h.voucher_date DESC`,
        params,
      );

      const ordersWithStatus = (data ?? []).map((r) => {
        const derivedStatus = String(r.status ?? "ORDER_RECEIVED");
        return {
          id: Number(r.sales_order_id),
          order_number: String(r.voucher_number ?? ""),
          status: derivedStatus,
          customer_name: r.customer_name != null ? String(r.customer_name) : null,
          expected_delivery_date: estimateExpectedDeliveryDate({
            voucherDate: String(r.voucher_date ?? ""),
            shippingTypeId: r.shipping_type_ID ?? null,
            warehouseId: r.analysis_id ?? null,
            status: derivedStatus,
            fromCreationDate: true,
          }),
          created_at: String(r.voucher_date ?? new Date().toISOString()),
          order_value: r.Total_Order_Amount == null ? null : Number(r.Total_Order_Amount),
        };
      });

      return shouldBalance ? balanceOrdersForRole(ordersWithStatus, profile.role) : ordersWithStatus;
    }

    if (profile.role === "super_admin") {
      const { data } = await querySqlServer<{
        sales_order_id: number;
        voucher_number: string;
        voucher_date: any;
        analysis_id: number | null;
        shipping_type_ID: number | null;
        customer_name: string | null;
        Total_Order_Amount: number | null;
        status: string;
      }>(
        `SELECT TOP ${ORDERS_LIMIT_DEFAULT}
           h.sales_order_id,
           h.voucher_number,
           h.voucher_date,
           h.analysis_id,
           h.shipping_type_ID,
           h.Total_Order_Amount,
           LTRIM(RTRIM(m.FULL_NAME)) AS customer_name,
           ${ERP_ORDER_STATUS_CASE_SQL} AS status
         FROM dbo.sales_order_header h
         INNER JOIN dbo.ACCOUNT_MASTER m ON m.ACCOUNT_ID = h.account_id
         ORDER BY h.voucher_date DESC`
      );

      const ordersWithStatus = (data ?? []).map((r) => {
        const derivedStatus = String(r.status ?? "ORDER_RECEIVED");
        return {
          id: Number(r.sales_order_id),
          order_number: String(r.voucher_number ?? ""),
          status: derivedStatus,
          customer_name: r.customer_name != null ? String(r.customer_name) : null,
          expected_delivery_date: estimateExpectedDeliveryDate({
            voucherDate: String(r.voucher_date ?? ""),
            shippingTypeId: r.shipping_type_ID ?? null,
            warehouseId: r.analysis_id ?? null,
            status: derivedStatus,
            fromCreationDate: true,
          }),
          created_at: String(r.voucher_date ?? new Date().toISOString()),
          order_value: r.Total_Order_Amount == null ? null : Number(r.Total_Order_Amount),
        };
      });

      return shouldBalance ? balanceOrdersForRole(ordersWithStatus, profile.role) : ordersWithStatus;
    }

    const { data } = await querySqlServer<{
      sales_order_id: number;
      voucher_number: string;
      voucher_date: any;
      analysis_id: number | null;
      shipping_type_ID: number | null;
      Total_Order_Amount: number | null;
      status: string;
    }>(
      `SELECT TOP ${ORDERS_LIMIT_DEFAULT}
         h.sales_order_id,
         h.voucher_number,
         h.voucher_date,
         h.analysis_id,
         h.shipping_type_ID,
         h.Total_Order_Amount,
         ${ERP_ORDER_STATUS_CASE_SQL} AS status
       FROM dbo.sales_order_header h
       ORDER BY h.voucher_date DESC`,
    );

    const ordersWithStatus = (data ?? []).map((r) => {
      const derivedStatus = String(r.status ?? "ORDER_RECEIVED");
      return {
        id: Number(r.sales_order_id),
        order_number: String(r.voucher_number ?? ""),
        status: derivedStatus,
        customer_name: null,
        expected_delivery_date: estimateExpectedDeliveryDate({
          voucherDate: String(r.voucher_date ?? ""),
          shippingTypeId: r.shipping_type_ID ?? null,
          warehouseId: r.analysis_id ?? null,
          status: derivedStatus,
          fromCreationDate: true,
        }),
        created_at: String(r.voucher_date ?? new Date().toISOString()),
        order_value: r.Total_Order_Amount == null ? null : Number(r.Total_Order_Amount),
      };
    });

    return shouldBalance ? balanceOrdersForRole(ordersWithStatus, profile.role) : ordersWithStatus;
  }
  
  // FALLBACK: Supabase Orders
  const { createSupabaseServerClient } = await import("@/supabase/server");
  const supabase = createSupabaseServerClient();
  
  let query = supabase
    .from("orders")
    .select("order_id, order_number, status, order_status, expected_delivery_date, created_at, order_value, company_id, warehouse_id")
    .order("created_at", { ascending: false });

  if (profile.role === "distributor" && profile.company_id) {
    query = query.eq("company_id", profile.company_id);
  } else if (profile.role === "warehouse" && profile.warehouse_id) {
    query = query.eq("warehouse_id", profile.warehouse_id);
  }

  const { data: rows } = await query.limit(
    shouldBalance
      ? profile.role === "super_admin" ? 100 : 50
      : Math.min(sqlLimit, profile.role === "super_admin" ? 5000 : 1000),
  );

  return (rows || []).map(r => ({
    id: r.order_id,
    order_number: r.order_number,
    status: r.status || r.order_status || "ORDER_RECEIVED",
    customer_name: null,
    expected_delivery_date: r.expected_delivery_date,
    created_at: r.created_at,
    order_value: r.order_value
  }));
}

export async function getInventoryForRole(profile: UserProfile) {
  if (isSqlServerDataEnabled()) {
    // SQL Server (ERP) inventory list
    const now = new Date().toISOString();
    const where =
      profile.role === "warehouse" && profile.warehouse_id
        ? "WHERE location_id = @loc"
        : "";
    const params: Record<string, number> = {};
    if (profile.role === "warehouse" && profile.warehouse_id) params.loc = profile.warehouse_id;

    const { data: rows } = await querySqlServer<{ product_id: number; location_id: number; STOCK_QTY: number }>(
      `SELECT TOP 50 product_id, location_id, STOCK_QTY
       FROM dbo.CurrentStock ${where}
       ORDER BY STOCK_QTY DESC`,
      params,
    );

    const productIds = Array.from(new Set((rows ?? []).map((r) => r.product_id)));
    const locationIds = Array.from(new Set((rows ?? []).map((r) => r.location_id)));

    // Correctly parameterize arrays for IN clauses
    const pPlaceholders = productIds.map((_, i) => `@p${i}`).join(",");
    const pParams: Record<string, number> = {};
    productIds.forEach((id, i) => { pParams[`p${i}`] = id; });

    const lPlaceholders = locationIds.map((_, i) => `@l${i}`).join(",");
    const lParams: Record<string, number> = {};
    locationIds.forEach((id, i) => { lParams[`l${i}`] = id; });

    const [productsRes, locationsRes] = await Promise.all([
      querySqlServer<{ product_id: number; catalogue_no: string | null; description: string | null }>(
        productIds.length
          ? `SELECT product_id, catalogue_no, description FROM dbo.Product_Master WHERE product_id IN (${pPlaceholders})`
          : "SELECT product_id, catalogue_no, description FROM dbo.Product_Master WHERE 1=0",
        pParams
      ),
      querySqlServer<{ Location_id: number; Description: string }>(
        locationIds.length
          ? `SELECT Location_id, Description FROM dbo.Location WHERE Location_id IN (${lPlaceholders})`
          : "SELECT Location_id, Description FROM dbo.Location WHERE 1=0",
        lParams
      ),
    ]);
    const pMap = new Map((productsRes.data ?? []).map((p) => [p.product_id, p]));
    const wMap = new Map((locationsRes.data ?? []).map((l) => [Number(l.Location_id), String(l.Description)]));

    return (rows ?? []).map((r) => {
      const p = pMap.get(r.product_id);
      const id = Number(r.location_id) * 1000000000 + Number(r.product_id);
      return {
        id,
        warehouse_id: Number(r.location_id),
        warehouse_name: wMap.get(Number(r.location_id)) ?? null,
        product_id: Number(r.product_id),
        available_qty: Number(r.STOCK_QTY ?? 0),
        reorder_level: 30,
        updated_at: now,
        products: p
          ? { name: String(p.description ?? "Product"), sku: String(p.catalogue_no ?? `PROD-${p.product_id}`) }
          : null,
      };
    });
  }
  
  // FALLBACK: Supabase Inventory
  const { createSupabaseServerClient } = await import("@/supabase/server");
  const supabase = createSupabaseServerClient();
  
  let query = supabase
    .from("inventory")
    .select("product_id, available_quantity, warehouse_id, updated_at")
    .order("updated_at", { ascending: false });

  if (profile.role === "warehouse" && profile.warehouse_id) {
    query = query.eq("warehouse_id", profile.warehouse_id);
  }

  const { data: rows } = await query.limit(50);
  
  if (!rows || rows.length === 0) return [];

  const productIds = Array.from(new Set(rows.map(r => r.product_id)));
  const warehouseIds = Array.from(new Set(rows.map(r => r.warehouse_id)));

  const [productsRes, warehousesRes] = await Promise.all([
    supabase.from("products").select("product_id, product_name, sku").in("product_id", productIds),
    supabase.from("warehouses").select("warehouse_id, warehouse_name").in("warehouse_id", warehouseIds)
  ]);

  const pMap = new Map((productsRes.data || []).map(p => [p.product_id, p]));
  const wMap = new Map((warehousesRes.data || []).map(w => [w.warehouse_id, w.warehouse_name]));

  return rows.map(r => ({
    id: r.warehouse_id * 1000000 + r.product_id,
    warehouse_id: r.warehouse_id,
    warehouse_name: wMap.get(r.warehouse_id) || null,
    product_id: r.product_id,
    available_qty: r.available_quantity,
    reorder_level: 30,
    updated_at: r.updated_at,
    products: pMap.has(r.product_id) ? {
      name: pMap.get(r.product_id)!.product_name,
      sku: pMap.get(r.product_id)!.sku
    } : null
  }));
}

export async function getAlerts(profile: UserProfile) {
  // Operational alerts should be derived from SQL Server only (no Supabase reads).
  // ERP does not store app "alerts" records in a dedicated table, so we approximate alerts
  // using low-stock signals.
  if (profile.role === "distributor") return [];

  const lowStockRes = await sqlServerGetLowStockProducts(profile);
  const products = (lowStockRes as { low_stock_products?: any[] })?.low_stock_products ?? [];
  const nowIso = new Date().toISOString();

  return products.map((p, idx) => ({
    id: String(idx),
    title: `Low stock: ${String(p?.product_name ?? "Unknown")} (${String(p?.sku ?? "-")})`,
    severity: "critical" as const,
    status: "open" as const,
    created_at: nowIso,
  }));
}

export function roleLabel(role: AppRole) {
  if (role === "super_admin") return "Super Admin";
  if (role === "warehouse") return "Warehouse Incharge";
  return "Distributor";
}
