/* Lightweight schema sanity for Lane A (fast output).
   Confirms required tables and key columns exist, using sys.tables/sys.columns. */
SET NOCOUNT ON;

DECLARE @schema sysname = N'dbo';

SELECT 'sales_order_header' AS table_name,
       SUM(CASE WHEN c.name = 'voucher_number' THEN 1 ELSE 0 END) AS has_voucher_number,
       SUM(CASE WHEN c.name = 'voucher_date' THEN 1 ELSE 0 END) AS has_voucher_date,
       SUM(CASE WHEN c.name = 'account_id' THEN 1 ELSE 0 END) AS has_account_id,
       SUM(CASE WHEN c.name = 'analysis_id' THEN 1 ELSE 0 END) AS has_analysis_id,
       SUM(CASE WHEN c.name = 'shipping_type_ID' THEN 1 ELSE 0 END) AS has_shipping_type_id,
       SUM(CASE WHEN c.name = 'customer_po_number' THEN 1 ELSE 0 END) AS has_customer_po_number
FROM sys.tables t
LEFT JOIN sys.columns c
  ON c.object_id = t.object_id
WHERE t.schema_id = SCHEMA_ID(@schema)
  AND t.name = 'sales_order_header'
GROUP BY t.name;

SELECT 'sales_order_body' AS table_name,
       SUM(CASE WHEN c.name = 'printing_name' THEN 1 ELSE 0 END) AS has_printing_name,
       SUM(CASE WHEN c.name = 'net_order_qty' THEN 1 ELSE 0 END) AS has_net_order_qty,
       SUM(CASE WHEN c.name = 'order_qty' THEN 1 ELSE 0 END) AS has_order_qty,
       SUM(CASE WHEN c.name = 'Item_Total_Amount' THEN 1 ELSE 0 END) AS has_item_total_amount,
       SUM(CASE WHEN c.name = 'packing_id' THEN 1 ELSE 0 END) AS has_packing_id
FROM sys.tables t
LEFT JOIN sys.columns c
  ON c.object_id = t.object_id
WHERE t.schema_id = SCHEMA_ID(@schema)
  AND t.name = 'sales_order_body'
GROUP BY t.name;

SELECT 'Sales_Invoice_Header' AS table_name,
       SUM(CASE WHEN c.name = 'voucher_number' THEN 1 ELSE 0 END) AS has_voucher_number,
       SUM(CASE WHEN c.name = 'voucher_date' THEN 1 ELSE 0 END) AS has_voucher_date,
       SUM(CASE WHEN c.name = 'confirmed' THEN 1 ELSE 0 END) AS has_confirmed,
       SUM(CASE WHEN c.name = 'DATE_OF_REMOVAL' THEN 1 ELSE 0 END) AS has_date_of_removal,
       SUM(CASE WHEN c.name = 'INVOICE_AMOUNT' THEN 1 ELSE 0 END) AS has_invoice_amount
FROM sys.tables t
LEFT JOIN sys.columns c
  ON c.object_id = t.object_id
WHERE t.schema_id = SCHEMA_ID(@schema)
  AND t.name = 'Sales_Invoice_Header'
GROUP BY t.name;

SELECT 'Sales_Invoice_Body' AS table_name,
       SUM(CASE WHEN c.name = 'sales_invoice_header_id' THEN 1 ELSE 0 END) AS has_sales_invoice_header_id,
       SUM(CASE WHEN c.name = 'sales_order_body_id' THEN 1 ELSE 0 END) AS has_sales_order_body_id
FROM sys.tables t
LEFT JOIN sys.columns c
  ON c.object_id = t.object_id
WHERE t.schema_id = SCHEMA_ID(@schema)
  AND t.name = 'Sales_Invoice_Body'
GROUP BY t.name;

SELECT 'ACCOUNT_MASTER' AS table_name,
       SUM(CASE WHEN c.name = 'ACCOUNT_ID' THEN 1 ELSE 0 END) AS has_account_id,
       SUM(CASE WHEN c.name = 'FULL_NAME' THEN 1 ELSE 0 END) AS has_full_name
FROM sys.tables t
LEFT JOIN sys.columns c
  ON c.object_id = t.object_id
WHERE t.schema_id = SCHEMA_ID(@schema)
  AND t.name = 'ACCOUNT_MASTER'
GROUP BY t.name;

SELECT 'Location' AS table_name,
       SUM(CASE WHEN c.name = 'Location_id' THEN 1 ELSE 0 END) AS has_location_id,
       SUM(CASE WHEN c.name = 'Description' THEN 1 ELSE 0 END) AS has_description
FROM sys.tables t
LEFT JOIN sys.columns c
  ON c.object_id = t.object_id
WHERE t.schema_id = SCHEMA_ID(@schema)
  AND t.name = 'Location'
GROUP BY t.name;

