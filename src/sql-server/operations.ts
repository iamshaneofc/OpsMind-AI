/**
 * Operations data from SQL Server (ERP schema).
 *
 * This implementation maps the existing chatbot tool contract to the ERP tables found in the
 * remote SQL Server database (e.g. `dbo.Location`, `dbo.sales_order_header`, `dbo.Sales_Invoice_Header`,
 * `dbo.Product_Master`, `dbo.CurrentStock`, ...).
 *
 * Auth and chat history remain in Supabase; only operational data is read from SQL Server.
 */
import type { UserProfile } from "@/types/auth";
import { getDistributorSqlAccountIds } from "@/lib/distributor-sql-accounts";
import { resolveCentralWarehouseLocationId } from "@/lib/erp-central-warehouse";
import { ERP_ORDER_STATUS_CASE_SQL } from "./erp-order-status-case-sql";
import { persistOrderPrediction, PREDICTION_MODEL_VERSION } from "@/lib/erp-order-predictions";
import { buildLaneAOrderSnapshot, orderHeadAgeUtcDays } from "./lane-a-snapshot";
import { deriveOrderLifecycleFromERP, deriveOrderStatusFromERP, estimateExpectedDeliveryDate } from "./order-lifecycle";
import { querySqlServer } from "./client";

/** ERP sales-order voucher style: 6.105.260218.2 or 11.105.260218.30 (optional extra numeric segment). */
export function looksLikeErpSalesOrderVoucherNumber(value: string): boolean {
  const v = value.trim();
  return /^\d+\.\d+\.\d+\.\d+(?:\.\d+)?$/.test(v) || /^SRL-/i.test(v);
}

/**
 * Tax / sales invoice vouchers in this ERP use transaction series **106** in the second segment
 * (e.g. 8.106.0.52690). Sales orders use **105** (e.g. 8.105.260218.39).
 */
export function looksLikeErpInvoiceVoucherNumber(value: string): boolean {
  const v = value.trim();
  if (!/^\d+\.\d+\.\d+\.\d+(?:\.\d+)?$/.test(v)) return false;
  const parts = v.split(".");
  return parts.length >= 2 && parts[1] === "106";
}

const DEFAULT_LIMIT = 100;

const LOW_STOCK_THRESHOLD = Number.isFinite(Number(process.env.LOW_STOCK_THRESHOLD))
  ? Number(process.env.LOW_STOCK_THRESHOLD)
  : 25;
const ERP_ORDER_LINES_NOT_POSTED_MSG = "Order exists but lines are not posted in ERP yet.";

/** Same response for missing order and cross-tenant lookup (does not leak existence). */
export const ERP_ORDER_NOT_FOUND_MSG = "Order not found. Please check the ID.";

/** Normalized equality on ERP `sales_order_header.voucher_number` (handles padding/spaces). Bind `@voucher`. */
function sqlSalesOrderHeaderVoucherMatch(tableAlias?: string): string {
  const col = tableAlias ? `${tableAlias}.voucher_number` : "voucher_number";
  return `LTRIM(RTRIM(CAST(${col} AS NVARCHAR(200)))) = LTRIM(RTRIM(CAST(@voucher AS NVARCHAR(200))))`;
}

type SalesOrderBodyRowStatus = {
  sales_order_body_id: number;
  sales_order_id: number;
  packing_id: number | null;
  order_qty: number;
  net_order_qty: number;
  Item_Total_Amount: number | null;
  printing_name: string | null;
  Despatch_Location_ID: number | null;
  catalogue_no: string | null;
};

/** Resolve Product_Master row from `sales_order_body.packing_id` via CurrentStock (same pattern as invoice line queries). */
/** Prefer a CurrentStock row that actually resolves to Product_Master (non-null product_id). */
const SALES_ORDER_BODY_PRODUCT_JOIN = `LEFT JOIN dbo.Product_Master pm
  ON pm.product_id = (
    SELECT TOP 1 cs.product_id
    FROM dbo.CurrentStock cs
    WHERE cs.packing_id = b.packing_id
      AND cs.product_id IS NOT NULL
    ORDER BY COALESCE(cs.STOCK_QTY, 0) DESC
  )`;

async function lineTotalsFromInvoiceBodies(salesOrderBodyIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const ids = [...new Set(salesOrderBodyIds.filter((id) => Number.isFinite(Number(id)) && Number(id) > 0))].map(Number);
  if (!ids.length) return out;
  const { data } = await querySqlServer<{ sales_order_body_id: number; total: number | null }>(
    `SELECT sales_order_body_id, SUM(COALESCE(item_amount, 0)) AS total
     FROM dbo.Sales_Invoice_Body
     WHERE sales_order_body_id IN (${ids.join(",")})
     GROUP BY sales_order_body_id`,
  );
  for (const r of data ?? []) {
    const id = Number(r.sales_order_body_id);
    const t = Number(r.total);
    if (Number.isFinite(id) && Number.isFinite(t)) out.set(id, t);
  }
  return out;
}

function formatSkuFromOrderLine(catalogueNo: string | null | undefined, packingId: number | null | undefined): string {
  const cat = catalogueNo != null ? String(catalogueNo).trim() : "";
  if (cat) return cat;
  const p = packingId != null ? Number(packingId) : NaN;
  if (Number.isFinite(p) && p > 0) return `PACK-${p}`;
  return "—";
}

function lineTotalFromBodyAndInvoices(
  row: { sales_order_body_id: number; Item_Total_Amount: number | null | undefined },
  invoiceTotals: Map<number, number>,
): number | null {
  const direct = row.Item_Total_Amount;
  if (direct != null && Number.isFinite(Number(direct))) return Number(direct);
  const fromInv = invoiceTotals.get(row.sales_order_body_id);
  if (fromInv != null && Number.isFinite(fromInv)) return fromInv;
  return null;
}

/** Lines for a voucher: join via all headers matching trimmed voucher, then fallback to `sales_order_id`. */
async function querySalesOrderBodyLinesForVoucher(
  voucher: string,
  salesOrderId: number,
): Promise<{ data: SalesOrderBodyRowStatus[]; error: Error | null }> {
  const cols = `b.sales_order_body_id, b.sales_order_id, b.packing_id, b.order_qty, b.net_order_qty, b.Item_Total_Amount, b.printing_name, b.Despatch_Location_ID, pm.catalogue_no`;
  const byVoucher = await querySqlServer<SalesOrderBodyRowStatus>(
    `SELECT ${cols}
     FROM dbo.sales_order_body b
     ${SALES_ORDER_BODY_PRODUCT_JOIN}
     WHERE b.sales_order_id IN (
       SELECT h.sales_order_id FROM dbo.sales_order_header h
       WHERE ${sqlSalesOrderHeaderVoucherMatch("h")}
     )
     ORDER BY b.sales_order_body_id ASC`,
    { voucher },
  );
  if (byVoucher.data?.length) return byVoucher;
  if (byVoucher.error) {
    const byId = await querySqlServer<SalesOrderBodyRowStatus>(
      `SELECT ${cols}
       FROM dbo.sales_order_body b
       ${SALES_ORDER_BODY_PRODUCT_JOIN}
       WHERE b.sales_order_id = @id
       ORDER BY b.sales_order_body_id ASC`,
      { id: salesOrderId },
    );
    return byId.data?.length ? byId : byVoucher;
  }
  return await querySqlServer<SalesOrderBodyRowStatus>(
    `SELECT ${cols}
     FROM dbo.sales_order_body b
     ${SALES_ORDER_BODY_PRODUCT_JOIN}
     WHERE b.sales_order_id = @id
     ORDER BY b.sales_order_body_id ASC`,
    { id: salesOrderId },
  );
}

type SalesOrderBodyRowDrilldown = {
  sales_order_body_id: number;
  printing_name: string | null;
  net_order_qty: number | null;
  order_qty: number | null;
  Item_Total_Amount: number | null;
  packing_id: number | null;
  catalogue_no: string | null;
};

async function querySalesOrderBodyLinesForVoucherDrilldown(
  voucher: string,
  salesOrderId: number,
): Promise<{ data: SalesOrderBodyRowDrilldown[]; error: Error | null }> {
  const cols = `b.sales_order_body_id, b.printing_name, b.net_order_qty, b.order_qty, b.Item_Total_Amount, b.packing_id, pm.catalogue_no`;
  const byVoucher = await querySqlServer<SalesOrderBodyRowDrilldown>(
    `SELECT ${cols}
     FROM dbo.sales_order_body b
     ${SALES_ORDER_BODY_PRODUCT_JOIN}
     WHERE b.sales_order_id IN (
       SELECT h.sales_order_id FROM dbo.sales_order_header h
       WHERE ${sqlSalesOrderHeaderVoucherMatch("h")}
     )
     ORDER BY b.sales_order_body_id ASC`,
    { voucher },
  );
  if (byVoucher.data?.length) return byVoucher;
  if (byVoucher.error) {
    const byId = await querySqlServer<SalesOrderBodyRowDrilldown>(
      `SELECT ${cols}
       FROM dbo.sales_order_body b
       ${SALES_ORDER_BODY_PRODUCT_JOIN}
       WHERE b.sales_order_id = @id
       ORDER BY b.sales_order_body_id ASC`,
      { id: salesOrderId },
    );
    return byId.data?.length ? byId : byVoucher;
  }
  return await querySqlServer<SalesOrderBodyRowDrilldown>(
    `SELECT ${cols}
     FROM dbo.sales_order_body b
     ${SALES_ORDER_BODY_PRODUCT_JOIN}
     WHERE b.sales_order_id = @id
     ORDER BY b.sales_order_body_id ASC`,
    { id: salesOrderId },
  );
}

type WarehouseRow = {
  warehouse_id: number;
  warehouse_name: string;
  address?: string | null;
};

async function listWarehouses(limit = DEFAULT_LIMIT): Promise<WarehouseRow[]> {
  const { data } = await querySqlServer<{
    Location_id: number;
    Description: string;
    Address: string | null;
  }>(`SELECT TOP ${limit} Location_id, Description, Address FROM dbo.Location ORDER BY Description`);

  return (data ?? []).map((r) => ({
    warehouse_id: Number(r.Location_id),
    warehouse_name: String(r.Description),
    address: r.Address ?? null,
  }));
}

async function getWarehouseById(warehouseId: number): Promise<WarehouseRow | null> {
  const { data } = await querySqlServer<{
    Location_id: number;
    Description: string;
    Address: string | null;
  }>(`SELECT TOP 1 Location_id, Description, Address FROM dbo.Location WHERE Location_id = @id`, {
    id: warehouseId,
  });
  const r = data?.[0];
  if (!r) return null;
  return {
    warehouse_id: Number(r.Location_id),
    warehouse_name: String(r.Description),
    address: r.Address ?? null,
  };
}

export async function getAccountName(accountId: number): Promise<string | null> {
  const { data } = await querySqlServer<{ FULL_NAME: string }>(
    `SELECT TOP 1 FULL_NAME FROM dbo.ACCOUNT_MASTER WHERE ACCOUNT_ID = @id`,
    { id: accountId },
  );
  return data?.[0]?.FULL_NAME ?? null;
}

/**
 * Debug helper: list ERP customer accounts directly from SQL Server.
 * Used when app-level distributor listing is failing (Supabase schema/RLS mismatch).
 */
export async function sqlServerListErpAccounts(limit: number, profile: UserProfile) {
  if (profile.role !== "super_admin") {
    return { error: "Access denied. Only Super Admin can list ERP accounts." };
  }

  const displayLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 100;
  const myAccountIds = getDistributorSqlAccountIds(profile);
  const myAccountIdsStr = myAccountIds.length > 0 ? myAccountIds.join(",") : "0";

  const { data, error } = await querySqlServer<{ ACCOUNT_ID: number; FULL_NAME: string | null; order_count: number }>(
    `SELECT TOP ${displayLimit} AM.ACCOUNT_ID, AM.FULL_NAME, COUNT(OH.sales_order_id) as order_count
     FROM dbo.ACCOUNT_MASTER AM
     LEFT JOIN dbo.State S ON AM.STATE_ID = S.State_id
     LEFT JOIN dbo.sales_order_header OH ON AM.ACCOUNT_ID = OH.account_id
     WHERE AM.ACTIVE = 1
       AND (S.Domestic_Export IS NULL OR S.Domestic_Export = 'D')
       AND LTRIM(RTRIM(ISNULL(AM.FULL_NAME, ''))) <> ''
     GROUP BY AM.ACCOUNT_ID, AM.FULL_NAME
     ORDER BY
       CASE WHEN AM.ACCOUNT_ID IN (${myAccountIdsStr}) THEN 0 ELSE 1 END,
       order_count DESC,
       AM.FULL_NAME ASC`,
  );

  if (error) {
    return { error: error.message || "Failed to query ACCOUNT_MASTER." };
  }

  return {
    accounts: (data ?? []).map((r) => ({
      erp_account_id: r.ACCOUNT_ID,
      account_name: r.FULL_NAME ?? null,
      order_count: r.order_count,
    })),
    showing: (data ?? []).length,
    total_count: (data ?? []).length,
    source: "sql_server",
  };
}

/**
 * Search ERP customer accounts by name or ID.
 * Returns more details than sqlServerListErpAccounts to help with mapping/extraction.
 */
export async function sqlServerSearchDistributors(search: string, profile: UserProfile) {
  if (profile.role !== "super_admin") {
    return { error: "Access denied. Only Super Admin can search all ERP accounts." };
  }

  const s = String(search ?? "").trim();
  if (!s) return { error: "Search term is required." };

  const like = `%${s}%`;
  const { data, error } = await querySqlServer<{
    ACCOUNT_ID: number;
    FULL_NAME: string | null;
    ADDRESS: string | null;
    CITY: string | null;
    TEL_NUMBER: string | null;
    EMAIL_ID: string | null;
    GST_NO: string | null;
    ACTIVE: boolean | number;
  }>(
    `SELECT TOP 10 ACCOUNT_ID, FULL_NAME, ADDRESS, CITY, TEL_NUMBER, EMAIL_ID, GST_NO, ACTIVE
     FROM dbo.ACCOUNT_MASTER
     WHERE (FULL_NAME LIKE @s OR CAST(ACCOUNT_ID AS NVARCHAR(50)) LIKE @s)
     ORDER BY FULL_NAME ASC`,
    { s: like },
  );

  if (error) {
    return { error: error.message || "Failed to search distributors." };
  }

  return {
    distributors: (data ?? []).map((r) => ({
      erp_account_id: r.ACCOUNT_ID,
      account_name: r.FULL_NAME ?? null,
      address: r.ADDRESS ?? null,
      city: r.CITY ?? null,
      tel_number: r.TEL_NUMBER ?? null,
      email: r.EMAIL_ID ?? null,
      gst_no: r.GST_NO ?? null,
      active: !!r.ACTIVE,
    })),
    count: (data ?? []).length,
    search_term: s,
  };
}

