/**
 * Phase 1 Lane B: structured "truth layer" fields for order status replies.
 * Indicative only — avoids false precision; bands and next-update are policy-based.
 *
 * Supports all 7 order lifecycle states:
 *   ORDER_RECEIVED | ALLOCATED_LOCAL_WAREHOUSE | ALLOCATED_CENTRAL_WAREHOUSE |
 *   IN_PREPARATION | AWAITING_FACTORY | DISPATCH_READY | DELIVERED
 */
import type {
  LaneAExpectedDeliveryBand,
  LaneAOrderSnapshot,
  LaneANextAction,
  LaneADispatchConfidence,
} from "@/types/lane-a";

export type { LaneAOrderSnapshot, LaneANextAction, LaneAExpectedDeliveryBand } from "@/types/lane-a";

function toLaneDispatchConfidence(v: string | null | undefined): LaneADispatchConfidence | null {
  if (v === "HIGH" || v === "MEDIUM" || v === "LOW") return v;
  return null;
}

const BAND_HALF_WIDTH_DAYS = 2;

/** Human-readable display label for each state */
const STATE_LABELS: Record<string, string> = {
  ORDER_RECEIVED: "Order Received",
  ALLOCATED_LOCAL_WAREHOUSE: "Allocated – Local Warehouse",
  ALLOCATED_CENTRAL_WAREHOUSE: "Allocated – Central Warehouse",
  IN_PREPARATION: "In Preparation",
  AWAITING_FACTORY: "Awaiting Factory",
  DISPATCH_READY: "Dispatched / Ready for Delivery",
  DELIVERED: "Delivered",
  PENDING: "Order Received",
};

