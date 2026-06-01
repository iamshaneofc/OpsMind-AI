-- Map app companies to SQL Server ERP customer account(s).
-- dbo.sales_order_header.account_id must match one of these for distributor order visibility.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS erp_account_id integer;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS erp_account_ids integer[];

COMMENT ON COLUMN public.companies.erp_account_id IS
  'ERP ACCOUNT_ID (dbo.ACCOUNT_MASTER / dbo.sales_order_header.account_id).';

COMMENT ON COLUMN public.companies.erp_account_ids IS
  'Optional multiple ERP account IDs for one app company. When set and non-empty, used for order filtering instead of erp_account_id.';

-- Example (replace with real ACCOUNT_ID values from SQL Server):
-- UPDATE public.companies SET erp_account_id = 1426 WHERE company_id = 8;
-- UPDATE public.companies SET erp_account_id = 1428 WHERE company_id = 9;
-- Or multiple:
-- UPDATE public.companies SET erp_account_ids = ARRAY[1426, 1427] WHERE company_id = 8;