export async function sqlServerGetOrderStatus(
  orderNumber: string | number | undefined,
  profile: UserProfile
) {
  if (!orderNumber) return { error: "Order number is required." };

  const clean = String(orderNumber).trim();
  const numericSalesOrderId =
    /^\d+$/.test(clean) && Number.isFinite(Number(clean)) ? Number(clean) : null;

  const { data: headerByVoucher } = await querySqlServer<{
    sales_order_id: number;
    voucher_number: string;
    voucher_date: string;
    account_id: number;
    Total_Order_Amount: number | null;
    analysis_id: number | null;
    shipping_type_ID: number | null;
    customer_po_number: string | null;
  }>(
    `SELECT TOP 1 h.sales_order_id, h.voucher_number, h.voucher_date, h.account_id, h.Total_Order_Amount, h.analysis_id, h.shipping_type_ID, h.customer_po_number
     FROM dbo.sales_order_header h
     INNER JOIN dbo.ACCOUNT_MASTER AM ON h.account_id = AM.ACCOUNT_ID
     INNER JOIN dbo.State S ON AM.STATE_ID = S.State_id
     WHERE ${sqlSalesOrderHeaderVoucherMatch("h")}
       AND S.Domestic_Export = 'D'`,
    { voucher: clean },
  );

  let order = headerByVoucher?.[0];
  let matchedOn: "voucher_number" | "sales_order_id" | null = order ? "voucher_number" : null;

  // Accept numeric ERP sales_order_id input (e.g., "830401") in addition to voucher_number.
  if (!order && numericSalesOrderId !== null) {
    const { data: headerById } = await querySqlServer<{
      sales_order_id: number;
      voucher_number: string;
      voucher_date: string;
      account_id: number;
      Total_Order_Amount: number | null;
      analysis_id: number | null;
      shipping_type_ID: number | null;
      customer_po_number: string | null;
    }>(
      `SELECT TOP 1 h.sales_order_id, h.voucher_number, h.voucher_date, h.account_id, h.Total_Order_Amount, h.analysis_id, h.shipping_type_ID, h.customer_po_number
       FROM dbo.sales_order_header h
       INNER JOIN dbo.ACCOUNT_MASTER AM ON h.account_id = AM.ACCOUNT_ID
       INNER JOIN dbo.State S ON AM.STATE_ID = S.State_id
       WHERE h.sales_order_id = @orderId
         AND S.Domestic_Export = 'D'`,
      { orderId: numericSalesOrderId },
    );
    order = headerById?.[0];
    if (order) matchedOn = "sales_order_id";
  }

  if (!order) return { error: ERP_ORDER_NOT_FOUND_MSG };

  if (profile.role === "distributor") {
    const allowed = getDistributorSqlAccountIds(profile);
    if (!allowed.length) {
      return {
        error:
          "Your account is not linked to an ERP customer (companies.erp_account_id). Ask an admin to configure it.",
      };
    }
    if (!allowed.includes(Number(order.account_id))) {
      return { error: ERP_ORDER_NOT_FOUND_MSG };
    }
  }

  // NOTE: ERP schema doesn't have the same company-based mapping as Supabase.
  // We keep role checks minimal until a mapping table is added.
  if (profile.role === "warehouse" && profile.warehouse_id && order.analysis_id && profile.warehouse_id !== order.analysis_id) {
    // In ERP, `analysis_id` often denotes branch/location; if you use something else, we can adjust.
    return { error: ERP_ORDER_NOT_FOUND_MSG };
  }

  const voucherForLines = String(order.voucher_number ?? clean).trim();

  const [accountName, itemsRes, invoiceHeaderRes, derivedLifecycle] = await Promise.all([
    getAccountName(order.account_id),
    querySalesOrderBodyLinesForVoucher(voucherForLines, order.sales_order_id),
    // Find invoices linked to this order via Sales_Invoice_Body -> sales_order_body_id
    querySqlServer<{
      sales_invoice_header_id: number;
      voucher_number: string;
      voucher_date: string;
      INVOICE_AMOUNT: number | null;
      confirmed: boolean | null;
      DATE_OF_REMOVAL: string | null;
      TRANSPORT_NAME: string | null;
      VEHICLE_NUMBER: string | null;
    }>(
      `SELECT h.sales_invoice_header_id, h.voucher_number, h.voucher_date, h.INVOICE_AMOUNT, h.confirmed, h.DATE_OF_REMOVAL, h.TRANSPORT_NAME, h.VEHICLE_NUMBER
       FROM dbo.Sales_Invoice_Header h
       WHERE EXISTS (
         SELECT 1
         FROM dbo.Sales_Invoice_Body b
         JOIN dbo.sales_order_body sob ON sob.sales_order_body_id = b.sales_order_body_id
         WHERE b.sales_invoice_header_id = h.sales_invoice_header_id
           AND sob.sales_order_id = @orderId
       )
       ORDER BY h.voucher_date DESC`,
      { orderId: order.sales_order_id },
    ),
    deriveOrderLifecycleFromERP(order.sales_order_id),
  ]);

  const rawInvoices = invoiceHeaderRes.data ?? [];
  const status = derivedLifecycle.status;

  // Prioritize the invoice that actually has a removal date if we are looking for delivery details.
  const deliveryInvoice = rawInvoices.find(inv => inv.DATE_OF_REMOVAL != null) || rawInvoices[0];
  
  // Convert potential Date objects from DB into clean strings for JSON serialization.
  const formatDateForJson = (val: any) => {
    if (!val) return null;
    if (val instanceof Date) return val.toISOString();
    return String(val);
  };

  const orderVoucherIso =
    order.voucher_date != null ? String(order.voucher_date).slice(0, 10) : null;

  const laneAInput = {
    status: status,
    orderNumber: String(order.voucher_number ?? ""),
    voucherDate: formatDateForJson(order.voucher_date),
    expectedDeliveryDate: estimateExpectedDeliveryDate({
      voucherDate: String(order.voucher_date ?? ""),
      shippingTypeId: order.shipping_type_ID ?? null,
      warehouseId: order.analysis_id ?? null,
      status: status,
    }),
    isStockTransferOrder: String(order.customer_po_number ?? "").trim().toLowerCase() === "stock transfer",
    dateOfRemoval: formatDateForJson(deliveryInvoice?.DATE_OF_REMOVAL),
    transportName: String(deliveryInvoice?.TRANSPORT_NAME || "").trim() || null,
    transportDocumentNumber: String(deliveryInvoice?.VEHICLE_NUMBER || "").trim() || null,
    dispatchConfidence: derivedLifecycle.dispatch_confidence,
    dispatchReasonCode: derivedLifecycle.dispatch_reason_code,
    truthSignals: derivedLifecycle.truth_signals,
    awaitingFactoryAgeDays:
      status === "AWAITING_FACTORY" ? orderHeadAgeUtcDays(orderVoucherIso) : undefined,
    predictionVersion: PREDICTION_MODEL_VERSION,
  };

  const laneA = buildLaneAOrderSnapshot(laneAInput);

  void persistOrderPrediction({
    sales_order_id: order.sales_order_id,
    predicted_eta_center: laneA.expected_delivery_band.center_date ?? null,
    predicted_window_start: laneA.expected_delivery_band.window_start ?? null,
    predicted_window_end: laneA.expected_delivery_band.window_end ?? null,
    next_update_by_date: laneA.next_update_by,
    derived_status: status,
    truth_signals: derivedLifecycle.truth_signals,
    dispatch_confidence: derivedLifecycle.dispatch_confidence,
    prediction_version: PREDICTION_MODEL_VERSION,
  }).catch(() => {});

  const items_note =
    itemsRes.error != null
      ? "Line items could not be loaded from ERP (query error). Header details are still shown."
      : itemsRes.data?.length === 0
        ? ERP_ORDER_LINES_NOT_POSTED_MSG
        : undefined;

  const warehouse =
    order.analysis_id != null ? await getWarehouseById(Number(order.analysis_id)) : null;

  const invoiceCount = rawInvoices.length;
  const isStockTransferOrder = String(order.customer_po_number ?? "").trim().toLowerCase() === "stock transfer";
  const numericOrderValue = order.Total_Order_Amount == null ? null : Number(order.Total_Order_Amount);
  const shouldDisplayOrderValueAsNa =
    isStockTransferOrder && (numericOrderValue == null || !Number.isFinite(numericOrderValue) || numericOrderValue === 0);
    
  const rawLines = itemsRes.data ?? [];
  const positiveLines = rawLines.filter((i) => Number(i.net_order_qty ?? i.order_qty ?? 0) > 0);
  const invoiceLineTotals = await lineTotalsFromInvoiceBodies(positiveLines.map((i) => i.sales_order_body_id));
  const items = positiveLines.map((i) => {
    const cat = i.catalogue_no != null && String(i.catalogue_no).trim() ? String(i.catalogue_no).trim() : null;
    const pack = i.packing_id != null && Number.isFinite(Number(i.packing_id)) ? Number(i.packing_id) : null;
    return {
      product_id: null,
      product_name: i.printing_name ?? "Item",
      sku: formatSkuFromOrderLine(cat, pack),
      catalogue_no: cat,
      packing_id: pack,
      quantity: Number(i.net_order_qty ?? i.order_qty ?? 0),
      line_total: lineTotalFromBodyAndInvoices(i, invoiceLineTotals),
    };
  });

  return {
    document_type: "erp_sales_order",
    matched_on: matchedOn ?? "voucher_number",
    queried_value: clean,
    sales_order_id: Number(order.sales_order_id),
    assistant_reply_rules:
      "CRITICAL: You MUST output the line items of this order as a Markdown Table with columns for #, Product, SKU, Qty, and Line Total. You MUST ALSO output a separate Markdown Table for order details (Distributor, Status, Value, Expected Delivery). DO NOT use conversational bullet lists for these items. Let the UI parser handle tables.",
    order_number: order.voucher_number,
    order_date: order.voucher_date,
    status,
    order_status: status,
    expected_delivery_date: laneAInput.expectedDeliveryDate,
    original_eta: null,
    revised_eta: null,
    delivery_date: laneAInput.dateOfRemoval,
    delay_reason: null,
    company_id: null,
    warehouse_id: warehouse?.warehouse_id ?? null,
    warehouse_name: warehouse?.warehouse_name ?? null,
    customer_name: accountName,
    customer_po_number: order.customer_po_number,
    order_value: order.Total_Order_Amount ?? null,
    order_value_display: shouldDisplayOrderValueAsNa ? "N/A (Stock Transfer)" : order.Total_Order_Amount ?? null,
    invoice_count: invoiceCount,
    invoices: rawInvoices.map((inv) => ({
      invoice_number: inv.voucher_number,
      invoice_date: inv.voucher_date,
      invoice_total_amount: inv.INVOICE_AMOUNT ?? null,
      confirmed: inv.confirmed ?? null,
      date_of_removal: inv.DATE_OF_REMOVAL ?? null,
    })),
    items,
    items_count: items.length,
    /** Phase 1 Lane B: indicative estimated delivery window, next update commitment, next action (for chat / future WhatsApp). */
    lane_a: laneA,
    manual_allocation: derivedLifecycle.manual_allocation ?? null,
    dispatch_confidence: derivedLifecycle.dispatch_confidence,
    dispatch_reason_code: derivedLifecycle.dispatch_reason_code,
    has_transport_hint: derivedLifecycle.has_transport_hint,
    ...(items_note ? { items_note } : {}),
  };
}

export async function sqlServerGetDistributorOrders(companyId: number, profile: UserProfile) {
  if (!Number.isFinite(companyId)) return { error: "Invalid company id." };
  if (profile.role === "distributor" && profile.company_id !== companyId) return { error: "Access denied for this company." };

  const accountIds = getDistributorSqlAccountIds(profile);
  console.log(`[sqlServerGetDistributorOrders] Distributor ${profile.user_id}: resolved accountIds =`, accountIds);
  if (!accountIds.length) {
    return {
      error:
        "ERP account mapping missing. Contact your system administrator to configure the ERP account settings for your company.",
    };
  }

  const placeholders = accountIds.map((_, i) => `@a${i}`).join(", ");
  const params: Record<string, number> = {};
  accountIds.forEach((id, i) => {
    params[`a${i}`] = id;
  });

  const { data: orders } = await querySqlServer<{
    sales_order_id: number;
    voucher_number: string;
    voucher_date: string;
    account_id: number;
    Total_Order_Amount: number | null;
    status: string;
  }>(
    `SELECT TOP 800
       h.sales_order_id,
       h.voucher_number,
       h.voucher_date,
       h.account_id,
       h.Total_Order_Amount,
       ${ERP_ORDER_STATUS_CASE_SQL} AS status
     FROM dbo.sales_order_header h
     WHERE account_id IN (${placeholders})
     ORDER BY h.voucher_date DESC`,
    params,
  );

  const enriched = await Promise.all(
    (orders ?? []).map(async (o) => ({
      order_number: o.voucher_number,
      status: String(o.status ?? "PENDING"),
      expected_delivery_date: null,
      order_date: o.voucher_date,
      order_value: o.Total_Order_Amount ?? null,
      customer_name: await getAccountName(o.account_id),
    })),
  );

  const awaiting = enriched.filter(o => o.status === 'AWAITING_FACTORY');
  const allocated = enriched.filter(o => o.status === 'ALLOCATED_CENTRAL_WAREHOUSE');
  const diff = enriched.filter(o => o.status !== 'AWAITING_FACTORY' && o.status !== 'ALLOCATED_CENTRAL_WAREHOUSE' && o.status !== 'DELIVERED');
  const delivered = enriched.filter(o => o.status === 'DELIVERED');
  
  const quota = 20;
  const balancedOrders = [...awaiting, ...allocated, ...diff];
  if (balancedOrders.length < quota) {
    balancedOrders.push(...delivered.slice(0, quota - balancedOrders.length));
  }
  
  balancedOrders.sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime());

  return { 
    orders: balancedOrders, 
    total_count: balancedOrders.length, 
    showing: balancedOrders.length,
    assistant_reply_rules: "CRITICAL: You MUST output these orders as a Markdown Table with columns for Order Number, Distributor Name, Status, and Order Value. NEVER use numbered text bullet lists."
  };
}