/** User-facing label for a canonical lifecycle code (same wording as Lane A). */
export function displayLabelForOrderStatus(canonical: string): string {
  const k = String(canonical ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (!k) return "—";
  return STATE_LABELS[k] ?? String(canonical).replace(/_/g, " ");
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value || !String(value).trim()) return null;
  const s = String(value).slice(0, 10);
  const d = new Date(`${s}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatBandLabel(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  const a = start.toLocaleDateString("en-IN", opts);
  const b = end.toLocaleDateString("en-IN", opts);
  if (a === b) return `${a} (indicative)`;
  return `${a} – ${b} (indicative)`;
}

function addCalendarDays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function todayUtcDate(): Date {
  const t = new Date();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildExplanation(
  status: string,
  orderNumber: string,
  opts?: {
    dispatchReasonCode?: string | null;
  },
): string {
  const n = orderNumber || "this order";
  switch (status) {
    case "ORDER_RECEIVED":
    case "PENDING":
      return `Order ${n} has been received and logged in the ERP. It is awaiting initial processing and warehouse allocation.`;
    case "ALLOCATED_LOCAL_WAREHOUSE":
      return `Order ${n} has been assigned to the local warehouse. Stock allocation is in progress and an invoice is being prepared.`;
    case "ALLOCATED_CENTRAL_WAREHOUSE":
      return `Order ${n} has been forwarded to the central warehouse for processing. This typically means it requires stock from a central or secondary location.`;
    case "IN_PREPARATION":
      return `Order ${n} is actively being processed. An invoice has been raised and the warehouse team is preparing the shipment.`;
    case "AWAITING_FACTORY":
      return `Order ${n} is awaiting factory input or production fulfilment. A request has been raised internally and is pending processing.`;
    case "DISPATCH_READY": {
      const base = `Order ${n} is treated as dispatch-ready based on current ERP invoice signals.`;
      const code = opts?.dispatchReasonCode ?? null;
      if (code === "LOGISTICS_PROXY") {
        return `${base} Logistics proxy fields (transporter/consignment) are populated even though the invoice may not yet be marked confirmed.`;
      }
      if (code === "CONFIRMED_INVOICE_ONLY") {
        return `${base} The invoice is confirmed as far as ERP posting allows; transporter/consignment details may still be missing—verify AWB offline if needed.`;
      }
      if (code === "CONFIRMED_INVOICE_WITH_LOGISTICS") {
        return `${base} Invoice confirmation and logistics proxy fields are present in ERP.`;
      }
      return `${base} Confirm transport or pickup timing if still pending.`;
    }
    case "DELIVERED":
      return `Order ${n} shows dispatch completion in ERP — the goods have been delivered.`;
    default:
      return `Order ${n} is in status: ${STATE_LABELS[status] ?? status}.`;
  }
}

function buildExpectedDeliveryBand(expectedDeliveryDate: string | null): LaneAExpectedDeliveryBand {
  const center = parseIsoDate(expectedDeliveryDate);
  if (!center) {
    return {
      label: "Not enough data for an estimated delivery window (indicative)",
      center_date: null,
      window_start: null,
      window_end: null,
      is_indicative: true,
    };
  }
  const start = addCalendarDays(center, -BAND_HALF_WIDTH_DAYS);
  const end = addCalendarDays(center, BAND_HALF_WIDTH_DAYS);
  return {
    label: formatBandLabel(start, end),
    center_date: toIsoDate(center),
    window_start: toIsoDate(start),
    window_end: toIsoDate(end),
    is_indicative: true,
  };
}

function buildExpectedDeliveryBandForStatus(
  status: string,
  expectedDeliveryDate: string | null,
  deliveryRemovalDate?: string | null,
): LaneAExpectedDeliveryBand {
  if (status === "DELIVERED") {
    const deliveredOn = parseIsoDate(deliveryRemovalDate ?? null);
    if (deliveredOn) {
      const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
      const label = `Delivered — removal date in ERP: ${deliveredOn.toLocaleDateString("en-IN", opts)} (actual delivery per invoice/removal)`;
      return {
        label,
        center_date: toIsoDate(deliveredOn),
        window_start: null,
        window_end: null,
        is_indicative: true,
      };
    }
    return {
      label: "Delivered — no removal date recorded in ERP for this order.",
      center_date: null,
      window_start: null,
      window_end: null,
      is_indicative: true,
    };
  }
  const pendingBand = buildExpectedDeliveryBand(expectedDeliveryDate);
  if (expectedDeliveryDate && pendingBand.center_date) {
    const deliveryDate = parseIsoDate(expectedDeliveryDate);
    if (deliveryDate) {
      const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
      pendingBand.label = `Expected delivery (indicative): ${deliveryDate.toLocaleDateString("en-IN", opts)} (±${BAND_HALF_WIDTH_DAYS} days window)`;
    }
  }
  return pendingBand;
}

/**
 * Policy-based next check-in date (calendar days from "today" in UTC).
 * Follows the client's placeholder timeline offsets per state.
 */
function computeNextUpdateBy(params: {
  status: string;
  voucherDate: string | null;
  expectedDeliveryDate: string | null;
}): string | null {
  const today = todayUtcDate();
  const { status, expectedDeliveryDate } = params;

  const expectedDate = parseIsoDate(expectedDeliveryDate);
  const late = expectedDate != null && today > expectedDate && status !== "DELIVERED";

  if (late) {
    // Already past the estimated delivery date — check back tomorrow
    return toIsoDate(addCalendarDays(today, 1));
  }

  switch (status) {
    case "ORDER_RECEIVED":
    case "PENDING":
      // Just received — next update after initial allocation (1 day)
      return toIsoDate(addCalendarDays(today, 1));
    case "ALLOCATED_LOCAL_WAREHOUSE":
      // In local allocation — check back in 1 day
      return toIsoDate(addCalendarDays(today, 1));
    case "ALLOCATED_CENTRAL_WAREHOUSE":
      // Forwarded to central — allow 2 days for central processing
      return toIsoDate(addCalendarDays(today, 2));
    case "IN_PREPARATION":
      // Active preparation — next update in 2 days
      return toIsoDate(addCalendarDays(today, 2));
    case "AWAITING_FACTORY":
      // Waiting on factory — check back in 2 days
      return toIsoDate(addCalendarDays(today, 2));
    case "DISPATCH_READY":
      // Ready to go — should move soon, check tomorrow
      return toIsoDate(addCalendarDays(today, 1));
    case "DELIVERED":
      return null;
    default:
      return toIsoDate(addCalendarDays(today, 2));
  }
}

/** Calendar days from ERP order voucher date (`yyyy-mm-dd`) to UTC "today"; undefined if unreadable. */
export function orderHeadAgeUtcDays(voucherIso: string | null | undefined): number | undefined {
  const vd = parseIsoDate(voucherIso ?? null);
  if (!vd) return undefined;
  const today = todayUtcDate();
  return Math.floor((today.getTime() - vd.getTime()) / 86400000);
}

function deriveStatusConfidence(input: {
  status: string;
  dispatchConfidence: string | null | undefined;
  dateOfRemoval: string | null | undefined;
}): LaneADispatchConfidence {
  const fromDispatch = toLaneDispatchConfidence(input.dispatchConfidence ?? null);
  if (fromDispatch != null) return fromDispatch;
  if (
    input.status === "DELIVERED" &&
    parseIsoDate(input.dateOfRemoval != null ? String(input.dateOfRemoval).slice(0, 10) : null)
  )
    return "HIGH";
  return "MEDIUM";
}

function computeNextAction(params: {
  status: string;
  expectedDeliveryDate: string | null;
  isStockTransferOrder?: boolean;
  awaitingFactoryAgeDays?: number | null | undefined;
}): { action: LaneANextAction; reason: string } {
  const { status, expectedDeliveryDate, isStockTransferOrder, awaitingFactoryAgeDays } = params;
  const today = todayUtcDate();
  const expectedDate = parseIsoDate(expectedDeliveryDate);
  const daysLate =
    expectedDate && today > expectedDate && status !== "DELIVERED"
      ? Math.floor((today.getTime() - expectedDate.getTime()) / 86400000)
      : 0;

  const escalationRaw = Number(process.env.FACTORY_STALE_ESCALATION_DAYS);
  const factoryStaleDays =
    Number.isFinite(escalationRaw) && escalationRaw > 0 ? Math.floor(escalationRaw) : 14;

  // Delivered — nothing to do
  if (status === "DELIVERED") {
    return { action: "wait", reason: "Order shows completed in ERP; no follow-up needed unless disputing delivery." };
  }

  if (
    status === "AWAITING_FACTORY" &&
    awaitingFactoryAgeDays != null &&
    Number.isFinite(awaitingFactoryAgeDays) &&
    awaitingFactoryAgeDays >= factoryStaleDays
  ) {
    return {
      action: "escalate",
      reason: `Awaiting factory beyond ${factoryStaleDays} days from the order voucher (${awaitingFactoryAgeDays} days); escalate internally if unresolved.`,
    };
  }

  // Significantly overdue
  if (daysLate >= 7) {
    return {
      action: "escalate",
      reason: "The estimated delivery date has passed by a week or more; escalate if the issue is still unresolved.",
    };
  }

  // Slightly overdue
  if (daysLate >= 1) {
    return {
      action: "raise_udr",
      reason: "Past the indicative estimated delivery window; log or follow your UDR / exception process if delivery is still pending.",
    };
  }

  // State-specific actions
  switch (status) {
    case "ORDER_RECEIVED":
    case "PENDING":
      return { action: "wait", reason: "Order just received — wait for warehouse allocation to begin." };

    case "ALLOCATED_LOCAL_WAREHOUSE":
      return { action: "wait", reason: "Allocated to local warehouse — invoice preparation is underway." };

    case "ALLOCATED_CENTRAL_WAREHOUSE":
      if (isStockTransferOrder) {
        return { action: "request_transfer", reason: "Stock-transfer order forwarded to central warehouse; coordinate transfer per your process." };
      }
      return { action: "wait", reason: "Forwarded to central warehouse — allow time for central processing and stock allocation." };

    case "IN_PREPARATION":
      return { action: "wait", reason: "Invoice raised and preparation underway — within normal processing time." };

    case "AWAITING_FACTORY":
      return { action: "wait", reason: "Factory request raised; wait for production or factory fulfilment to complete." };

    case "DISPATCH_READY":
      return { action: "wait", reason: "Invoice confirmed and dispatch-ready in ERP — confirm transport or pickup timing." };

    default:
      return { action: "wait", reason: "No specific action required at this stage; wait for the next status update." };
  }
}

export function buildLaneAOrderSnapshot(input: {
  status: string;
  orderNumber: string;
  voucherDate: string | null;
  expectedDeliveryDate: string | null;
  isStockTransferOrder?: boolean;
  dateOfRemoval?: string | null;
  transportName?: string | null;
  transportDocumentNumber?: string | null;
  dispatchConfidence?: string | null;
  dispatchReasonCode?: string | null;
  truthSignals?: string[] | null;
  awaitingFactoryAgeDays?: number | null;
  predictionVersion?: string | null;
}): LaneAOrderSnapshot {
  let explanation = buildExplanation(input.status, input.orderNumber, {
    dispatchReasonCode: input.dispatchReasonCode ?? null,
  });
  const expected_delivery_band = buildExpectedDeliveryBandForStatus(
    input.status,
    input.expectedDeliveryDate,
    input.dateOfRemoval ?? null,
  );
  const next_update_by = computeNextUpdateBy({
    status: input.status,
    voucherDate: input.voucherDate,
    expectedDeliveryDate: input.expectedDeliveryDate,
  });
  if (next_update_by && input.status !== "DELIVERED") {
    explanation += ` **Next update (indicative):** ${next_update_by}.`;
  }
  const { action: next_action, reason: next_action_reason } = computeNextAction({
    status: input.status,
    expectedDeliveryDate: input.expectedDeliveryDate,
    isStockTransferOrder: input.isStockTransferOrder,
    awaitingFactoryAgeDays: input.awaitingFactoryAgeDays,
  });

  const status_confidence = deriveStatusConfidence({
    status: input.status,
    dispatchConfidence: input.dispatchConfidence ?? null,
    dateOfRemoval: input.dateOfRemoval ?? null,
  });
  const status_reason_signals = input.truthSignals?.length ? [...input.truthSignals] : undefined;

  return {
    external_status: input.status,
    explanation,
    expected_delivery_band,
    next_update_by,
    next_action,
    next_action_reason,
    date_of_removal: input.dateOfRemoval,
    transport_name: input.transportName,
    transport_document_number: input.transportDocumentNumber,
    dispatch_confidence: toLaneDispatchConfidence(input.dispatchConfidence),
    dispatch_reason_code: input.dispatchReasonCode ?? null,
    status_confidence,
    ...(status_reason_signals != null ? { status_reason_signals } : {}),
    ...(input.predictionVersion != null && input.predictionVersion !== ""
      ? { prediction_version: input.predictionVersion }
      : {}),
  };
}
