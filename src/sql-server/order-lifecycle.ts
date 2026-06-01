/**
 * Single source of truth for ERP order lifecycle: status + indicative expected delivery.
 * Used by dashboard order lists (`getOrdersForRole`) and chatbot SQL tools (`sqlServerGetOrderStatus`).
 *
 * 7 ORDER STATES (derived purely from ERP invoice + order_body signals):
 *   1. ORDER_RECEIVED          — Sales order exists, no invoice linked yet
 *   2. ALLOCATED_LOCAL_WAREHOUSE — Invoice in draft (unconfirmed), no special flags
 *                                  (local allocation implied; ERP has no explicit signal)
 *   3. ALLOCATED_CENTRAL_WAREHOUSE — Any order_body line has Order_Forwarded = 1
 *      or Gap H: `Despatch_Location_ID` matches the configured central hub depot
 *   4. IN_PREPARATION           — Invoice exists, no removal, no dispatch-ready signal yet
 *   5. AWAITING_FACTORY         — request_initialised = 1 AND request_processed = 0 on any body line
 *   6. DISPATCH_READY           — Invoice confirmed, or transport/vehicle proxies, no DATE_OF_REMOVAL
 *   7. DELIVERED                — Invoice has DATE_OF_REMOVAL set
 *
 * Gap E dispatch-ready may also fire when invoice is **not confirmed** but
 * `TRANSPORT_NAME` / `VEHICLE_NUMBER` (logistics proxy) is populated.
 *
 * Optional Supabase `erp_order_manual_allocation` (Phase 1 Gap A) can promote
 * ORDER_RECEIVED / IN_PREPARATION → ALLOCATED_* when ERP lacks explicit local flag.
 */
import type { ErpManualAllocationRow, ErpManualAllocationSnapshot } from "@/lib/erp-manual-allocation";
import { fetchErpManualAllocationBySalesOrderId } from "@/lib/erp-manual-allocation";
import { resolveCentralWarehouseLocationId } from "@/lib/erp-central-warehouse";
import { appendStatusSnapshotJournalIfNeeded, type ErpDerivedSignalsSnapshot } from "@/lib/erp-order-status-journal";
import {
  type DispatchConfidence,
  type DispatchReasonCode,
  finalizeDispatchEvidence,
  hasTransportHint as invoiceHasTransportHint,
} from "./order-dispatch-confidence";
import { querySqlServer } from "./client";

export type { DispatchConfidence, DispatchReasonCode };

export type OrderLifecycleFromErp = {
  status: string;
  /** ERP `Sales_Invoice_Header.DATE_OF_REMOVAL` when the order is delivered (removal/dispatch from warehouse). */
  removalDate: string | null;
  /** Set when a manual allocation row exists (may or may not override `status` due to stronger ERP signals). */
  manual_allocation?: ErpManualAllocationSnapshot | null;
  /** Gap E — strength of inference from ERP proxies (HIGH only for removal-based DELIVERED). */
  dispatch_confidence: DispatchConfidence | null;
  dispatch_reason_code: DispatchReasonCode | null;
  has_transport_hint: boolean;
  /** Signals that drove the derivation (Lane A §6 / prediction cache). */
  truth_signals: string[];
};

function applyManualAllocationToDerived(
  derived: { status: string; removalDate: string | null },
  params: {
    isForwardedOrCentralHubDespatch: boolean;
    isAwaitingFactory: boolean;
    manual: ErpManualAllocationRow | null;
  },
): Omit<OrderLifecycleFromErp, "dispatch_confidence" | "dispatch_reason_code" | "has_transport_hint" | "truth_signals"> {
  const { isForwardedOrCentralHubDespatch, isAwaitingFactory, manual } = params;

  const snapshot: ErpManualAllocationSnapshot | null =
    manual != null
      ? {
          allocation_type: manual.allocation_type,
          allocated_location_id: manual.allocated_location_id,
          notes: manual.notes,
        }
      : null;

  let status = derived.status;

  if (manual != null && snapshot) {
    const terminal = status === "DELIVERED" || status === "DISPATCH_READY";
    const factoryBlocks = isAwaitingFactory;
    const forwardBlocks = isForwardedOrCentralHubDespatch;

    if (!terminal && !factoryBlocks && !forwardBlocks) {
      if (manual.allocation_type === "LOCAL") {
        status = "ALLOCATED_LOCAL_WAREHOUSE";
      } else {
        status = "ALLOCATED_CENTRAL_WAREHOUSE";
      }
    }
  }

  return {
    status,
    removalDate: derived.removalDate,
    manual_allocation: snapshot,
  };
}