/**
 * SQL-only distributor order listing by distributor name.
 * Used when the user provides a distributor name instead of internal company_id,
 * and we can't rely on app-profile -> ERP account mapping.
 */
export async function sqlServerGetDistributorOrdersByName(distributorName: string, _profile: UserProfile) {
  const name = distributorName.trim();
  if (!name) return { error: "Distributor name is required." };

  // Resolve distributor ERP account(s) by matching ERP customer full name.
  const search = `%${name}%`;
  let { data: accounts } = await querySqlServer<{ ACCOUNT_ID: number; FULL_NAME: string | null }>(
    `SELECT TOP 10 AM.ACCOUNT_ID, AM.FULL_NAME
     FROM dbo.ACCOUNT_MASTER AM
     INNER JOIN dbo.State S ON AM.STATE_ID = S.State_id
     WHERE (AM.FULL_NAME LIKE @s OR CAST(AM.ACCOUNT_ID AS NVARCHAR(50)) LIKE @s)
       AND S.Domestic_Export = 'D'
     ORDER BY AM.FULL_NAME ASC`,
    { s: search },
  );

  // Fallback for punctuation/format differences (e.g. "Limited Mumbai" vs "Limited, Mumbai").
  if (!(accounts ?? []).length) {
    const tokens = Array.from(
      new Set(
        name
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .map((t) => t.trim())
          .filter((t) => t.length >= 3),
      ),
    );

    if (tokens.length) {
      const topN = Math.min(tokens.length, 8);
      const whereClauses = Array.from({ length: topN }, (_, i) =>
        `(LTRIM(RTRIM(m.FULL_NAME)) COLLATE SQL_Latin1_General_CP1_CI_AI LIKE @t${i}a OR LTRIM(RTRIM(m.FULL_NAME)) COLLATE SQL_Latin1_General_CP1_CI_AI LIKE @t${i}b)`,
      ).join(" AND ");
      const tokenParams: Record<string, string> = {};
      for (let i = 0; i < topN; i += 1) {
        const token = tokens[i];
        const singular = token.endsWith("s") && token.length > 3 ? token.slice(0, -1) : token;
        const plural = singular.endsWith("s") ? singular : `${singular}s`;
        tokenParams[`t${i}a`] = `%${singular}%`;
        tokenParams[`t${i}b`] = `%${plural}%`;
      }

      const tokenRes = await querySqlServer<{ ACCOUNT_ID: number; FULL_NAME: string | null }>(
        `SELECT TOP 20 m.ACCOUNT_ID, m.FULL_NAME
         FROM dbo.ACCOUNT_MASTER m
         WHERE ${whereClauses}
         ORDER BY m.FULL_NAME ASC`,
        tokenParams,
      );
      accounts = tokenRes.data ?? [];
    }
  }

  const accountIds = Array.from(new Set((accounts ?? []).map((a) => a.ACCOUNT_ID).filter(Boolean)));
  if (!accountIds.length) {
    return { error: `No ERP account found matching "${distributorName}".` };
  }

  const placeholders = accountIds.map((_, i) => `@acc${i}`).join(", ");
  const params: Record<string, number> = {};
  accountIds.forEach((id, i) => {
    params[`acc${i}`] = id;
  });

  const { data: rows } = await querySqlServer<{
    sales_order_id: number;
    voucher_number: string;
    voucher_date: string;
    status: string;
    Total_Order_Amount: number | null;
    customer_name: string | null;
  }>(
    `SELECT TOP 800
       h.sales_order_id,
       h.voucher_number,
       h.voucher_date,
       h.Total_Order_Amount,
       LTRIM(RTRIM(m.FULL_NAME)) AS customer_name,
       ${ERP_ORDER_STATUS_CASE_SQL} AS status
     FROM dbo.sales_order_header h
     LEFT JOIN dbo.ACCOUNT_MASTER m ON m.ACCOUNT_ID = h.account_id
     WHERE h.account_id IN (${placeholders})
     ORDER BY h.voucher_date DESC`,
    params,
  );

  const orders = (rows ?? []).map((r) => ({
    order_number: String(r.voucher_number ?? ""),
    status: String(r.status ?? "PENDING"),
    order_date: r.voucher_date,
    expected_delivery_date: null,
    warehouse_id: null,
    customer_name: r.customer_name ?? distributorName,
    order_value: r.Total_Order_Amount == null ? null : Number(r.Total_Order_Amount),
  }));

  const awaiting = orders.filter(o => o.status === 'AWAITING_FACTORY');
  const allocated = orders.filter(o => o.status === 'ALLOCATED_CENTRAL_WAREHOUSE');
  const diff = orders.filter(o => o.status !== 'AWAITING_FACTORY' && o.status !== 'ALLOCATED_CENTRAL_WAREHOUSE' && o.status !== 'DELIVERED');
  const delivered = orders.filter(o => o.status === 'DELIVERED');
  
  const quota = 20;
  const balancedOrders = [...awaiting, ...allocated, ...diff];
  if (balancedOrders.length < quota) {
    balancedOrders.push(...delivered.slice(0, quota - balancedOrders.length));
  }
  
  balancedOrders.sort((a, b) => new Date(b.order_date || 0).getTime() - new Date(a.order_date || 0).getTime());

  return {
    orders: balancedOrders,
    total_count: balancedOrders.length,
    showing: balancedOrders.length,
    assistant_reply_rules: "CRITICAL: You MUST output these orders exclusively as a Markdown Table with columns for Order Number, Status, etc. DO NOT use single line numbered bullet text."
  };
}

export async function sqlServerGetWarehouseInventory(warehouseId: number, profile: UserProfile) {
  if (!Number.isFinite(warehouseId)) return { error: "Invalid warehouse id." };
  if (profile.role === "warehouse") {
    if (!profile.warehouse_id) return { error: "Access denied. Your account is not associated with a warehouse." };
    if (profile.warehouse_id !== warehouseId)
      return { error: "Access denied for this warehouse." };
  }

  // Use CurrentStock by location_id (warehouseId) and join Product_Master for description / catalogue_no.
  const { data: rows } = await querySqlServer<{
    product_id: number;
    STOCK_QTY: number;
  }>(
    `SELECT TOP ${DEFAULT_LIMIT} product_id, STOCK_QTY
     FROM dbo.CurrentStock
     WHERE location_id = @loc
     ORDER BY STOCK_QTY DESC`,
    { loc: warehouseId },
  );
  if (!rows?.length) return [];

  const productIds = Array.from(new Set(rows.map((r) => r.product_id)));
  const { data: products } = await querySqlServer<{
    product_id: number;
    catalogue_no: string | null;
    description: string | null;
  }>(
    productIds.length
      ? `SELECT product_id, catalogue_no, description FROM dbo.Product_Master WHERE product_id IN (${productIds.join(",")})`
      : "SELECT product_id, catalogue_no, description FROM dbo.Product_Master WHERE 1=0",
  );
  const pMap = new Map((products ?? []).map((p) => [p.product_id, p]));
  const wh = await getWarehouseById(warehouseId);

  return rows.map((row) => {
    const p = pMap.get(row.product_id);
    return {
      available_qty: row.STOCK_QTY,
      reorder_level: 30,
      product_name: p?.description ?? null,
      sku: p?.catalogue_no ?? (p ? `PROD-${p.product_id}` : null),
      warehouse_name: wh?.warehouse_name ?? null,
    };
  });
}

export async function sqlServerGetDelayedOrders(profile: UserProfile) {
  if (profile.role === "distributor") {
    const accountIds = getDistributorSqlAccountIds(profile);
    if (!accountIds.length) {
      return {
        error:
          "I'm unable to retrieve your ERP details due to missing ERP account mapping in the system. Please contact your system administrator to configure the ERP account settings for your company.",
      };
    }
  }
  const where: string[] = [];
  const params: Record<string, number> = {};

  if (profile.role === "warehouse" && profile.warehouse_id) {
    where.push(
      `EXISTS (
         SELECT 1
         FROM dbo.sales_order_body wb
         WHERE wb.sales_order_id = h.sales_order_id
           AND wb.Despatch_Location_ID = @loc
       )`,
    );
    params.loc = profile.warehouse_id;
  }

  // Performance guardrail: evaluate delayed orders from the last 6 months only.
  where.push("h.voucher_date >= DATEADD(MONTH, -6, CAST(GETDATE() AS DATE))");

  // Domestic filter: only show orders for Indian distributors (Domestic_Export = 'D')
  where.push(`EXISTS (
    SELECT 1 FROM dbo.ACCOUNT_MASTER AM
    INNER JOIN dbo.State S ON AM.STATE_ID = S.State_id
    WHERE AM.ACCOUNT_ID = h.account_id AND S.Domestic_Export = 'D'
  )`);

  if (profile.role === "distributor") {
    const accountIds = getDistributorSqlAccountIds(profile);
    const placeholders = accountIds.map((_, i) => `@acc${i}`).join(", ");
    where.push(`h.account_id IN (${placeholders})`);
    accountIds.forEach((id, i) => {
      params[`acc${i}`] = id;
    });
  }

  const scopedWhere = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { data: rows } = await querySqlServer<{
    sales_order_id: number;
    voucher_number: string;
    voucher_date: string;
    analysis_id: number | null;
    shipping_type_ID: number | null;
    Total_Order_Amount: number | null;
    status: string;
  }>(
    `SELECT TOP 800
       h.sales_order_id,
       h.voucher_number,
       h.voucher_date,
       h.analysis_id,
       h.shipping_type_ID,
       h.Total_Order_Amount,
       ${ERP_ORDER_STATUS_CASE_SQL} AS status
     FROM dbo.sales_order_header h
     ${scopedWhere}
     ORDER BY h.voucher_date DESC`,
    params,
  );

  const now = new Date();
  const delayed: Array<{
    order_id: number;
    order_number: string;
    status: string;
    order_date: string;
    expected_delivery_date: string | null;
    days_delayed: number;
    order_value: number | null;
  }> = [];

  for (const r of rows ?? []) {
    const status = String(r.status ?? "");
    if (String(status).toUpperCase() === "DELIVERED") continue;

    const expected = estimateExpectedDeliveryDate({
      voucherDate: String(r.voucher_date ?? ""),
      shippingTypeId: r.shipping_type_ID ?? null,
      warehouseId: r.analysis_id ?? null,
      status,
      fromCreationDate: true,
    });
    if (!expected) continue;
    const expectedDate = new Date(expected);
    if (Number.isNaN(expectedDate.getTime())) continue;
    if (now <= expectedDate) continue;

    const daysDelayed = Math.max(1, Math.floor((now.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24)));
    delayed.push({
      order_id: Number(r.sales_order_id),
      order_number: String(r.voucher_number ?? ""),
      status: String(status),
      order_date: String(r.voucher_date ?? ""),
      expected_delivery_date: expected,
      days_delayed: daysDelayed,
      order_value: r.Total_Order_Amount == null ? null : Number(r.Total_Order_Amount),
    });
  }

  delayed.sort((a, b) => b.days_delayed - a.days_delayed);
  const slice = delayed.slice(0, 20);
  return {
    delayed_orders: slice,
    total_count: delayed.length,
    showing: slice.length,
    message: delayed.length ? undefined : "No orders are currently delayed.",
  };
}

export async function sqlServerGetLowStockProducts(profile: UserProfile) {
  // Use configurable low-stock threshold (default 25), by location for warehouse users.
  let where = "WHERE STOCK_QTY <= @threshold";
  const params: Record<string, number> = {};
  params.threshold = LOW_STOCK_THRESHOLD;
  if (profile.role === "warehouse" && profile.warehouse_id) {
    where = "WHERE STOCK_QTY <= @threshold AND location_id = @loc";
    params.loc = profile.warehouse_id;
  }
  const { data: rows } = await querySqlServer<{ product_id: number; location_id: number; STOCK_QTY: number }>(
    `SELECT TOP ${DEFAULT_LIMIT} product_id, location_id, STOCK_QTY FROM dbo.CurrentStock ${where} ORDER BY STOCK_QTY ASC`,
    params,
  );
  if (!rows?.length) return { low_stock_products: [], total_count: 0, message: "No low stock products found." };

  const productIds = Array.from(new Set(rows.map((r) => r.product_id)));
  const locationIds = Array.from(new Set(rows.map((r) => r.location_id)));
  const [productsRes, locRes] = await Promise.all([
    querySqlServer<{ product_id: number; catalogue_no: string | null; description: string | null }>(
      productIds.length
        ? `SELECT product_id, catalogue_no, description FROM dbo.Product_Master WHERE product_id IN (${productIds.join(",")})`
        : "SELECT product_id, catalogue_no, description FROM dbo.Product_Master WHERE 1=0",
    ),
    querySqlServer<{ Location_id: number; Description: string }>(
      locationIds.length
        ? `SELECT Location_id, Description FROM dbo.Location WHERE Location_id IN (${locationIds.join(",")})`
        : "SELECT Location_id, Description FROM dbo.Location WHERE 1=0",
    ),
  ]);

  const pMap = new Map((productsRes.data ?? []).map((p) => [p.product_id, p]));
  const lMap = new Map((locRes.data ?? []).map((l) => [Number(l.Location_id), String(l.Description)]));

  const lowStockProducts = rows.map((row) => {
    const p = pMap.get(row.product_id);
    return {
      available_qty: row.STOCK_QTY,
      reorder_level: LOW_STOCK_THRESHOLD,
      warehouse_id: row.location_id,
      warehouse_name: lMap.get(row.location_id) ?? null,
      product_name: p?.description ?? null,
      sku: p?.catalogue_no ?? (p ? `PROD-${p.product_id}` : null),
    };
  });

  return { low_stock_products: lowStockProducts, total_count: lowStockProducts.length, showing: lowStockProducts.length };
}

