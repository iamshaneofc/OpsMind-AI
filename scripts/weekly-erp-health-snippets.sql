/*
  Weekly operational health checks against SiscoERP (run manually in SSMS / ADS).
  Adjust database/schema if needed.
*/

/* 1) Status spread (canonical derive shape — aligns with deriveOrderLifecycleFromERP semantics). */
-- See also: check_status.sql at repo root

/* 2) Dispatch proxies: removals vs confirmed vs transport-only readiness */
SELECT
  COUNT(*) AS invoices_total,
  SUM(CASE WHEN DATE_OF_REMOVAL IS NOT NULL THEN 1 ELSE 0 END) AS with_removal,
  SUM(CASE WHEN DATE_OF_REMOVAL IS NULL AND confirmed = 1 THEN 1 ELSE 0 END) AS confirmed_open,
  SUM(
    CASE
      WHEN DATE_OF_REMOVAL IS NULL
           AND ISNULL(confirmed, 0) = 0
           AND (
             NULLIF(LTRIM(RTRIM(ISNULL(CAST(TRANSPORT_NAME AS NVARCHAR(400)), N''))), N'') IS NOT NULL
             OR NULLIF(LTRIM(RTRIM(ISNULL(CAST(VEHICLE_NUMBER AS NVARCHAR(200)), N''))), N'') IS NOT NULL
           )
        THEN 1
      ELSE 0
    END
  ) AS logistics_proxy_candidates
FROM dbo.Sales_Invoice_Header;

/* 3) Factory queue aging (sales_order_body) */
SELECT
  SUM(CASE WHEN DATEDIFF(day, CAST(h.voucher_date AS DATE), CAST(GETDATE() AS DATE)) <= 7 THEN 1 ELSE 0 END) AS factory_wait_under_8d,
  SUM(CASE WHEN DATEDIFF(day, CAST(h.voucher_date AS DATE), CAST(GETDATE() AS DATE)) BETWEEN 8 AND 14 THEN 1 ELSE 0 END) AS factory_wait_8_14d,
  SUM(CASE WHEN DATEDIFF(day, CAST(h.voucher_date AS DATE), CAST(GETDATE() AS DATE)) > 14 THEN 1 ELSE 0 END) AS factory_wait_over_14d
FROM dbo.sales_order_body b
JOIN dbo.sales_order_header h ON h.sales_order_id = b.sales_order_id
WHERE ISNULL(request_initialised, 0) = 1 AND ISNULL(request_processed, 0) = 0;

/* 4) Verify central depot row (default BhiwandiDepot Location_id = 6) */
SELECT Location_id, Description, Address
FROM dbo.Location
WHERE Location_id = 6 OR Description LIKE '%Bhiwandi%';
