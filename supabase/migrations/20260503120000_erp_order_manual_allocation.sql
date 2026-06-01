-- Phase 1 Gap A: manual LOCAL vs CENTRAL warehouse allocation when ERP lacks explicit flags.
-- Written by ops (warehouse / super admin) via backend API; ERP sales_order_id identifies the order.

CREATE TABLE IF NOT EXISTS public.erp_order_manual_allocation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id bigint NOT NULL,
  sales_order_body_id bigint,
  allocation_type text NOT NULL CHECK (allocation_type IN ('LOCAL', 'CENTRAL')),
  allocated_location_id integer,
  notes text,
  updated_by integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_order_manual_allocation_sales_order_id_key UNIQUE (sales_order_id)
);

CREATE INDEX IF NOT EXISTS erp_order_manual_allocation_sales_order_id_idx
  ON public.erp_order_manual_allocation (sales_order_id);

COMMENT ON TABLE public.erp_order_manual_allocation IS
  'Overrides Phase 1 order truth LOCAL/CENTRAL labels; keyed by dbo.sales_order_header.sales_order_id.';

-- API uses service role only; block direct anon/authenticated table access by default.
ALTER TABLE public.erp_order_manual_allocation ENABLE ROW LEVEL SECURITY;