export async function sqlServerSearchWarehouseByName(name: string, _profile: UserProfile) {
  if (!name.trim()) return { error: "Warehouse name is required." };
  const search = `%${name.trim()}%`;
  const { data } = await querySqlServer<{ Location_id: number; Description: string; Address: string | null }>(
    `SELECT TOP 5 Location_id, Description, Address
     FROM dbo.Location
     WHERE Description LIKE @s OR Address LIKE @s
     ORDER BY Description`,
    { s: search },
  );
  if (!data?.length) return { error: `No warehouse found matching "${name}".` };
  const mapped = data.map((r) => ({
    warehouse_id: Number(r.Location_id),
    warehouse_name: String(r.Description),
    location: r.Address ?? null,
  }));
  if (mapped.length === 1) return mapped[0];
  return { matches: mapped, message: `Found ${mapped.length} warehouses matching "${name}".` };
}

export async function sqlServerGetDispatchQueue(profile: UserProfile) {
  // Approximation: orders that are not yet invoiced.
  // True dispatch queue requires a business rule; we implement a simple "open orders" list.
  const { data } = await querySqlServer<{
    sales_order_id: number;
    voucher_number: string;
    voucher_date: string;
    account_id: number;
    Total_Order_Amount: number | null;
    status: string;
  }>(
    `SELECT TOP ${DEFAULT_LIMIT}
       h.sales_order_id,
       h.voucher_number,
       h.voucher_date,
       h.account_id,
       h.Total_Order_Amount,
       ${ERP_ORDER_STATUS_CASE_SQL} AS status
     FROM dbo.sales_order_header h
     INNER JOIN dbo.ACCOUNT_MASTER AM ON h.account_id = AM.ACCOUNT_ID
     INNER JOIN dbo.State S ON AM.STATE_ID = S.State_id
     WHERE ${ERP_ORDER_STATUS_CASE_SQL} = 'DISPATCH_READY'
       AND S.Domestic_Export = 'D'
     ORDER BY h.voucher_date DESC`,
  );

  const mapped = await Promise.all(
    (data ?? []).map(async (o) => ({
      order_id: o.sales_order_id,
      order_number: o.voucher_number,
      status: String(o.status ?? "DISPATCH_READY"),
      expected_delivery_date: null,
      warehouse_id: null,
      order_status: String(o.status ?? "DISPATCH_READY"),
      delivery_date: null,
      customer_name: await getAccountName(o.account_id),
      order_value: o.Total_Order_Amount ?? null,
    })),
  );
  return mapped;
}

export async function sqlServerGetOrdersByWarehouse(warehouseId: number, profile: UserProfile) {
  if (!Number.isFinite(warehouseId)) return { error: "Invalid warehouse id." };
  if (profile.role === "warehouse") {
    if (!profile.warehouse_id) return { error: "Access denied." };
    const centralId = resolveCentralWarehouseLocationId();
    if (profile.warehouse_id !== warehouseId && warehouseId !== centralId) {
      return { error: "Access denied for this warehouse." };
    }
  }
  const whereClauses: string[] = [
    `(h.analysis_id = @loc OR EXISTS (
      SELECT 1 FROM dbo.sales_order_body b
      WHERE b.sales_order_id = h.sales_order_id AND b.Despatch_Location_ID = @loc
    ))`,
  ];
  const params: Record<string, string | number> = { loc: warehouseId };

  // Domestic filter: only show orders for Indian distributors (Domestic_Export = 'D')
  whereClauses.push(`EXISTS (
    SELECT 1 FROM dbo.ACCOUNT_MASTER AM
    INNER JOIN dbo.State S ON AM.STATE_ID = S.State_id
    WHERE AM.ACCOUNT_ID = h.account_id AND S.Domestic_Export = 'D'
  )`);

  if (profile.role === "distributor") {
    const accountIds = getDistributorSqlAccountIds(profile);
    if (!accountIds.length) {
      return { error: "Your distributor ERP account mapping is missing." };
    }
    const placeholders = accountIds.map((_, i) => `@acc${i}`).join(", ");
    whereClauses.push(`h.account_id IN (${placeholders})`);
    accountIds.forEach((id, i) => {
      params[`acc${i}`] = id;
    });
  }

  // Super admin: do not narrow to a hard-coded distributor subset.
  // Keep full ERP scope so queries work for Shiva and all distributors.

  const { data, error: sqlErr } = await querySqlServer<{
    sales_order_id: number;
    voucher_number: string;
    voucher_date: string;
    account_id: number;
    Total_Order_Amount: number | null;
    status: string;
  }>(
    `SELECT TOP ${DEFAULT_LIMIT}
       h.sales_order_id,
       h.voucher_number,
       h.voucher_date,
       h.account_id,
       h.Total_Order_Amount,
       ${ERP_ORDER_STATUS_CASE_SQL} AS status
     FROM dbo.sales_order_header h
     WHERE ${whereClauses.join(" AND ")}
     ORDER BY h.voucher_date DESC`,
    params,
  );

  if (sqlErr) {
    return { error: sqlErr.message };
  }

  const wh = await getWarehouseById(warehouseId);
  const mapped = await Promise.all(
    (data ?? []).map(async (o) => ({
      order_id: o.sales_order_id,
      order_number: o.voucher_number,
      status: String(o.status ?? "PENDING"),
      expected_delivery_date: null,
      created_at: String(o.voucher_date ?? ""),
      warehouse_id: warehouseId,
      warehouse_name: wh?.warehouse_name ?? null,
      customer_name: await getAccountName(o.account_id),
      order_value: o.Total_Order_Amount ?? null,
    })),
  );
  return {
    orders: mapped,
    total_count: mapped.length,
    assistant_reply_rules: "CRITICAL: Return this list entirely as a Markdown Table. DO NOT format this as a numbered list of strings."
  }
}

export async function sqlServerGetAllWarehouses(profile: UserProfile) {
  if (profile.role !== "super_admin" && profile.role !== "distributor") {
    return { error: "Access denied. Only Super Admin and Distributor can view all warehouses." };
  }
  const warehouses = await listWarehouses(100);
  return warehouses.map((w) => ({
    warehouse_id: w.warehouse_id,
    warehouse_name: w.warehouse_name,
    location: w.address ?? null,
  }));
}

export async function sqlServerGetAllInventory(profile: UserProfile) {
  if (profile.role !== "super_admin" && profile.role !== "distributor") {
    return { error: "Access denied. Only Super Admin and Distributor can view all inventory." };
  }
  const { data: rows } = await querySqlServer<{ product_id: number; location_id: number; packing_id: number; STOCK_QTY: number }>(
    `SELECT TOP ${DEFAULT_LIMIT} product_id, location_id, packing_id, STOCK_QTY
     FROM dbo.CurrentStock
     ORDER BY STOCK_QTY DESC`,
  );
  if (!rows?.length) return [];
  const productIds = Array.from(new Set(rows.map((r) => r.product_id)));
  const locationIds = Array.from(new Set(rows.map((r) => r.location_id)));
  const [productsRes, locRes] = await Promise.all([
    querySqlServer<{ product_id: number; catalogue_no: string | null; description: string | null }>(
      productIds.length
        ? `SELECT product_id, catalogue_no, description FROM dbo.Product_Master WHERE product_id IN (${productIds.join(",")})`
        : "SELECT product_id, catalogue_no, description FROM dbo.Product_Master WHERE 1=0",
    ),
    querySqlServer<{ Location_id: number; Description: string }>(
      locationIds.length
        ? `SELECT Location_id, Description FROM dbo.Location WHERE Location_id IN (${locationIds.join(",")})`
        : "SELECT Location_id, Description FROM dbo.Location WHERE 1=0",
    ),
  ]);
  const pMap = new Map((productsRes.data ?? []).map((p) => [p.product_id, p]));
  const lMap = new Map((locRes.data ?? []).map((l) => [Number(l.Location_id), String(l.Description)]));

  const items = rows.map((row) => {
    const p = pMap.get(row.product_id);
    return {
      available_qty: row.STOCK_QTY,
      reorder_level: 30,
      warehouse_id: row.location_id,
      warehouse_name: lMap.get(row.location_id) ?? null,
      product_name: p?.description ?? null,
      sku: p?.catalogue_no ?? (p ? `PROD-${p.product_id}` : null),
    };
  });
  return {
    inventory: items,
    assistant_reply_rules: "CRITICAL: You MUST output this inventory as a Markdown Table. DO NOT use lists or text."
  };
}

// Invoice/order drilldown and company invoices: fallback to Supabase or return a clear message when using SQL Server with a different schema.
export async function sqlServerGetInvoiceDetails(_invoiceNumber: string, _profile: UserProfile) {
  const invoiceNumber = _invoiceNumber.trim();
  if (!invoiceNumber) return { error: "Invoice number is required." };

  const { data: invs } = await querySqlServer<{
    sales_invoice_header_id: number;
    voucher_number: string;
    voucher_date: string;
    INVOICE_AMOUNT: number | null;
    base_amount: number | null;
    tax_amount: number | null;
    discount_amount: number | null;
    confirmed: boolean | null;
    TRANSPORT_NAME: string | null;
    VEHICLE_NUMBER: string | null;
    DATE_OF_REMOVAL: string | null;
    account_id: number;
  }>(
    `SELECT TOP 1 sales_invoice_header_id, voucher_number, voucher_date, INVOICE_AMOUNT, base_amount, tax_amount, discount_amount,
            confirmed, TRANSPORT_NAME, VEHICLE_NUMBER, DATE_OF_REMOVAL, account_id
     FROM dbo.Sales_Invoice_Header
     WHERE voucher_number = @v`,
    { v: invoiceNumber },
  );

  const inv = invs?.[0];
  if (!inv) return { error: `Invoice not found: ${invoiceNumber}` };

  const [customerName, itemsRes] = await Promise.all([
    getAccountName(inv.account_id),
    querySqlServer<{
      sales_invoice_body_id: number;
      qty: number;
      item_amount: number | null;
      base_amount: number | null;
      sales_order_id: number | null;
      Despatch_Location_ID: number | null;
      packing_id: number | null;
      catalogue_no: string | null;
      description: string | null;
    }>(
      `SELECT
         sib.sales_invoice_body_id,
         sib.qty,
         sib.item_amount,
         sib.base_amount,
         sob.sales_order_id,
         sob.Despatch_Location_ID,
         sob.packing_id,
         pm.catalogue_no,
         pm.description
       FROM dbo.Sales_Invoice_Body sib
       INNER JOIN dbo.sales_order_body sob
         ON sob.sales_order_body_id = sib.sales_order_body_id
       LEFT JOIN dbo.Product_Master pm
         ON pm.product_id = (
           SELECT TOP 1 cs.product_id
           FROM dbo.CurrentStock cs
           WHERE cs.packing_id = sob.packing_id
             AND cs.product_id IS NOT NULL
           ORDER BY COALESCE(cs.STOCK_QTY, 0) DESC
         )
       WHERE sib.sales_invoice_header_id = @id
       ORDER BY sib.sales_invoice_body_id`,
      { id: inv.sales_invoice_header_id },
    ),
  ]);

  const rawItems = itemsRes.data ?? [];
  const salesOrderIds = Array.from(
    new Set(
      rawItems
        .map((it) => it.sales_order_id)
        .filter((x): x is number => typeof x === "number" && Number.isFinite(x)),
    ),
  );

  const [orderHeadersRes, orderStatusMapEntries] = await Promise.all([
    querySqlServer<{ sales_order_id: number; voucher_date: string; shipping_type_ID: number | null }>(
      salesOrderIds.length
        ? `SELECT sales_order_id, voucher_date, shipping_type_ID
           FROM dbo.sales_order_header
           WHERE sales_order_id IN (${salesOrderIds.join(",")})`
        : "SELECT sales_order_id, voucher_date, shipping_type_ID FROM dbo.sales_order_header WHERE 1=0",
    ),
    Promise.all(
      salesOrderIds.map(async (sales_order_id) => {
        const status = await deriveOrderStatusFromERP(sales_order_id);
        return [sales_order_id, status] as const;
      }),
    ),
  ]);

  const orderHeaderMap = new Map((orderHeadersRes.data ?? []).map((h) => [h.sales_order_id, h]));
  const orderStatusMap = new Map(orderStatusMapEntries);

  const mapInvoiceStatusFromOrder = (orderStatus: string | undefined | null) => {
    const s = String(orderStatus ?? "").trim();
    if (s === "DELIVERED") return "Delivered";
    if (s === "DISPATCH_READY" || s === "IN_PREPARATION") return "In Transit";
    return "Pending";
  };

  const formattedItems = rawItems.map((it, idx) => {
    const orderStatus = it.sales_order_id ? orderStatusMap.get(it.sales_order_id) : null;
    const status = mapInvoiceStatusFromOrder(orderStatus);
    const orderHeader = it.sales_order_id ? orderHeaderMap.get(it.sales_order_id) : null;
    const eta = orderHeader
      ? estimateExpectedDeliveryDate({
          voucherDate: String(orderHeader.voucher_date ?? ""),
          shippingTypeId: orderHeader.shipping_type_ID ?? null,
          warehouseId: it.Despatch_Location_ID ?? null,
          status: String(orderStatus ?? "PENDING"),
        })
      : null;

    const catInv = it.catalogue_no != null && String(it.catalogue_no).trim() ? String(it.catalogue_no).trim() : null;
    const packInv = it.packing_id != null && Number.isFinite(Number(it.packing_id)) ? Number(it.packing_id) : null;
    return {
      line_number: idx + 1,
      sku: formatSkuFromOrderLine(catInv, packInv),
      product_description: it.description ?? "Item",
      quantity: it.qty,
      status,
      eta,
      invoice_date: inv.voucher_date,
      unit_price: it.base_amount ?? null,
      line_total: it.item_amount ?? null,
    };
  });

  // Linked orders (distinct sales_order_id) for the invoice card.
  const linkedOrders = salesOrderIds.length
    ? await querySqlServer<{
        voucher_number: string;
        voucher_date: string;
        Total_Order_Amount: number | null;
        customer_po_number: string | null;
      }>(
        `SELECT voucher_number, voucher_date, Total_Order_Amount, customer_po_number
         FROM dbo.sales_order_header
         WHERE sales_order_id IN (${salesOrderIds.join(",")})
         ORDER BY voucher_date DESC`,
      )
    : { data: [] as any[] };

  return {
    invoice_card: [
      {
        invoice_number: inv.voucher_number,
        invoice_date: inv.voucher_date,
        invoice_total_amount: inv.INVOICE_AMOUNT ?? null,
        base_amount: inv.base_amount ?? null,
        tax_amount: inv.tax_amount ?? null,
        discount_amount: inv.discount_amount ?? null,
        confirmed: inv.confirmed ?? null,
        transport_name: inv.TRANSPORT_NAME ?? null,
        vehicle_number: inv.VEHICLE_NUMBER ?? null,
        date_of_removal: inv.DATE_OF_REMOVAL ?? null,
        customer_full_name: customerName,
        items: formattedItems,
        items_count: formattedItems.length,
        linked_orders: (linkedOrders.data ?? []).map((o) => ({
          order_number: o.voucher_number,
          order_date: o.voucher_date,
          order_total_amount: o.Total_Order_Amount ?? null,
          customer_po_number: o.customer_po_number ?? null,
        })),
        orders_count: (linkedOrders.data ?? []).length,
      },
    ],
  };
}

