import { createSupabaseAdminClient } from "@/supabase/admin";
import type { DispatchConfidence } from "@/sql-server/order-dispatch-confidence";

/** Bump when prediction inputs or policy materially change (Gap C+D cache). */
export const PREDICTION_MODEL_VERSION = "phase1:v1";

function predictionsWritesDisabled(): boolean {
  const v = process.env.SKIP_ERP_PREDICTIONS_CACHE;
  return v === "true" || v === "1";
}

/**
 * Upserts the indicative ETA/next-update row for tooling (silent no-op on missing config/error).
 */
export async function persistOrderPrediction(params: {
  sales_order_id: number;
  predicted_eta_center: string | null;
  predicted_window_start: string | null;
  predicted_window_end: string | null;
  next_update_by_date: string | null;
  derived_status: string;
  truth_signals: string[];
  dispatch_confidence: DispatchConfidence | string | null;
  prediction_version?: string;
}): Promise<void> {
  if (predictionsWritesDisabled()) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return;

  const sid = Math.trunc(Number(params.sales_order_id));
  if (!Number.isFinite(sid) || sid <= 0) return;

  const dc =
    params.dispatch_confidence === "HIGH" || params.dispatch_confidence === "MEDIUM" || params.dispatch_confidence === "LOW"
      ? params.dispatch_confidence
      : null;

  try {
    const supabase = createSupabaseAdminClient();
    await supabase.from("erp_order_predictions").upsert(
      {
        sales_order_id: sid,
        prediction_version: params.prediction_version ?? PREDICTION_MODEL_VERSION,
        predicted_eta_center: params.predicted_eta_center,
        predicted_window_start: params.predicted_window_start,
        predicted_window_end: params.predicted_window_end,
        next_update_by_date: params.next_update_by_date,
        derived_status: params.derived_status,
        truth_signals: params.truth_signals,
        dispatch_confidence: dc,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "sales_order_id" },
    );
  } catch {
    /* never throw */
  }
}
