-- Gap C+D: persisted indicative ETA/next-update snapshot keyed by ERP sales_order_id.

CREATE TABLE IF NOT EXISTS public.erp_order_predictions (
  sales_order_id bigint PRIMARY KEY,
  prediction_version text NOT NULL,
  predicted_eta_center date,
  predicted_window_start date,
  predicted_window_end date,
  next_update_by_date date,
  derived_status text,
  truth_signals text[],
  dispatch_confidence text,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS erp_order_predictions_generated_idx
  ON public.erp_order_predictions (generated_at DESC);

COMMENT ON TABLE public.erp_order_predictions IS
  'Caches lastcomputed Phase 1 ETA band + next update by derived from tooling (not authored in ERP).';

ALTER TABLE public.erp_order_predictions ENABLE ROW LEVEL SECURITY;
