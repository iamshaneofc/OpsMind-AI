/**
 * Lane A snapshot for Supabase-backed `getOrderStatus` (parity with SQL Server `lane_a`).
 *
 * Maps Supabase order status strings to the canonical 7-state model used by lane-a-snapshot.
 */
import type { LaneAOrderSnapshot } from "@/types/lane-a";

export function buildLaneAOrderSnapshot(params: {
  status: string;
  orderNumber: string;
  voucherDate: string | null;
  expectedDeliveryDate: string | null;
  isStockTransferOrder: boolean;
  dateOfRemoval?: string | null;
}): LaneAOrderSnapshot {
  return {
    external_status: params.status,
    explanation: "Order status tracked in Supabase.",
    expected_delivery_band: {
      label: params.expectedDeliveryDate ? "Expected by " + params.expectedDeliveryDate : "TBD",
      center_date: params.expectedDeliveryDate,
      window_start: params.expectedDeliveryDate,
      window_end: params.expectedDeliveryDate,
      is_indicative: true
    },
    next_update_by: null,
    next_action: "wait",
    next_action_reason: "Wait for further updates."
  };
}
const ALL_SEVEN_STATES = [
  "ORDER_RECEIVED",
  "ALLOCATED_LOCAL_WAREHOUSE",
  "ALLOCATED_CENTRAL_WAREHOUSE",
  "IN_PREPARATION",
  "AWAITING_FACTORY",
  "DISPATCH_READY",
  "DELIVERED",
];

function mapSupabaseToLaneAExternalStatus(params: {
  status: string | null;
  order_status: string | null;
  delivery_date: string | null;
}): string {
  if (params.delivery_date) return "DELIVERED";

  const raw = String(params.status ?? "").trim().toUpperCase();

  // Pass through any of the 7 canonical states unchanged
  if (ALL_SEVEN_STATES.includes(raw)) return raw;

  // Legacy / common Supabase status strings  
  if (raw === "DELIVERED") return "DELIVERED";
  if (raw === "DISPATCH_READY" || raw === "DISPATCHED") return "DISPATCH_READY";
  if (raw === "IN_TRANSIT") return "DISPATCH_READY";
  if (raw === "PENDING" || raw === "ORDER_RECEIVED") return "ORDER_RECEIVED";
  if (raw === "IN_PREPARATION" || raw === "AWAITING_FACTORY") return raw;

  // Fall back to order_status prose string
  const calc = String(params.order_status ?? "").trim().toLowerCase();
  if (calc.includes("deliver")) return "DELIVERED";
  if (calc.includes("dispatch") || calc.includes("transit")) return "DISPATCH_READY";
  if (calc.includes("factory") || calc.includes("await")) return "AWAITING_FACTORY";
  if (calc.includes("central")) return "ALLOCATED_CENTRAL_WAREHOUSE";
  if (calc.includes("local") || calc.includes("allocat")) return "ALLOCATED_LOCAL_WAREHOUSE";
  if (calc.includes("late") || calc.includes("delay")) return "DISPATCH_READY";
  if (calc.includes("progress") || calc.includes("work") || calc.includes("prepar")) return "IN_PREPARATION";

  return "ORDER_RECEIVED";
}

export function buildLaneAForSupabaseOrder(params: {
  order_number: string;
  status: string | null;
  order_status: string | null;
  order_date: string | null;
  expected_delivery_date: string | null;
  original_eta: string | null;
  delivery_date: string | null;
  customer_po_number?: string | null;
}) {
  const external = mapSupabaseToLaneAExternalStatus({
    status: params.status,
    order_status: params.order_status,
    delivery_date: params.delivery_date,
  });
  const expected = params.expected_delivery_date ?? params.original_eta ?? null;
  const voucherDate = params.order_date != null ? String(params.order_date) : null;
  const edd = expected != null ? String(expected).slice(0, 10) : null;
  const isStockTransferOrder =
    String(params.customer_po_number ?? "")
      .trim()
      .toLowerCase() === "stock transfer";

  return buildLaneAOrderSnapshot({
    status: external,
    orderNumber: String(params.order_number),
    voucherDate,
    expectedDeliveryDate: edd,
    isStockTransferOrder,
  });
}