export async function sqlServerGetInvoicesByOrder(orderNumber: string, profile: UserProfile) {
  // ERP linkage: Sales_Invoice_Body -> sales_order_body -> sales_order_header
  const clean = orderNumber.trim();
  const { data: order } = await querySqlServer<{ sales_order_id: number; voucher_number: string; voucher_date: string }>(
    `SELECT TOP 1 sales_order_id, voucher_number, voucher_date
     FROM dbo.sales_order_header
     WHERE ${sqlSalesOrderHeaderVoucherMatch()}`,
    { voucher: clean },
  );
  if (!order?.length) return { error: ERP_ORDER_NOT_FOUND_MSG };

  const o = order[0];
  const { data: invoices } = await querySqlServer<{
    voucher_number: string;
    voucher_date: string;
    INVOICE_AMOUNT: number | null;
    ORDER_PORTION_AMOUNT: number | null;
    confirmed: boolean | null;
    DATE_OF_REMOVAL: string | null;
  }>(
    `SELECT 
       h.voucher_number, 
       h.voucher_date, 
       h.INVOICE_AMOUNT, 
       (SELECT SUM(b2.item_amount) FROM dbo.Sales_Invoice_Body b2 JOIN dbo.sales_order_body sob2 ON sob2.sales_order_body_id = b2.sales_order_body_id WHERE sob2.sales_order_id = @orderId AND b2.sales_invoice_header_id = h.sales_invoice_header_id) as ORDER_PORTION_AMOUNT,
       h.confirmed, 
       h.DATE_OF_REMOVAL
     FROM dbo.Sales_Invoice_Header h
     WHERE EXISTS (
       SELECT 1
       FROM dbo.Sales_Invoice_Body b
       JOIN dbo.sales_order_body sob ON sob.sales_order_body_id = b.sales_order_body_id
       WHERE b.sales_invoice_header_id = h.sales_invoice_header_id
         AND sob.sales_order_id = @orderId
     )
     ORDER BY h.voucher_date DESC`,
    { orderId: o.sales_order_id },
  );

  const { data: oLines } = await querySqlServer<{
    sales_order_body_id: number;
    printing_name: string | null;
    packing_id: number | null;
    order_qty: number | null;
    net_order_qty: number | null;
    Item_Total_Amount: number | null;
    catalogue_no: string | null;
  }>(
    `SELECT b.sales_order_body_id, b.printing_name, b.packing_id, b.order_qty, b.net_order_qty, b.Item_Total_Amount, pm.catalogue_no
     FROM dbo.sales_order_body b
     ${SALES_ORDER_BODY_PRODUCT_JOIN}
     WHERE b.sales_order_id = @orderId
     ORDER BY b.sales_order_body_id ASC`,
    { orderId: o.sales_order_id },
  );

  const invByOrderLines = (oLines ?? []).filter((i) => Number(i.net_order_qty ?? i.order_qty ?? 0) > 0);
  const invTotalsByBody = await lineTotalsFromInvoiceBodies(invByOrderLines.map((i) => i.sales_order_body_id));
  const items = invByOrderLines.map((i) => {
    const cat = i.catalogue_no != null && String(i.catalogue_no).trim() ? String(i.catalogue_no).trim() : null;
    const pack = i.packing_id != null && Number.isFinite(Number(i.packing_id)) ? Number(i.packing_id) : null;
    return {
      product_name: i.printing_name ?? "Item",
      sku: formatSkuFromOrderLine(cat, pack),
      catalogue_no: cat,
      packing_id: pack,
      quantity: Number(i.net_order_qty ?? i.order_qty ?? 0),
      line_total: lineTotalFromBodyAndInvoices(i, invTotalsByBody),
    };
  });

  return {
    order: { order_number: o.voucher_number, order_date: o.voucher_date, items },
    invoices: (invoices ?? []).map((inv) => ({
      invoice_number: inv.voucher_number,
      invoice_date: inv.voucher_date,
      total_amount: inv.ORDER_PORTION_AMOUNT ?? inv.INVOICE_AMOUNT ?? null,
      full_invoice_amount: inv.INVOICE_AMOUNT ?? null,
      confirmed: inv.confirmed ?? null,
      date_of_removal: inv.DATE_OF_REMOVAL ?? null,
    })),
    invoice_count: invoices?.length ?? 0,
    assistant_reply_rules: "CRITICAL: You MUST output the invoices as a Markdown Table. You MUST ALSO output the order line items as a separate Markdown Table. DO NOT use conversational bullet lists for these."
  };
}

export async function sqlServerGetProformaInvoices(orderNumber: string, profile: UserProfile) {
  // Not found in this ERP schema set (we did not discover proforma tables for sales).
  return { order_number: orderNumber, proforma_invoices: [], message: "Proforma invoices are not available in this ERP database." };
}

export async function sqlServerGetOrderDrilldown(_orderNumber: string, profile: UserProfile) {
  // Order header + line items, with same ERP lifecycle + Lane A truth layer as `sqlServerGetOrderStatus`.
  const orderNumber = _orderNumber.trim();
  if (!orderNumber) return { error: "Order number is required." };

  const clean = orderNumber;
  const numericSalesOrderId =
    /^\d+$/.test(clean) && Number.isFinite(Number(clean)) ? Number(clean) : null;

  type HeaderRow = {
    sales_order_id: number;
    voucher_number: string;
    voucher_date: string;
    account_id: number;
    Total_Order_Amount: number | null;
    analysis_id: number | null;
    shipping_type_ID: number | null;
    customer_po_number: string | null;
  };

  const { data: headerByVoucher } = await querySqlServer<HeaderRow>(
    `SELECT TOP 1 sales_order_id, voucher_number, voucher_date, account_id, Total_Order_Amount, analysis_id, shipping_type_ID, customer_po_number
     FROM dbo.sales_order_header
     WHERE ${sqlSalesOrderHeaderVoucherMatch()}`,
    { voucher: clean },
  );

  let order = headerByVoucher?.[0];
  let matchedOn: "voucher_number" | "sales_order_id" | null = order ? "voucher_number" : null;

  if (!order && numericSalesOrderId !== null) {
    const { data: headerById } = await querySqlServer<HeaderRow>(
      `SELECT TOP 1 sales_order_id, voucher_number, voucher_date, account_id, Total_Order_Amount, analysis_id, shipping_type_ID, customer_po_number
       FROM dbo.sales_order_header
       WHERE sales_order_id = @orderId`,
      { orderId: numericSalesOrderId },
    );
    order = headerById?.[0];
    if (order) matchedOn = "sales_order_id";
  }

  if (!order) return { error: ERP_ORDER_NOT_FOUND_MSG };

  if (profile.role === "distributor") {
    const allowed = getDistributorSqlAccountIds(profile);
    if (!allowed.length) {
      return {
        error:
          "Your account is not linked to an ERP customer (companies.erp_account_id). Ask an admin to configure it.",
      };
    }
    if (!allowed.includes(Number(order.account_id))) {
      return { error: ERP_ORDER_NOT_FOUND_MSG };
    }
  }

  if (profile.role === "warehouse" && profile.warehouse_id && order.analysis_id && profile.warehouse_id !== order.analysis_id) {
    return { error: ERP_ORDER_NOT_FOUND_MSG };
  }

  const voucherForLines = String(order.voucher_number ?? clean);

  const [customerName, itemsRes, derivedLifecycle] = await Promise.all([
    getAccountName(order.account_id),
    querySalesOrderBodyLinesForVoucherDrilldown(voucherForLines, order.sales_order_id),
    deriveOrderLifecycleFromERP(order.sales_order_id),
  ]);

  const drillLines = (itemsRes.data ?? []).filter((i) => Number(i.net_order_qty ?? i.order_qty ?? 0) > 0);
  const invoiceLineTotalsDrill = await lineTotalsFromInvoiceBodies(drillLines.map((i) => i.sales_order_body_id));
  const items = drillLines.map((i) => {
    const qty = Number(i.net_order_qty ?? i.order_qty ?? 0);
    const cat = i.catalogue_no != null && String(i.catalogue_no).trim() ? String(i.catalogue_no).trim() : null;
    const pack = i.packing_id != null && Number.isFinite(Number(i.packing_id)) ? Number(i.packing_id) : null;
    return {
      product_name: i.printing_name ?? "Item",
      sku: formatSkuFromOrderLine(cat, pack),
      catalogue_no: cat,
      packing_id: pack,
      quantity: qty,
      ordered: qty,
      processed: 0,
      pending: qty,
      delayed: 0,
      line_total: lineTotalFromBodyAndInvoices(i, invoiceLineTotalsDrill),
    };
  });

  const items_note =
    itemsRes.error != null
      ? "Line items could not be loaded from ERP (query error)."
      : items.length === 0
        ? ERP_ORDER_LINES_NOT_POSTED_MSG
        : undefined;

  const status = derivedLifecycle.status;
  const expectedDeliveryDate = estimateExpectedDeliveryDate({
    voucherDate: String(order.voucher_date ?? ""),
    shippingTypeId: order.shipping_type_ID ?? null,
    warehouseId: order.analysis_id ?? null,
    status,
  });
  const isStockTransferOrder =
    String(order.customer_po_number ?? "")
      .trim()
      .toLowerCase() === "stock transfer";

  const drillVoucherDay = order.voucher_date != null ? String(order.voucher_date).slice(0, 10) : null;

  const laneA = buildLaneAOrderSnapshot({
    status,
    orderNumber: String(order.voucher_number ?? ""),
    voucherDate: order.voucher_date != null ? String(order.voucher_date) : null,
    expectedDeliveryDate,
    isStockTransferOrder,
    dispatchConfidence: derivedLifecycle.dispatch_confidence,
    dispatchReasonCode: derivedLifecycle.dispatch_reason_code,
    truthSignals: derivedLifecycle.truth_signals,
    awaitingFactoryAgeDays:
      status === "AWAITING_FACTORY" ? orderHeadAgeUtcDays(drillVoucherDay) : undefined,
    predictionVersion: PREDICTION_MODEL_VERSION,
  });

  void persistOrderPrediction({
    sales_order_id: order.sales_order_id,
    predicted_eta_center: laneA.expected_delivery_band.center_date ?? null,
    predicted_window_start: laneA.expected_delivery_band.window_start ?? null,
    predicted_window_end: laneA.expected_delivery_band.window_end ?? null,
    next_update_by_date: laneA.next_update_by,
    derived_status: status,
    truth_signals: derivedLifecycle.truth_signals,
    dispatch_confidence: derivedLifecycle.dispatch_confidence,
    prediction_version: PREDICTION_MODEL_VERSION,
  }).catch(() => {});

  return {
    document_type: "erp_sales_order",
    matched_on: matchedOn ?? "voucher_number",
    queried_value: clean,
    assistant_reply_rules:
      "CRITICAL: You MUST output all the product line items of this order as a Markdown Table. DO NOT format them as a conversational or numbered list. Say **order** / **line items**, not **invoice**, unless discussing actual invoices. If `lane_a` is present, summarize indicative estimated delivery.",
    /** Top-level for chat Lane A card + tool JSON extraction (same contract as getOrderStatus). */
    order_number: order.voucher_number,
    // lane_a: laneA, // Suppressed to avoid overlapping table views with the Order Truth Layer
    status,
    order_status: status,
    expected_delivery_date: expectedDeliveryDate,
    order: {
      order_number: order.voucher_number,
      order_date: order.voucher_date,
      customer_name: customerName,
      total_amount: order.Total_Order_Amount ?? null,
      order_status: status,
      expected_delivery_date: expectedDeliveryDate,
    },
    items,
    ...(items_note ? { items_note } : {}),
    manual_allocation: derivedLifecycle.manual_allocation ?? null,
    dispatch_confidence: derivedLifecycle.dispatch_confidence,
    dispatch_reason_code: derivedLifecycle.dispatch_reason_code,
    has_transport_hint: derivedLifecycle.has_transport_hint,
    summary: {
      total_items: items.length,
      total_ordered: items.reduce((s, x) => s + x.ordered, 0),
      total_processed: 0,
      total_pending: items.reduce((s, x) => s + x.pending, 0),
      total_delayed: 0,
    },
  };
}