function normalizeErpDate(val: string | Date | null | undefined): string | null {
  if (val == null) return null;
  const s = val instanceof Date ? val.toISOString() : String(val).trim();
  if (!s) return null;
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/**
 * Derives lifecycle state plus actual delivery/removal date from ERP (same queries as status-only).
 */
function buildTruthSignals(params: {
  hasInvoice: boolean;
  invoiceConfirmed: boolean | null | undefined;
  awaitingFactory: boolean;
  orderForwarded: boolean;
  centralHubDespatch: boolean;
  hasTransportHint: boolean;
  removalDatePresent: boolean;
}): string[] {
  const s: string[] = [];
  if (params.removalDatePresent) s.push("removal_recorded_in_erp");
  if (params.hasInvoice) {
    s.push("linked_sales_invoice");
    if (params.invoiceConfirmed === true) s.push("invoice_confirmed");
    else if (params.invoiceConfirmed === false || params.invoiceConfirmed == null)
      s.push("invoice_not_confirmed_or_pending");
    else s.push("invoice_confirmed_unknown");
  } else {
    s.push("no_linked_sales_invoice");
  }
  if (params.awaitingFactory) s.push("awaiting_factory");
  if (params.orderForwarded) s.push("order_forwarded_body");
  if (params.centralHubDespatch) s.push("central_despatch_location");
  if (!params.awaitingFactory && params.hasTransportHint) s.push("logistics_transport_proxy");
  return s;
}

export async function deriveOrderLifecycleFromERP(salesOrderId: number): Promise<OrderLifecycleFromErp> {
  const manualRow = await fetchErpManualAllocationBySalesOrderId(salesOrderId);
  const centralWarehouseLocationId = resolveCentralWarehouseLocationId();

  // Step 1: Check the most recent invoice linked to this order (+ logistics proxies for Gap E)
  const { data: invoices } = await querySqlServer<{
    sales_invoice_header_id: number;
    DATE_OF_REMOVAL: string | null;
    confirmed: boolean | null;
    TRANSPORT_NAME: string | null;
    VEHICLE_NUMBER: string | null;
  }>(
    `SELECT TOP 1
       h.sales_invoice_header_id,
       h.DATE_OF_REMOVAL,
       h.confirmed,
       h.TRANSPORT_NAME,
       h.VEHICLE_NUMBER
     FROM dbo.Sales_Invoice_Header h
     WHERE EXISTS (
       SELECT 1
       FROM dbo.Sales_Invoice_Body b
       JOIN dbo.sales_order_body sob ON sob.sales_order_body_id = b.sales_order_body_id
       WHERE b.sales_invoice_header_id = h.sales_invoice_header_id
         AND sob.sales_order_id = @orderId
     )
     ORDER BY h.voucher_date DESC, h.sales_invoice_header_id DESC`,
    { orderId: salesOrderId },
  );

  const invoice = invoices?.[0];

  // Step 2: Check order_body flags (forwarding + factory request + Gap H hub despatch location)
  const { data: bodyRows } = await querySqlServer<{
    Order_Forwarded: boolean | number;
    request_initialised: boolean | number;
    request_processed: boolean | number;
    AwaitingFactory: boolean | number;
    Central_Despatch_Hub: boolean | number;
    Has_Despatch_Location: boolean | number;
  }>(
    `SELECT TOP 1
       CAST(MAX(CAST(Order_Forwarded AS int)) AS bit) AS Order_Forwarded,
       CAST(MAX(CAST(request_initialised AS int)) AS bit) AS request_initialised,
       CAST(MAX(CAST(request_processed AS int)) AS bit) AS request_processed,
       CAST(MAX(
         CASE
           WHEN ISNULL(CAST(request_initialised AS int), 0) = 1
            AND ISNULL(CAST(request_processed AS int), 0) = 0
           THEN 1 ELSE 0
         END
       ) AS bit) AS AwaitingFactory,
       CAST(MAX(
         CASE WHEN Despatch_Location_ID IS NOT NULL AND Despatch_Location_ID = @centralWarehouseId THEN 1 ELSE 0 END
       ) AS bit) AS Central_Despatch_Hub,
       CAST(MAX(CASE WHEN Despatch_Location_ID IS NOT NULL THEN 1 ELSE 0 END) AS bit) AS Has_Despatch_Location
     FROM dbo.sales_order_body
     WHERE sales_order_id = @orderId`,
    { orderId: salesOrderId, centralWarehouseId: centralWarehouseLocationId },
  );

  const body = bodyRows?.[0];
  const isForwarded = Boolean(body?.Order_Forwarded);
  const isCentralHubDespatch = Boolean(body?.Central_Despatch_Hub);
  const hasDespatchLocation = Boolean(body?.Has_Despatch_Location);
  const isRequestInit = Boolean(body?.request_initialised);
  const isRequestDone = Boolean(body?.request_processed);
  const isAwaitingFactory = Boolean(body?.AwaitingFactory);
  /** Gap H: central hub depot line (`Despatch_Location_ID`) parallels `Order_Forwarded` for allocation state. */
  const forwardOrCentralHub = isForwarded || isCentralHubDespatch;

  let dispatch_ready_source: "confirmed" | "logistics_proxy" | undefined;

  let erpBare: { status: string; removalDate: string | null };

  if (isAwaitingFactory) {
    erpBare = { status: "AWAITING_FACTORY", removalDate: null };
  } else if (!invoice) {
    if (forwardOrCentralHub) {
      erpBare = { status: "ALLOCATED_CENTRAL_WAREHOUSE", removalDate: null };
    } else if (hasDespatchLocation) {
      erpBare = { status: "ALLOCATED_LOCAL_WAREHOUSE", removalDate: null };
    } else {
      erpBare = { status: "ORDER_RECEIVED", removalDate: null };
    }
  } else if (invoice.DATE_OF_REMOVAL) {
    erpBare = { status: "DELIVERED", removalDate: normalizeErpDate(invoice.DATE_OF_REMOVAL) };
  } else if (invoice.confirmed) {
    erpBare = { status: "DISPATCH_READY", removalDate: null };
    dispatch_ready_source = "confirmed";
  } else if (invoiceHasTransportHint(invoice.TRANSPORT_NAME, invoice.VEHICLE_NUMBER)) {
    erpBare = { status: "DISPATCH_READY", removalDate: null };
    dispatch_ready_source = "logistics_proxy";
  } else if (forwardOrCentralHub) {
    erpBare = { status: "ALLOCATED_CENTRAL_WAREHOUSE", removalDate: null };
  } else if (hasDespatchLocation) {
    erpBare = { status: "ALLOCATED_LOCAL_WAREHOUSE", removalDate: null };
  } else {
    erpBare = { status: "IN_PREPARATION", removalDate: null };
  }

  const invoiceForEvidence = invoice
    ? {
        confirmed: invoice.confirmed ?? null,
        TRANSPORT_NAME: invoice.TRANSPORT_NAME ?? null,
        VEHICLE_NUMBER: invoice.VEHICLE_NUMBER ?? null,
      }
    : undefined;

  const transportHint = invoice ? invoiceHasTransportHint(invoice.TRANSPORT_NAME, invoice.VEHICLE_NUMBER) : false;

  const dispatchEvidence = finalizeDispatchEvidence({
    erpBareStatus: erpBare.status,
    invoice: invoiceForEvidence,
    dispatchReadySource: dispatch_ready_source,
  });

  const erpSignals: ErpDerivedSignalsSnapshot = {
    has_linked_invoice: Boolean(invoice),
    sales_invoice_header_id: invoice?.sales_invoice_header_id ?? null,
    invoice_confirmed: invoice?.confirmed ?? null,
    invoice_date_of_removal: invoice?.DATE_OF_REMOVAL ? normalizeErpDate(invoice.DATE_OF_REMOVAL) : null,
    order_forwarded: isForwarded,
    central_despatch_hub: isCentralHubDespatch,
    request_initialised: isRequestInit,
    request_processed: isRequestDone,
    awaiting_factory: isAwaitingFactory,
    has_transport_hint: transportHint,
    dispatch_ready_source: dispatch_ready_source ?? null,
  };

  const partial = applyManualAllocationToDerived(erpBare, {
    isForwardedOrCentralHubDespatch: forwardOrCentralHub,
    isAwaitingFactory,
    manual: manualRow,
  });

  const truth_signals = buildTruthSignals({
    hasInvoice: Boolean(invoice),
    invoiceConfirmed: invoice?.confirmed ?? null,
    awaitingFactory: isAwaitingFactory,
    orderForwarded: isForwarded,
    centralHubDespatch: isCentralHubDespatch,
    hasTransportHint: transportHint,
    removalDatePresent: Boolean(invoice?.DATE_OF_REMOVAL),
  });

  const lifecycle: OrderLifecycleFromErp = {
    ...partial,
    dispatch_confidence: dispatchEvidence.dispatch_confidence,
    dispatch_reason_code: dispatchEvidence.dispatch_reason_code,
    has_transport_hint: dispatchEvidence.has_transport_hint,
    truth_signals,
  };

  await appendStatusSnapshotJournalIfNeeded(salesOrderId, lifecycle, erpSignals).catch(() => {});

  return lifecycle;
}

/**
 * Derives the current lifecycle state for a sales order from ERP signals.
 * Returns one of the 7 state constants above.
 */
export async function deriveOrderStatusFromERP(salesOrderId: number): Promise<string> {
  const { status } = await deriveOrderLifecycleFromERP(salesOrderId);
  return status;
}

function addDays(dateText: string, days: number): string | null {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + Math.max(0, days));
  return date.toISOString().slice(0, 10);
}

