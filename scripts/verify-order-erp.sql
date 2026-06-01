/*
  Verify ERP data for a sales order — matches app logic in:
  - src/sql-server/operations.ts (sqlServerGetOrderStatus, drilldown)
  - src/sql-server/order-lifecycle.ts (deriveOrderStatusFromERP)

  Edit ONE of:
    @voucher         = ERP sales order number (e.g. 11.105.260217.24)
    @sales_order_id_input = numeric id if you don't have the voucher

  Run in SSMS / Azure Data Studio against the same database as the app.

  --- Env (same as Next.js: src/sql-server/config.ts) ---
  USE_SQL_SERVER_DATA=true
  SQL_SERVER_HOST, SQL_SERVER_PORT (default 1433), SQL_SERVER_USER, SQL_SERVER_PASSWORD, SQL_SERVER_DATABASE
  Aliases: DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
  Optional: SQL_SERVER_ENCRYPT, SQL_SERVER_TRUST_SERVER_CERTIFICATE

  --- One-line sqlcmd (fill values from .env; Windows) ---
  sqlcmd -S "tcp:YOUR_HOST,1433" -d "YOUR_DATABASE" -U "YOUR_USER" -P "YOUR_PASSWORD" -C -i "scripts\verify-order-erp.sql"

  -C = trust server certificate (typical for dev; matches trustServerCertificate: true)
  Add -N if you use encrypted connections (SQL_SERVER_ENCRYPT=true).

  --- Or load .env automatically (repo root) ---
  powershell -ExecutionPolicy Bypass -File .\scripts\run-verify-order-sqlcmd.ps1
  powershell -File .\scripts\run-verify-order-sqlcmd.ps1 -Voucher "11.105.260217.24"
*/

DECLARE @voucher NVARCHAR(200) = N'11.105.260217.24';
DECLARE @sales_order_id_input INT = NULL; -- set to e.g. 830401 to resolve by id; leave NULL to use @voucher

DECLARE @oid INT = COALESCE(
  @sales_order_id_input,
  (
    SELECT TOP 1 h.sales_order_id
    FROM dbo.sales_order_header h
    WHERE LTRIM(RTRIM(CAST(h.voucher_number AS NVARCHAR(200)))) = LTRIM(RTRIM(CAST(@voucher AS NVARCHAR(200))))
  )
);

SELECT @oid AS resolved_sales_order_id,
       @voucher AS voucher_used;

IF @oid IS NULL
BEGIN
  RAISERROR('Order not found: set @voucher or @sales_order_id_input', 16, 1);
  RETURN;
END

-- ---------------------------------------------------------------------------
-- 1) Header (same columns as getOrderStatus SELECT)
-- ---------------------------------------------------------------------------
SELECT TOP 1
  h.sales_order_id,
  h.voucher_number,
  h.voucher_date,
  h.account_id,
  h.Total_Order_Amount,
  h.analysis_id,
  h.shipping_type_ID,
  h.customer_po_number
FROM dbo.sales_order_header h
WHERE h.sales_order_id = @oid;

-- ---------------------------------------------------------------------------
-- 2) Derived status (deriveOrderStatusFromERP: TOP 1 invoice by voucher_date DESC)
-- ---------------------------------------------------------------------------
SELECT TOP 1
  h.sales_invoice_header_id,
  h.voucher_number AS invoice_voucher,
  h.voucher_date,
  h.confirmed,
  h.DATE_OF_REMOVAL,
  CASE
    WHEN h.DATE_OF_REMOVAL IS NOT NULL THEN N'DELIVERED'
    WHEN h.confirmed = 1 THEN N'DISPATCH_READY'
    ELSE N'IN_PREPARATION'
  END AS app_derived_status
FROM dbo.Sales_Invoice_Header h
WHERE EXISTS (
  SELECT 1
  FROM dbo.Sales_Invoice_Body b
  JOIN dbo.sales_order_body sob ON sob.sales_order_body_id = b.sales_order_body_id
  WHERE b.sales_invoice_header_id = h.sales_invoice_header_id
    AND sob.sales_order_id = @oid
)
ORDER BY h.voucher_date DESC;

-- No row here ⇒ app returns PENDING for that order.

-- ---------------------------------------------------------------------------
-- 3) Linked invoices (getOrderStatus uses TOP 5, same ORDER BY)
-- ---------------------------------------------------------------------------
SELECT TOP 5
  h.voucher_number,
  h.voucher_date,
  h.INVOICE_AMOUNT,
  h.confirmed,
  h.DATE_OF_REMOVAL
FROM dbo.Sales_Invoice_Header h
WHERE EXISTS (
  SELECT 1
  FROM dbo.Sales_Invoice_Body b
  JOIN dbo.sales_order_body sob ON sob.sales_order_body_id = b.sales_order_body_id
  WHERE b.sales_invoice_header_id = h.sales_invoice_header_id
    AND sob.sales_order_id = @oid
)
ORDER BY h.voucher_date DESC;

-- ---------------------------------------------------------------------------
-- 4) Line items (sales_order_body — TOP 100 in app)
-- ---------------------------------------------------------------------------
SELECT TOP 100
  b.sales_order_body_id,
  b.printing_name,
  b.order_qty,
  b.net_order_qty,
  b.Item_Total_Amount
FROM dbo.sales_order_body b
WHERE b.sales_order_id = @oid
ORDER BY b.sales_order_body_id ASC;

-- ---------------------------------------------------------------------------
-- 5) Counts
-- ---------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM dbo.sales_order_body b WHERE b.sales_order_id = @oid) AS sales_order_line_count,
  (
    SELECT COUNT(*)
    FROM dbo.Sales_Invoice_Header h
    WHERE EXISTS (
      SELECT 1
      FROM dbo.Sales_Invoice_Body b
      JOIN dbo.sales_order_body sob ON sob.sales_order_body_id = b.sales_order_body_id
      WHERE b.sales_invoice_header_id = h.sales_invoice_header_id
        AND sob.sales_order_id = @oid
    )
  ) AS linked_invoice_count;