export async function sqlServerGetCompanyInvoices(_companyName: string, _limit: number, _dateFilter: string, _profile: UserProfile) {
  const limit = _limit && _limit > 0 ? Math.min(_limit, 5) : 5;
  const where: string[] = [];
  const params: Record<string, string | number> = {};

  const dateFilter = String(_dateFilter ?? "").trim().toLowerCase();
  if (dateFilter === "today" || dateFilter === "todays" || dateFilter === "today's") {
    const today = new Date().toISOString().slice(0, 10);
    where.push("CAST(voucher_date AS date) = CAST(@d AS date)");
    params.d = today;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
    where.push("CAST(voucher_date AS date) = CAST(@d AS date)");
    params.d = dateFilter;
  }

  // Domestic filter: only show invoices for Indian distributors (Domestic_Export = 'D')
  where.push(`EXISTS (
    SELECT 1 FROM dbo.ACCOUNT_MASTER AM
    INNER JOIN dbo.State S ON AM.STATE_ID = S.State_id
    WHERE AM.ACCOUNT_ID = dbo.Sales_Invoice_Header.account_id AND S.Domestic_Export = 'D'
  )`);

  if (_profile.role === "distributor") {
    const accountIds = getDistributorSqlAccountIds(_profile);
    if (!accountIds.length) {
      return {
        invoices: [],
        count: 0,
        total_count: 0,
        showing: 0,
        message: "Your distributor ERP account mapping is missing.",
      };
    }
    const placeholders = accountIds.map((_, i) => `@acc${i}`).join(", ");
    where.push(`account_id IN (${placeholders})`);
    accountIds.forEach((id, i) => {
      params[`acc${i}`] = id;
    });
  }

  const scopedWhere = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { data } = await querySqlServer<{
    voucher_number: string;
    voucher_date: string;
    INVOICE_AMOUNT: number | null;
    confirmed: boolean | null;
    account_id: number;
  }>(`SELECT TOP ${limit} voucher_number, voucher_date, INVOICE_AMOUNT, confirmed, account_id FROM dbo.Sales_Invoice_Header ${scopedWhere} ORDER BY voucher_date DESC`, params);

  const invoices = await Promise.all(
    (data ?? []).map(async (inv) => ({
      invoice_number: inv.voucher_number,
      invoice_date: inv.voucher_date,
      invoice_total_amount: inv.INVOICE_AMOUNT ?? null,
      confirmed: inv.confirmed ?? null,
      customer_full_name: await getAccountName(inv.account_id),
    })),
  );

  return { invoices, count: invoices.length, total_count: invoices.length, showing: invoices.length };
}

export async function sqlServerGetInvoiceStatus(_invoiceNumber: string, _profile: UserProfile) {
  const invoiceNumber = _invoiceNumber.trim();
  if (!invoiceNumber) return { error: "Invoice number is required." };
  const { data } = await querySqlServer<{
    voucher_number: string;
    voucher_date: string;
    INVOICE_AMOUNT: number | null;
    confirmed: boolean | null;
    DATE_OF_REMOVAL: string | null;
  }>(
    `SELECT TOP 1 IH.voucher_number, IH.voucher_date, IH.INVOICE_AMOUNT, IH.confirmed, IH.DATE_OF_REMOVAL
     FROM dbo.Sales_Invoice_Header IH
     INNER JOIN dbo.ACCOUNT_MASTER AM ON IH.account_id = AM.ACCOUNT_ID
     INNER JOIN dbo.State S ON AM.STATE_ID = S.State_id
     WHERE IH.voucher_number = @v AND S.Domestic_Export = 'D'`,
    { v: invoiceNumber },
  );
  const inv = data?.[0];
  if (!inv) return { error: `Invoice not found: ${invoiceNumber}` };
  return {
    invoice: {
      invoice_number: inv.voucher_number,
      invoice_date: inv.voucher_date,
      total_amount: inv.INVOICE_AMOUNT ?? null,
      confirmed: inv.confirmed ?? null,
      date_of_removal: inv.DATE_OF_REMOVAL ?? null,
    },
    status: {
      order_status: inv.DATE_OF_REMOVAL ? "Dispatched" : "Processing",
      expected_delivery: null,
      is_delayed: false,
      is_delivered: !!inv.DATE_OF_REMOVAL,
    },
    linked_order: null,
  };
}

export async function sqlServerGetDelayedInvoices(_profile: UserProfile) {
  return { delayed_invoices: [], message: "Delay detection is not configured for this ERP database yet." };
}

/**
 * Product tracking + inventory availability.
 *
 * Used for chat intents like:
 * - "Where is NaCl?"
 * - "Is NaCl available?"
 *
 * Returns a `product_card` payload for the chat UI renderer.
 */
function resolveInitialWarehouseForProductTracking(
  warehouseIdOverride: number | undefined,
  profile: UserProfile,
): {
  warehouseId: number | null;
  source: "override" | "warehouse_staff" | "company_base" | "user_warehouse" | null;
} {
  if (Number.isFinite(Number(warehouseIdOverride)) && warehouseIdOverride != null) {
    return { warehouseId: Number(warehouseIdOverride), source: "override" };
  }
  if (profile.role === "warehouse" && profile.warehouse_id != null) {
    return { warehouseId: Number(profile.warehouse_id), source: "warehouse_staff" };
  }
  if (profile.base_warehouse_id != null) {
    return { warehouseId: Number(profile.base_warehouse_id), source: "company_base" };
  }
  if (profile.warehouse_id != null) {
    return { warehouseId: Number(profile.warehouse_id), source: "user_warehouse" };
  }
  return { warehouseId: null, source: null };
}

function warehouseScopeNote(
  source: "override" | "warehouse_staff" | "company_base" | "user_warehouse" | "inferred" | null,
): string | null {
  if (source === "company_base") {
    return "Inventory shown for your primary allocated warehouse.";
  }
  if (source === "inferred") {
    return "Optimizing view: Showing availability from the location with highest current stock.";
  }
  return null;
}

/**
 * Fetch similar products from Product_Master using keyword matching.
 * Uses the first meaningful word from the product description (min 4 chars).
 */
async function fetchSimilarProducts(
  productName: string | null,
  excludeProductId: number,
): Promise<Array<{ product_id: number; sku: string | null; product_name: string | null; available_qty: number | null }>> {
  if (!productName) return [];
  const words = productName.split(/\s+/).filter((w) => w.length >= 4);
  const keyword = words[0] ?? null;
  if (!keyword) return [];

  const { data: rows } = await querySqlServer<{
    product_id: number;
    catalogue_no: string | null;
    description: string | null;
    STOCK_QTY: number | null;
  }>(
    `SELECT TOP 5
       pm.product_id,
       pm.catalogue_no,
       pm.description,
       ISNULL(cs.STOCK_QTY, 0) AS STOCK_QTY
     FROM dbo.Product_Master pm
     LEFT JOIN (
       SELECT product_id, SUM(ISNULL(STOCK_QTY, 0)) AS STOCK_QTY
       FROM dbo.CurrentStock
       GROUP BY product_id
     ) cs ON cs.product_id = pm.product_id
     WHERE LOWER(LTRIM(pm.description)) LIKE LOWER(@kw) + N'%'
       AND pm.product_id <> @excl
     ORDER BY ISNULL(cs.STOCK_QTY, 0) DESC`,
    { kw: keyword, excl: excludeProductId },
  );

  return (rows ?? []).map((r) => ({
    product_id: r.product_id,
    sku: r.catalogue_no ?? null,
    product_name: r.description ?? null,
    available_qty: Number(r.STOCK_QTY ?? 0),
  }));
}

type ProductMasterRow = {
  product_id: number;
  catalogue_no: string | null;
  description: string | null;
};

/** Pull catalogue/SKU tokens from natural chat (e.g. "(SKU: H-00101)", "SKU: X", "H-00101"). */
function extractSkuTokenFromUserQuery(raw: string): string | null {
  const s = String(raw ?? "").trim();
  const m0 = /\(\s*SKU\s*:\s*([A-Za-z0-9\-_/]+)\s*\)/i.exec(s);
  if (m0?.[1]) return m0[1].trim();
  const m1 = /\([^)]*?\bSKU\s*:\s*([A-Za-z0-9\-_/]+)\)/i.exec(s);
  if (m1?.[1]) return m1[1].trim();
  const m2 = /\bSKU\s*:\s*([A-Za-z0-9\-_/]+)/i.exec(s);
  if (m2?.[1]) return m2[1].trim();
  const m3 = /\b([A-Za-z]{1,3}-\d{4,6})\b/i.exec(s);
  if (m3?.[1]) return m3[1].trim();
  return null;
}