/**
 * Indicative expected delivery date using client placeholder timelines:
 *   States 1 & 2 (ORDER_RECEIVED, ALLOCATED_LOCAL_WAREHOUSE)    → +3 days
 *   State  3     (ALLOCATED_CENTRAL_WAREHOUSE)                   → +5 days
 *   States 4 & 5 (IN_PREPARATION, AWAITING_FACTORY)             → +7 days
 *   State  6     (DISPATCH_READY)                               → +5 days
 *   State  7     (DELIVERED)                                    → 0 (already done)
 *
 * Also applies a small shipping-type adjustment when data is available.
 */
export function estimateExpectedDeliveryDate(params: {
  voucherDate: string;
  shippingTypeId: number | null;
  warehouseId: number | null;
  status: string;
  fromCreationDate?: boolean;
}): string | null {
  // Placeholder base days by status (client-approved timelines)
  const statusBaseDays: Record<string, number> = {
    ORDER_RECEIVED: 3,
    ALLOCATED_LOCAL_WAREHOUSE: 3,
    ALLOCATED_CENTRAL_WAREHOUSE: 5,
    IN_PREPARATION: 7,
    AWAITING_FACTORY: 7,
    DISPATCH_READY: 5,
    DELIVERED: 0,
    // Legacy / fallback keys
    PENDING: 3,
  };

  // Small optional shipping-type adjustment (+0 to +1 day)
  const shippingAdjust: Record<number, number> = {
    1: 0,  // standard/local
    2: 0,
    3: 1,  // air/express
    4: 1,
  };

  const baseDays = statusBaseDays[params.status] ?? 5;
  const shippingExtra = shippingAdjust[params.shippingTypeId ?? -1] ?? 0;
  const totalDays = baseDays + shippingExtra;

  // Use today as the base date (forward-looking estimated delivery from now)
  const today = new Date().toISOString().slice(0, 10);
  return addDays(today, totalDays);
}
