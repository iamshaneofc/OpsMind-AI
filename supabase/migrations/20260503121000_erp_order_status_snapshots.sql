-- Gap B substitute: backend-only derived status timeline (no ERP history table).

CREATE TABLE IF NOT EXISTS public.erp_order_status_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id bigint NOT NULL,
  derived_status text NOT NULL,
  removal_date date,
  manual_allocation jsonb,
  erp_signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS erp_order_status_snapshots_so_created_idx
  ON public.erp_order_status_snapshots (sales_order_id, created_at DESC);

COMMENT ON TABLE public.erp_order_status_snapshots IS
  'Append-only journal when derived ERP+manual lifecycle changes vs last snapshot; keyed by dbo.sales_order_header.sales_order_id.';

ALTER TABLE public.erp_order_status_snapshots ENABLE ROW LEVEL SECURITY;
