/*
  Run on ERP (SiscoERP) in SSMS.
  Picks one row per account_id: the analysis_id (same as dbo.Location.Location_id)
  that appears most often on sales_order_header — use as public.companies.base_warehouse_id.
  Edit the IN (...) list to match ACCOUNT_IDs you map in Supabase (erp_account_id).
*/

WITH agg AS (
  SELECT
    account_id,
    analysis_id,
    COUNT(*) AS cnt
  FROM dbo.sales_order_header
  WHERE account_id IS NOT NULL
    AND analysis_id IS NOT NULL
    AND account_id IN (1426, 1428)  -- add other ACCOUNT_IDs when set on companies
  GROUP BY account_id, analysis_id
),
ranked AS (
  SELECT
    account_id,
    analysis_id,
    cnt,
    ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY cnt DESC) AS rn
  FROM agg
)
SELECT
  r.account_id,
  m.FULL_NAME AS erp_customer_name,
  r.analysis_id AS suggested_base_warehouse_id,
  loc.Description AS warehouse_name,
  r.cnt AS supporting_orders
FROM ranked r
LEFT JOIN dbo.ACCOUNT_MASTER m ON m.ACCOUNT_ID = r.account_id
LEFT JOIN dbo.Location loc ON loc.Location_id = r.analysis_id
WHERE r.rn = 1
ORDER BY r.account_id;