function stripSkuParenthetical(raw: string): string {
  return String(raw ?? "")
    .replace(/\([^)]*\bSKU\s*:\s*[^)]+\)/gi, " ")
    .replace(/\bSKU\s*:\s*[A-Za-z0-9\-_/]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Product name only before "is … which warehouse" style questions. */
function extractProductNamePhraseForLookup(raw: string): string | null {
  let s = stripSkuParenthetical(raw);
  s = s.replace(/\s+(is|are)\s+[\s\S]+$/i, "").trim();
  s = s.replace(/\s+(in\s+which|which\s+warehouse|what\s+warehouse|where\s+).+$/i, "").trim();
  s = s.replace(/[?.!]+$/g, "").trim();
  return s.length >= 2 ? s : null;
}

function expandProductQueryVariants(input: string): string[] {
  const base = String(input ?? "").trim();
  if (!base) return [];
  const variants = new Set<string>([base]);

  // Common pH text variants users type: ph4 / pH4 / pH 4 / pH-4 / pH 4.0
  variants.add(base.replace(/\bph\s*[-_.]?\s*(\d+(?:\.\d+)?)\b/gi, "pH $1"));
  variants.add(base.replace(/\bpH\s*(\d+(?:\.\d+)?)\b/g, "pH $1"));
  variants.add(base.replace(/\bpH\s+(\d+)\b/g, "pH $1.0"));
  variants.add(base.replace(/\bpH\s*[-_.]?\s*(\d+(?:\.\d+)?)\b/gi, "PH $1"));

  return [...variants].map((v) => v.trim()).filter((v) => v.length >= 2);
}

function buildProductLookupCandidates(raw: string): string[] {
  const seen = new Set<string>();
  const add = (t: string | null | undefined) => {
    const v = String(t ?? "").trim();
    if (v.length >= 2 && !seen.has(v)) seen.add(v);
  };
  add(extractSkuTokenFromUserQuery(raw));
  const phrase = extractProductNamePhraseForLookup(raw);
  for (const v of expandProductQueryVariants(phrase ?? "")) add(v);
  const stripped = stripSkuParenthetical(raw);
  for (const v of expandProductQueryVariants(stripped)) add(v);
  const firstLine = raw.split(/\r?\n/)[0]?.trim();
  for (const v of expandProductQueryVariants(firstLine ?? "")) add(v);
  return [...seen];
}

/**
 * Try multiple query strings derived from chat (SKU first, then cleaned name) so ERP resolves
 * real products even when the model passes a full sentence.
 */
async function resolveProductMasterFromUserText(
  raw: string,
): Promise<
  { kind: "none" } | { kind: "one"; product: ProductMasterRow } | { kind: "many"; candidates: ProductMasterRow[] }
> {
  const candidates = buildProductLookupCandidates(raw);
  for (const c of candidates) {
    const r = await resolveProductMasterFromQuery(c);
    if (r.kind === "one" || r.kind === "many") return r;
  }
  return { kind: "none" };
}

/**
 * Resolve Product_Master to a single row: exact catalogue, exact description (case-insensitive),
 * then prefix-only on catalogue_no / description (no substring fuzzy, no Soundex).
 */
async function resolveProductMasterFromQuery(
  cleanQuery: string,
): Promise<
  { kind: "none" } | { kind: "one"; product: ProductMasterRow } | { kind: "many"; candidates: ProductMasterRow[] }
> {
  const exact = cleanQuery.trim();
  if (!exact) return { kind: "none" };

  let { data: rows } = await querySqlServer<ProductMasterRow>(
    `SELECT TOP 11 product_id, catalogue_no, description
     FROM dbo.Product_Master
     WHERE LTRIM(RTRIM(catalogue_no)) = LTRIM(RTRIM(@exact))`,
    { exact },
  );
  let list = rows ?? [];
  if (list.length === 1) return { kind: "one", product: list[0] };
  if (list.length > 1) return { kind: "many", candidates: list };

  ({ data: rows } = await querySqlServer<ProductMasterRow>(
    `SELECT TOP 11 product_id, catalogue_no, description
     FROM dbo.Product_Master
     WHERE LOWER(LTRIM(RTRIM(catalogue_no))) = LOWER(LTRIM(@exact))`,
    { exact },
  ));
  list = rows ?? [];
  if (list.length === 1) return { kind: "one", product: list[0] };
  if (list.length > 1) return { kind: "many", candidates: list };

  ({ data: rows } = await querySqlServer<ProductMasterRow>(
    `SELECT TOP 11 product_id, catalogue_no, description
     FROM dbo.Product_Master
     WHERE LOWER(LTRIM(RTRIM(description))) = LOWER(LTRIM(@exact))`,
    { exact },
  ));
  list = rows ?? [];
  if (list.length === 1) return { kind: "one", product: list[0] };
  if (list.length > 1) return { kind: "many", candidates: list };

  if (exact.length >= 3) {
    ({ data: rows } = await querySqlServer<ProductMasterRow>(
      `SELECT TOP 11 product_id, catalogue_no, description
       FROM dbo.Product_Master
       WHERE LTRIM(RTRIM(catalogue_no)) LIKE LTRIM(RTRIM(@pfx)) + N'%'
       ORDER BY LEN(LTRIM(RTRIM(catalogue_no))) ASC`,
      { pfx: exact },
    ));
    list = rows ?? [];
    if (list.length === 1) return { kind: "one", product: list[0] };
    if (list.length > 1) return { kind: "many", candidates: list };

    ({ data: rows } = await querySqlServer<ProductMasterRow>(
      `SELECT TOP 11 product_id, catalogue_no, description
       FROM dbo.Product_Master
       WHERE LOWER(LTRIM(description)) LIKE LOWER(LTRIM(@pfx)) + N'%'
       ORDER BY LEN(description) ASC`,
      { pfx: exact },
    ));
    list = rows ?? [];
    if (list.length === 1) return { kind: "one", product: list[0] };
    if (list.length > 1) return { kind: "many", candidates: list };
  }

  // Last fallback: compare normalized strings (strip punctuation/spaces) so
  // queries like "buffer solution ph4" match ERP names like "Buffer Solution pH 4.0".
  const compact = exact.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (compact.length >= 3) {
    ({ data: rows } = await querySqlServer<ProductMasterRow>(
      `SELECT TOP 11 product_id, catalogue_no, description
       FROM dbo.Product_Master
       WHERE
         REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(LTRIM(RTRIM(description))), ' ', ''), '-', ''), '.', ''), ',', ''), '/', '') LIKE @cmp + N'%'
         OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(LTRIM(RTRIM(description))), ' ', ''), '-', ''), '.', ''), ',', ''), '/', '') LIKE N'%' + @cmp + N'%'
       ORDER BY LEN(description) ASC`,
      { cmp: compact },
    ));
    list = rows ?? [];
    if (list.length === 1) return { kind: "one", product: list[0] };
    if (list.length > 1) return { kind: "many", candidates: list };
  }

  return { kind: "none" };
}

export async function sqlServerGetProductTrackingAndInventory(
  productQuery: string,
  includeOtherWarehouses: number | undefined,
  warehouseIdOverride: number | undefined,
  profile: UserProfile,
) {
  const includeOther = Boolean(includeOtherWarehouses && Number(includeOtherWarehouses) === 1);
  const cleanQuery = String(productQuery ?? "").trim();
  if (!cleanQuery) {
    return { error: "Product query is required." };
  }

  const initialWh = resolveInitialWarehouseForProductTracking(warehouseIdOverride, profile);
  let selectedWarehouseId: number | null = initialWh.warehouseId;
  let warehouseResolution: "override" | "warehouse_staff" | "company_base" | "user_warehouse" | "inferred" | null =
    initialWh.source;

  // Warehouse name is resolved later (after we know the product id), because we can
  // infer a "best" warehouse from CurrentStock for the resolved product.
  let selectedWarehouse: WarehouseRow | null = null;

  // ---------------------------------------------------------------------------
  // 1) Resolve product → SKU (product_id); accept full sentences + embedded SKU
  // ---------------------------------------------------------------------------
  const asksWarehouseLocations =
    /\b(which|what)\s+(warehouse|ware\s*house|location)\b/i.test(cleanQuery) ||
    /\bin\s+which\s+warehouse\b/i.test(cleanQuery) ||
    /\bwhere\s+.*\b(stock|available|inventory)\b/i.test(cleanQuery);

  const asksAvailability =
    asksWarehouseLocations ||
    /\b(available|availability|stock|inventory|qty|quantity)\b/i.test(cleanQuery) ||
    includeOther;

  const resolved = await resolveProductMasterFromUserText(cleanQuery);
  if (resolved.kind === "none") {
    return {
      error: `No product found in ERP for this query. Try **SKU** (e.g. H-00101) or the exact product name as in Product_Master.`,
    };
  }
  if (resolved.kind === "many") {
    return {
      message: `Multiple products matched "${cleanQuery}". Please reply with the exact **SKU** from ERP.`,
      product_candidates: resolved.candidates.map((m) => ({
        product_id: m.product_id,
        sku: m.catalogue_no,
        product_name: m.description,
      })),
    };
  }

  const product = resolved.product;
  const productId = product.product_id;
  const sku = product.catalogue_no ?? null;
  const productName = product.description ?? null;

  // If we don't have a warehouse from profile/context, infer one from current stock.
  // This avoids asking the user to manually specify a warehouse for common
  // "Where is <product>?" queries.
  if (selectedWarehouseId == null || !Number.isFinite(selectedWarehouseId)) {
    const { data: bestWh } = await querySqlServer<{ location_id: number; STOCK_QTY: number | null }>(
      `SELECT TOP 1 location_id, STOCK_QTY
       FROM dbo.CurrentStock
       WHERE product_id = @pid
       ORDER BY STOCK_QTY DESC`,
      { pid: productId },
    );
    const loc = bestWh?.[0]?.location_id;
    if (loc != null && Number.isFinite(Number(loc))) {
      selectedWarehouseId = Number(loc);
      warehouseResolution = "inferred";
    }
  }

  const scopeNote = warehouseScopeNote(warehouseResolution);

  selectedWarehouse = selectedWarehouseId != null ? await getWarehouseById(selectedWarehouseId) : null;

  // ---------------------------------------------------------------------------
  // 2) Inventory in selected warehouse
  // ---------------------------------------------------------------------------
  let availableQty = 0;
  if (selectedWarehouseId != null) {
    const { data: stockRows } = await querySqlServer<{ STOCK_QTY: number | null }>(
      `SELECT TOP 1 STOCK_QTY
       FROM dbo.CurrentStock
       WHERE location_id = @loc AND product_id = @pid`,
      { loc: selectedWarehouseId, pid: productId },
    );
    availableQty = Number(stockRows?.[0]?.STOCK_QTY ?? 0);
  }

  // ---------------------------------------------------------------------------
  // 3) Order history for this product (latest orders)
  // ---------------------------------------------------------------------------
  // Bridge: product_id (Product_Master PK) → packing_id via CurrentStock
  // sales_order_body has packing_id, not product_id.
  // We sub-select packing_ids from CurrentStock that map to the resolved product_id.
  const orderWhere: string[] = [`b.packing_id IN (SELECT packing_id FROM dbo.CurrentStock WHERE product_id = @pid)`];
  const params: Record<string, number | string> = { pid: productId };

  if (profile.role === "distributor") {
    const accountIds = getDistributorSqlAccountIds(profile);
    if (!accountIds.length) {
      return { error: "Your distributor ERP account mapping is missing." };
    }
    const placeholders = accountIds.map((_, i) => `@acc${i}`).join(", ");
    accountIds.forEach((id, i) => {
      params[`acc${i}`] = id;
    });
    orderWhere.push(`h.account_id IN (${placeholders})`);
  }

  // Super admin: keep full ERP account scope (no hard-coded distributor filter).

  const orderQuery = `
    SELECT TOP 40
      h.sales_order_id,
      h.voucher_number,
      h.voucher_date,
      h.account_id,
      h.shipping_type_ID,
      h.customer_po_number,
      h.Total_Order_Amount,
      b.Despatch_Location_ID,
      LTRIM(RTRIM(am.FULL_NAME)) AS customer_name
    FROM dbo.sales_order_body b
    INNER JOIN dbo.sales_order_header h
      ON h.sales_order_id = b.sales_order_id
    LEFT JOIN dbo.ACCOUNT_MASTER am
      ON am.ACCOUNT_ID = h.account_id
    WHERE ${orderWhere.join(" AND ")}
    ORDER BY h.voucher_date DESC
  `;

  const { data: orderRows } = await querySqlServer<{
    sales_order_id: number;
    voucher_number: string;
    voucher_date: string;
    account_id: number;
    shipping_type_ID: number | null;
    customer_po_number: string | null;
    Total_Order_Amount: number | null;
    Despatch_Location_ID: number | null;
    customer_name: string | null;
  }>(orderQuery, params);

  // Dedupe by sales_order_id, keeping the first occurrence (latest voucher_date).
  const latestByOrderId = new Map<number, (typeof orderRows)[number]>();
  for (const r of orderRows ?? []) {
    if (!latestByOrderId.has(r.sales_order_id)) latestByOrderId.set(r.sales_order_id, r);
  }
  const latestOrdersRaw = Array.from(latestByOrderId.values()).sort(
    (a, b) => new Date(b.voucher_date).getTime() - new Date(a.voucher_date).getTime(),
  );

  // Compute latest order statuses + estimated delivery dates.
  // Product cards should surface actionable activity, so prioritize non-delivered
  // orders before delivered ones, then keep recency inside each bucket.
  const latestOrdersWithMetaAll = await Promise.all(
    latestOrdersRaw.map(async (r) => {
      const { status: derivedStatus, removalDate } = await deriveOrderLifecycleFromERP(r.sales_order_id);
      const wh =
        r.Despatch_Location_ID != null && Number.isFinite(Number(r.Despatch_Location_ID))
          ? await getWarehouseById(Number(r.Despatch_Location_ID))
          : null;
      const eta =
        derivedStatus === "DELIVERED"
          ? removalDate
          : estimateExpectedDeliveryDate({
              voucherDate: String(r.voucher_date ?? "").slice(0, 10),
              shippingTypeId: r.shipping_type_ID ?? null,
              warehouseId: r.Despatch_Location_ID ?? selectedWarehouseId,
              status: derivedStatus,
            });
      const status =
        derivedStatus === "DELIVERED"
          ? "Delivered"
          : derivedStatus === "DISPATCH_READY" || derivedStatus === "IN_PREPARATION"
            ? "In Transit"
            : "Pending";

      return {
        order_number: String(r.voucher_number ?? ""),
        status,
        customer_name: r.customer_name ?? null,
        warehouse_name: wh?.warehouse_name ?? selectedWarehouse?.warehouse_name ?? null,
        eta,
        order_date: r.voucher_date ?? null,
      };
    }),
  );
  const latestOrdersWithMeta = latestOrdersWithMetaAll
    .sort((a, b) => new Date(String(b.order_date ?? 0)).getTime() - new Date(String(a.order_date ?? 0)).getTime())
    .slice(0, 5);

  const lastOrderDateRaw = latestOrdersRaw[0]?.voucher_date ?? null;
  const lastOrderDateIso = lastOrderDateRaw ? String(lastOrderDateRaw).slice(0, 10) : null;
  const today = new Date();
  const lastDate = lastOrderDateRaw ? new Date(lastOrderDateRaw) : null;
  const daysSinceLastOrder = lastDate ? Math.floor((today.getTime() - lastDate.getTime()) / 86400000) : null;

  const REORDER_GAP_DAYS = 45;
  const shouldReorder =
    daysSinceLastOrder == null ? false : Number.isFinite(daysSinceLastOrder) ? daysSinceLastOrder > REORDER_GAP_DAYS : false;
  const reorderPrompt = shouldReorder
    ? `It’s been a while since you ordered this product. Would you like to reorder? (Redirect to ERP reorder for ${sku ?? productName ?? "this SKU"})`
    : null;

  // ---------------------------------------------------------------------------
  // 4) Predictive availability (expected available by date)
  // ---------------------------------------------------------------------------
  let expectedAvailableBy: string | null = null;
  if (availableQty <= 0) {
    const candidateOrderQuery = `
      SELECT TOP 20
        h.sales_order_id,
        h.voucher_date,
        h.shipping_type_ID
      FROM dbo.sales_order_body b
      INNER JOIN dbo.sales_order_header h
        ON h.sales_order_id = b.sales_order_id
      WHERE ${orderWhere.join(" AND ")}
      ORDER BY h.voucher_date DESC
    `;

    const { data: candidateRows } = await querySqlServer<{
      sales_order_id: number;
      voucher_date: string;
      shipping_type_ID: number | null;
    }>(candidateOrderQuery, params);

    const etas: string[] = [];
    for (const c of candidateRows ?? []) {
      const derivedStatus = await deriveOrderStatusFromERP(c.sales_order_id);
      if (derivedStatus === "DELIVERED") continue;
      const eta = estimateExpectedDeliveryDate({
        voucherDate: String(c.voucher_date ?? "").slice(0, 10),
        shippingTypeId: c.shipping_type_ID ?? null,
        warehouseId: selectedWarehouseId,
        status: derivedStatus,
      });
      if (eta) etas.push(eta);
    }

    if (etas.length) {
      etas.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      expectedAvailableBy = etas[0] ?? null;
    }
  }

  // ---------------------------------------------------------------------------
  // 5) Optional: show other warehouses availability
  // ---------------------------------------------------------------------------
  let otherWarehouses:
    | Array<{ warehouse_id: number | null; warehouse_name: string | null; available_qty: number | null }>
    | undefined = undefined;

  // If user requested other warehouses, OR if it's out of stock and we are checking availability.
  if (asksWarehouseLocations || includeOther || (asksAvailability && availableQty <= 0)) {
    const { data: altStockRows } = await querySqlServer<{
      location_id: number;
      STOCK_QTY: number | null;
    }>(
      `SELECT location_id, STOCK_QTY
       FROM dbo.CurrentStock
       WHERE product_id = @pid AND STOCK_QTY > 0
       ORDER BY STOCK_QTY DESC`,
      { pid: productId },
    );

    const altRows = altStockRows ?? [];
    const altLocationIds = Array.from(new Set(altRows.map((r) => r.location_id).filter(Boolean)));
    const { data: locRows } = await querySqlServer<{ Location_id: number; Description: string }>(
      altLocationIds.length
        ? `SELECT Location_id, Description FROM dbo.Location WHERE Location_id IN (${altLocationIds.join(",")})`
        : "SELECT Location_id, Description FROM dbo.Location WHERE 1=0",
    );
    const locMap = new Map((locRows ?? []).map((l) => [Number(l.Location_id), String(l.Description)]));

    otherWarehouses = altRows.map((r) => ({
      warehouse_id: r.location_id ?? null,
      warehouse_name: locMap.get(r.location_id ?? -1) ?? null,
      available_qty: r.STOCK_QTY ?? 0,
    }));
  }

  // ---------------------------------------------------------------------------
  // 6) Finalizing response: ALWAYS return product_card for specific leaf searches
  // ---------------------------------------------------------------------------
  return {
    product_card: {
      product: {
        product_id: productId,
        product_name: productName,
        sku,
      },
      warehouse: {
        warehouse_id: selectedWarehouseId,
        warehouse_name: selectedWarehouse?.warehouse_name ?? null,
        scope_note: scopeNote,
      },
      availability: {
        available: availableQty > 0,
        available_qty: availableQty,
        expected_available_by: expectedAvailableBy,
      },
      offer_other_warehouses: availableQty <= 0 && !otherWarehouses?.length,
      other_warehouses: otherWarehouses,
      order_history: {
        latest_orders: latestOrdersWithMeta,
        orders_count: latestOrdersRaw.length,
        should_reorder: shouldReorder || latestOrdersRaw.length === 0,
        reorder_prompt: latestOrdersRaw.length === 0 ? `No prior orders found for this product in your history. Would you like to reorder?` : reorderPrompt,
        last_order_date: lastOrderDateIso,
      },
      // Fetch similar products when there's no order history (new product for this user)
      similar_products: latestOrdersRaw.length === 0
        ? await fetchSimilarProducts(productName, productId)
        : [],
    },
  };
}

export async function sqlServerGetProductOrderedQuantity(
  productQuery: string,
  months: number | undefined,
  profile: UserProfile,
) {
  const cleanQuery = String(productQuery ?? "").trim();
  if (!cleanQuery) return { error: "Product query is required." };

  const historyMonths = Number.isFinite(Number(months))
    ? Math.max(1, Math.min(12, Number(months)))
    : 3;

  const resolved = await resolveProductMasterFromUserText(cleanQuery);
  if (resolved.kind === "none") {
    return {
      error: `No product found matching "${cleanQuery}". Use **SKU** (catalogue_no) or name as in ERP.`,
    };
  }
  if (resolved.kind === "many") {
    return {
      message: `Multiple products matched "${cleanQuery}". Please reply with the exact **SKU**.`,
      product_candidates: resolved.candidates.map((m) => ({
        product_id: m.product_id,
        sku: m.catalogue_no,
        product_name: m.description,
      })),
    };
  }

  const product = resolved.product;
  const params: Record<string, number | string> = {
    pid: product.product_id,
    months: historyMonths,
  };
  const where: string[] = [
    `b.packing_id IN (SELECT packing_id FROM dbo.CurrentStock WHERE product_id = @pid)`,
    `h.voucher_date >= DATEADD(MONTH, -@months, CAST(GETDATE() AS DATE))`,
  ];

  // Domestic filter: only show orders for Indian distributors
  where.push(`EXISTS (
    SELECT 1 FROM dbo.ACCOUNT_MASTER AM
    INNER JOIN dbo.State S ON AM.STATE_ID = S.State_id
    WHERE AM.ACCOUNT_ID = h.account_id AND S.Domestic_Export = 'D'
  )`);

  if (profile.role === "distributor") {
    const accountIds = getDistributorSqlAccountIds(profile);
    if (!accountIds.length) {
      return {
        error:
          "Your account is not linked to an ERP customer (companies.erp_account_id). Ask an admin to configure it.",
      };
    }
    const placeholders = accountIds.map((_, i) => `@acc${i}`).join(", ");
    accountIds.forEach((id, i) => {
      params[`acc${i}`] = id;
    });
    where.push(`h.account_id IN (${placeholders})`);
  }

  const { data: rows, error } = await querySqlServer<{
    sales_order_id: number;
    voucher_number: string;
    voucher_date: string;
    quantity: number | null;
    line_total: number | null;
    status: string;
  }>(
    `SELECT TOP 200
       h.sales_order_id,
       h.voucher_number,
       h.voucher_date,
       SUM(COALESCE(b.net_order_qty, b.order_qty, 0)) AS quantity,
       SUM(COALESCE(b.Item_Total_Amount, 0)) AS line_total,
       ${ERP_ORDER_STATUS_CASE_SQL} AS status
     FROM dbo.sales_order_body b
     INNER JOIN dbo.sales_order_header h ON h.sales_order_id = b.sales_order_id
     WHERE ${where.join(" AND ")}
     GROUP BY h.sales_order_id, h.voucher_number, h.voucher_date, h.account_id, h.Total_Order_Amount
     ORDER BY h.voucher_date DESC`,
    params,
  );

  if (error) return { error: error.message || "Failed to fetch product order history." };

  const orders = (rows ?? []).map((r) => ({
    order_number: String(r.voucher_number ?? ""),
    order_date: r.voucher_date,
    quantity: Number(r.quantity ?? 0),
    line_total: r.line_total == null ? null : Number(r.line_total),
    status: String(r.status ?? "PENDING"),
  }));
  const totalQuantity = orders.reduce((s, o) => s + (Number.isFinite(o.quantity) ? o.quantity : 0), 0);

  return {
    product: {
      product_id: product.product_id,
      product_name: product.description ?? null,
      sku: product.catalogue_no ?? null,
    },
    months: historyMonths,
    total_quantity: totalQuantity,
    orders_count: orders.length,
    orders,
  };
}

export async function sqlServerGetOrdersByLineItem(
  productQuery: string,
  limit: number | undefined,
  profile: UserProfile,
) {
  const cleanQuery = String(productQuery ?? "").trim();
  if (!cleanQuery) return { error: "Product query is required." };

  const maxRows = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(100, Number(limit))) : 50;

  const resolved = await resolveProductMasterFromUserText(cleanQuery);
  if (resolved.kind === "none") {
    return { error: `No product found matching "${cleanQuery}". Use **SKU** or name as in ERP.` };
  }
  if (resolved.kind === "many") {
    return {
      message: `Multiple products matched "${cleanQuery}". Please reply with the exact **SKU**.`,
      product_candidates: resolved.candidates.map((m) => ({
        product_id: m.product_id,
        sku: m.catalogue_no,
        product_name: m.description,
      })),
    };
  }

  const product = resolved.product;
  const params: Record<string, number | string> = { pid: product.product_id };
  const where: string[] = [
    `b.packing_id IN (SELECT packing_id FROM dbo.CurrentStock WHERE product_id = @pid)`,
  ];

  // Domestic filter: only show orders for Indian distributors
  where.push(`EXISTS (
    SELECT 1 FROM dbo.ACCOUNT_MASTER AM
    INNER JOIN dbo.State S ON AM.STATE_ID = S.State_id
    WHERE AM.ACCOUNT_ID = h.account_id AND S.Domestic_Export = 'D'
  )`);

  if (profile.role === "warehouse" && profile.warehouse_id) {
    where.push(`b.Despatch_Location_ID = @loc`);
    params.loc = profile.warehouse_id;
  }

  if (profile.role === "distributor") {
    const accountIds = getDistributorSqlAccountIds(profile);
    if (!accountIds.length) {
      return {
        error:
          "Your account is not linked to an ERP customer (companies.erp_account_id). Ask an admin to configure it.",
      };
    }
    const placeholders = accountIds.map((_, i) => `@acc${i}`).join(", ");
    accountIds.forEach((id, i) => {
      params[`acc${i}`] = id;
    });
    where.push(`h.account_id IN (${placeholders})`);
  }

  // Super admin: keep full ERP account scope (no hard-coded distributor filter).

  const { data, error } = await querySqlServer<{
    sales_order_id: number;
    order_number: string;
    order_date: string;
    quantity: number | null;
    line_total: number | null;
    status: string;
    customer_name: string | null;
  }>(
    `SELECT TOP ${maxRows}
       h.sales_order_id,
       h.voucher_number AS order_number,
       h.voucher_date AS order_date,
       SUM(COALESCE(b.net_order_qty, b.order_qty, 0)) AS quantity,
       SUM(COALESCE(b.Item_Total_Amount, 0)) AS line_total,
       ${ERP_ORDER_STATUS_CASE_SQL} AS status,
       LTRIM(RTRIM(m.FULL_NAME)) AS customer_name
     FROM dbo.sales_order_header h
     INNER JOIN dbo.sales_order_body b ON b.sales_order_id = h.sales_order_id
     LEFT JOIN dbo.ACCOUNT_MASTER m ON m.ACCOUNT_ID = h.account_id
     WHERE ${where.join(" AND ")}
     GROUP BY h.sales_order_id, h.voucher_number, h.voucher_date, h.account_id, h.Total_Order_Amount, m.FULL_NAME
     HAVING SUM(COALESCE(b.net_order_qty, b.order_qty, 0)) > 0
     ORDER BY h.voucher_date DESC`,
    params,
  );

  if (error) return { error: error.message || "Failed to fetch orders by line item." };

  return {
    product: {
      product_id: product.product_id,
      product_name: product.description ?? null,
      sku: product.catalogue_no ?? null,
    },
    orders: (data ?? []).map((r) => ({
      order_number: String(r.order_number ?? ""),
      order_date: r.order_date,
      status: String(r.status ?? "PENDING"),
      customer_name: r.customer_name ?? null,
      quantity: Number(r.quantity ?? 0),
      line_total: r.line_total == null ? null : Number(r.line_total),
    })),
    total_count: (data ?? []).length,
  };
}

