/* Lane A schema verification
   Confirms tables/columns used by:
   - src/sql-server/order-lifecycle.ts (voucher_date, shipping_type_ID, status mapping inputs)
   - src/sql-server/operations.ts (sqlServerGetOrderStatus / sqlServerGetOrderDrilldown)
   - src/sql-server/operations.ts (invoice join, line-items fields, warehouse mapping via dbo.Location)
*/

SET NOCOUNT ON;

DECLARE @schema sysname = N'dbo';

-- 1) Tables that must exist
;WITH required_tables AS (
  SELECT N'sales_order_header' AS table_name UNION ALL
  SELECT N'sales_order_body' UNION ALL
  SELECT N'Sales_Invoice_Header' UNION ALL
  SELECT N'Sales_Invoice_Body' UNION ALL
  SELECT N'ACCOUNT_MASTER' UNION ALL
  SELECT N'Location'
)
SELECT
  rt.table_name,
  CASE WHEN t.object_id IS NULL THEN 0 ELSE 1 END AS table_exists
FROM required_tables rt
LEFT JOIN sys.tables t
  ON t.name = rt.table_name
  AND SCHEMA_NAME(t.schema_id) = @schema
ORDER BY rt.table_name;

-- 2) Columns that must exist
;WITH required_cols AS (
  SELECT N'sales_order_header' AS table_name, N'sales_order_id' AS column_name UNION ALL
  SELECT N'sales_order_header', N'voucher_number' UNION ALL
  SELECT N'sales_order_header', N'voucher_date' UNION ALL
  SELECT N'sales_order_header', N'account_id' UNION ALL
  SELECT N'sales_order_header', N'Total_Order_Amount' UNION ALL
  SELECT N'sales_order_header', N'analysis_id' UNION ALL
  SELECT N'sales_order_header', N'shipping_type_ID' UNION ALL
  SELECT N'sales_order_header', N'customer_po_number' UNION ALL

  SELECT N'sales_order_body', N'sales_order_body_id' UNION ALL
  SELECT N'sales_order_body', N'sales_order_id' UNION ALL
  SELECT N'sales_order_body', N'packing_id' UNION ALL
  SELECT N'sales_order_body', N'order_qty' UNION ALL
  SELECT N'sales_order_body', N'net_order_qty' UNION ALL
  SELECT N'sales_order_body', N'Item_Total_Amount' UNION ALL
  SELECT N'sales_order_body', N'printing_name' UNION ALL
  SELECT N'sales_order_body', N'Despatch_Location_ID' UNION ALL

  SELECT N'Sales_Invoice_Header', N'sales_invoice_header_id' UNION ALL
  SELECT N'Sales_Invoice_Header', N'voucher_number' UNION ALL
  SELECT N'Sales_Invoice_Header', N'voucher_date' UNION ALL
  SELECT N'Sales_Invoice_Header', N'confirmed' UNION ALL
  SELECT N'Sales_Invoice_Header', N'DATE_OF_REMOVAL' UNION ALL
  SELECT N'Sales_Invoice_Header', N'INVOICE_AMOUNT' UNION ALL

  SELECT N'Sales_Invoice_Body', N'sales_invoice_header_id' UNION ALL
  SELECT N'Sales_Invoice_Body', N'sales_order_body_id' UNION ALL

  SELECT N'ACCOUNT_MASTER', N'ACCOUNT_ID' UNION ALL
  SELECT N'ACCOUNT_MASTER', N'FULL_NAME' UNION ALL

  SELECT N'Location', N'Location_id' UNION ALL
  SELECT N'Location', N'Description'
)
SELECT
  rc.table_name,
  rc.column_name,
  CASE WHEN c.column_name IS NULL THEN 0 ELSE 1 END AS column_exists
FROM required_cols rc
LEFT JOIN INFORMATION_SCHEMA.COLUMNS c
  ON c.TABLE_SCHEMA = @schema
  AND c.TABLE_NAME = rc.table_name
  AND c.COLUMN_NAME = rc.column_name
ORDER BY rc.table_name, rc.column_name;

