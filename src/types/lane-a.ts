/**
 * Client-safe types for Lane A snapshot (mirrors `sql-server/lane-a-snapshot.ts`).
 */
export type LaneANextAction = "wait" | "raise_udr" | "request_transfer" | "escalate";

/** Indicative expected delivery window (not a contractual commitment). */
export interface LaneAExpectedDeliveryBand {
  label: string;
  center_date: string | null;
  window_start: string | null;
  window_end: string | null;
  is_indicative: true;
}

/** Phase 1 Gap E — how trustworthy dispatch/delivery signalling is versus raw ERP proxies. */
export type LaneADispatchConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface LaneAOrderSnapshot {
  external_status: string;
  explanation: string;
  expected_delivery_band: LaneAExpectedDeliveryBand;
  next_update_by: string | null;
  next_action: LaneANextAction;
  next_action_reason: string;
  date_of_removal?: string | null;
  transport_name?: string | null;
  transport_document_number?: string | null;
  /** Dispatch / delivery inference confidence when derived from ERP (null if not applicable). */
  dispatch_confidence?: LaneADispatchConfidence | null;
  /** Machine reason for confidence (distinct from conversational explanation). */
  dispatch_reason_code?: string | null;
  /** How reliable the synthesized status/next-step framing is versus raw ERP (Lane A §6). */
  status_confidence?: LaneADispatchConfidence | null;
  /** Short machine-readable tags echoing derivation inputs (`truth_signals` from tooling). */
  status_reason_signals?: string[];
  /** Model/version tag for ETA band + next-update policy (`phase1:v1`). */
  prediction_version?: string | null;
}