/**
 * Traces the supply chain for a product to explain "Awaiting Factory" or out-of-stock states.
 * Checks: Stock -> Requisitions -> BOM -> Raw Material Stock -> Raw Material POs.
 */
export async function sqlServerGetProductSupplyStatus(productQuery: string, profile: UserProfile) {
  const cleanQuery = String(productQuery ?? "").trim();
  if (!cleanQuery) return { error: "Product query is required." };

  const resolved = await resolveProductMasterFromUserText(cleanQuery);
  if (resolved.kind === "none") {
    return { error: `No product found matching "${cleanQuery}". Use **SKU** or name as in ERP.` };
  }
  if (resolved.kind === "many") {
    return {
      message: `Multiple products matched "${cleanQuery}". Please reply with the exact **SKU**.`,
      product_candidates: resolved.candidates.map((m) => ({
        product_id: m.product_id,
        sku: m.catalogue_no,
        product_name: m.description,
      })),
    };
  }

  const product = resolved.product;
  const pid = product.product_id;

  // 1. Current Finished Stock
  const { data: stockRows } = await querySqlServer<{
    warehouse: string;
    STOCK_QTY: number;
  }>(
    `SELECT l.Description AS warehouse, s.STOCK_QTY 
     FROM dbo.CurrentStock s 
     JOIN dbo.Location l ON l.Location_id = s.location_id
     WHERE s.product_id = @pid`,
    { pid },
  );

  // 2. Production Type
  const { data: prodTypeRows } = await querySqlServer<{
    Production_Type: string;
    Remarks: string;
  }>(`SELECT Production_Type, Remarks FROM dbo.Product_Production_Type WHERE Product_Id = @pid`, { pid });

  // 3. Pending Requisitions (Why it's "Awaiting Factory")
  const { data: reqRows } = await querySqlServer<{
    VOUCHER_NUMBER: string;
    VOUCHER_DATE: string;
    QTY: number;
    RECEIVED_QTY: number;
    NET_QTY: number;
    STATUS_REMARKS: string;
    DATE_REQUIRED: string | null;
  }>(
    `SELECT TOP 5 VOUCHER_NUMBER, VOUCHER_DATE, QTY, RECEIVED_QTY, (QTY - RECEIVED_QTY) as NET_QTY, STATUS_REMARKS, DATE_REQUIRED
     FROM dbo.REQUISITION 
     WHERE ITEM_ID = @pid 
       AND (QTY - RECEIVED_QTY) > 0
     ORDER BY VOUCHER_DATE DESC`,
    { pid },
  );

  // 4. BOM & Raw Materials
  const { data: bomRows } = await querySqlServer<{
    ITEM_ID: number;
    item_name: string;
    QTY: number;
  }>(
    `SELECT b.ITEM_ID, m.DESCRIPTION AS item_name, b.QTY
     FROM dbo.BOM_HEADER h
     JOIN dbo.BOM_BODY b ON b.BOM_ID = h.BOM_ID
     JOIN dbo.ITEM_MASTER m ON m.ITEM_ID = b.ITEM_ID
     WHERE h.PRODUCT_ID = @pid AND h.ACTIVE = 1`,
    { pid },
  );

  const rawMaterials = [];
  if (bomRows && bomRows.length > 0) {
    for (const item of bomRows) {
      // Check RM Stock
      const { data: rmStock } = await querySqlServer<{ total: number }>(
        `SELECT SUM(stock_qty) AS total FROM dbo.item_inventory WHERE item_id = @itemId`,
        { itemId: item.ITEM_ID },
      );

      // Check RM POs
      const { data: rmPOs } = await querySqlServer<{
        Voucher_Number: string;
        Voucher_Date: string;
        Qty: number;
        Received_Qty: number;
        Net_Qty: number;
      }>(
        `SELECT TOP 3 Voucher_Number, Voucher_Date, Qty, Received_Qty, (Qty - Received_Qty) AS Net_Qty
         FROM dbo.Purchase_Order 
         WHERE Item_ID = @itemId AND (Qty - Received_Qty) > 0
         ORDER BY Voucher_Date DESC`,
        { itemId: item.ITEM_ID },
      );

      rawMaterials.push({
        item_id: item.ITEM_ID,
        item_name: item.item_name,
        needed_per_unit: item.QTY,
        in_stock: Number(rmStock?.[0]?.total || 0),
        pending_purchase_orders: (rmPOs || []).map((p) => ({
          po_number: p.Voucher_Number,
          date: p.Voucher_Date,
          pending_qty: Number(p.Net_Qty),
        })),
      });
    }
  }

  return {
    product: {
      product_id: pid,
      product_name: product.description,
      sku: product.catalogue_no,
      production_type: prodTypeRows?.[0]?.Production_Type || "Standard",
    },
    finished_stock: (stockRows || []).map((s) => ({
      warehouse: s.warehouse,
      qty: s.STOCK_QTY,
    })),
    pending_requisitions: (reqRows || []).map((r) => ({
      voucher: r.VOUCHER_NUMBER,
      date: r.VOUCHER_DATE,
      pending_qty: Number(r.NET_QTY),
      remarks: r.STATUS_REMARKS,
      required_by: r.DATE_REQUIRED,
    })),
    raw_materials: rawMaterials,
    summary:
      reqRows && reqRows.length > 0
        ? `Product is currently "Awaiting Factory" with ${reqRows.length} pending requisitions.`
        : stockRows && stockRows.some((s) => s.STOCK_QTY > 0)
          ? "Product has finished stock available."
          : "Product is out of stock and no active factory requisitions found.",
  };
}

