import type { LaneAExpectedDeliveryBand, LaneAOrderSnapshot } from "@/types/lane-a";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Accept legacy JSON that used `eta_band` before rename to `expected_delivery_band`. */
function readDeliveryBand(raw: Record<string, unknown>): LaneAExpectedDeliveryBand | null {
  const band = raw.expected_delivery_band ?? raw.eta_band;
  if (!isRecord(band) || typeof band.label !== "string") return null;
  return band as unknown as LaneAExpectedDeliveryBand;
}

function isLaneASnapshot(v: unknown): v is LaneAOrderSnapshot {
  if (!isRecord(v)) return false;
  const band = readDeliveryBand(v);
  return (
    typeof v.external_status === "string" &&
    typeof v.explanation === "string" &&
    band != null &&
    typeof v.next_action === "string" &&
    typeof v.next_action_reason === "string"
  );
}

function normalizeLaneASnapshot(raw: Record<string, unknown>): LaneAOrderSnapshot | null {
  if (!isLaneASnapshot(raw)) return null;
  const band = readDeliveryBand(raw);
  if (!band) return null;
  const dcRaw = raw.dispatch_confidence;
  const dispatchConfidence =
    dcRaw === "HIGH" || dcRaw === "MEDIUM" || dcRaw === "LOW" ? dcRaw : undefined;

  const srs = raw.status_reason_signals;
  const signals =
    Array.isArray(srs) && srs.every((x) => typeof x === "string") ? srs.map(String) : undefined;

  const scRaw = raw.status_confidence;
  const statusConfidence =
    scRaw === "HIGH" || scRaw === "MEDIUM" || scRaw === "LOW" ? scRaw : undefined;

  const pred = raw.prediction_version;
  const predictionVersion = pred != null && pred !== undefined ? String(pred) : undefined;

  return {
    external_status: String(raw.external_status),
    explanation: String(raw.explanation),
    expected_delivery_band: band,
    next_update_by: raw.next_update_by == null ? null : String(raw.next_update_by),
    next_action: raw.next_action as LaneAOrderSnapshot["next_action"],
    next_action_reason: String(raw.next_action_reason),
    date_of_removal: raw.date_of_removal == null ? undefined : String(raw.date_of_removal),
    transport_name: raw.transport_name == null ? undefined : String(raw.transport_name),
    transport_document_number:
      raw.transport_document_number == null ? undefined : String(raw.transport_document_number),
    ...(dispatchConfidence != null ? { dispatch_confidence: dispatchConfidence } : {}),
    dispatch_reason_code:
      raw.dispatch_reason_code == null || raw.dispatch_reason_code === undefined
        ? undefined
        : String(raw.dispatch_reason_code),
    ...(signals != null ? { status_reason_signals: signals } : {}),
    ...(statusConfidence != null ? { status_confidence: statusConfidence } : {}),
    ...(predictionVersion != null ? { prediction_version: predictionVersion } : {}),
  };
}

export interface ParsedAssistantJson {
  /** Prose with all ```json``` blocks removed */
  text: string;
  laneA: LaneAOrderSnapshot | null;
  orderNumberFromJson: string | null;
  /** Data for StructuredDataRenderer: order/invoice/inventory arrays */
  structuredData: unknown | null;
}

/**
 * Parse all ```json``` blocks: lane_a snapshot, invoice cards, order arrays.
 */
export function parseAssistantJsonBlocks(content: string): ParsedAssistantJson {
  const blocks: RegExpExecArray[] = [];
  const re = /```json\s*([\s\S]*?)\s*```/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(content)) !== null) {
    blocks.push(mm);
  }
  let text = content;
  let laneA: LaneAOrderSnapshot | null = null;
  let orderNumberFromJson: string | null = null;
  let structuredData: unknown | null = null;

  for (const m of blocks) {
    try {
      const parsed: unknown = JSON.parse(m[1]);
      text = text.replace(m[0], "");
      if (isRecord(parsed) && parsed.lane_a != null && isLaneASnapshot(parsed.lane_a)) {
        laneA = normalizeLaneASnapshot(parsed.lane_a as unknown as Record<string, unknown>);
        const on = parsed.order_number;
        orderNumberFromJson = typeof on === "string" ? on : null;
        continue;
      }
      if (Array.isArray(parsed)) {
        if (!structuredData) structuredData = parsed;
        continue;
      }
      if (isRecord(parsed) && Array.isArray(parsed.invoice_card)) {
        structuredData = parsed.invoice_card;
      }
      if (isRecord(parsed) && parsed.product_card != null) {
        structuredData = parsed.product_card;
      }
    } catch {
      // keep invalid ```json``` block in prose so user still sees it
    }
  }

  return {
    text: text.trim(),
    laneA,
    orderNumberFromJson,
    structuredData,
  };
}
