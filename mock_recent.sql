-- We must pinpoint the EXACT IDs from the most recent 100 records so they appear in the UI's 100-order window!
WITH RecentDelivered AS (
    SELECT TOP 20 h.sales_invoice_header_id
    FROM dbo.Sales_Invoice_Header h
    JOIN dbo.Sales_Invoice_Body ib ON ib.sales_invoice_header_id = h.sales_invoice_header_id
    JOIN dbo.sales_order_body sob ON sob.sales_order_body_id = ib.sales_order_body_id
    JOIN dbo.sales_order_header soh ON soh.sales_order_id = sob.sales_order_id
    WHERE h.DATE_OF_REMOVAL IS NOT NULL AND h.confirmed = 1
    ORDER BY soh.voucher_date DESC
)
-- Set first 10 to DISPATCH_READY
UPDATE dbo.Sales_Invoice_Header
SET DATE_OF_REMOVAL = NULL
WHERE sales_invoice_header_id IN (
    SELECT TOP 10 sales_invoice_header_id FROM RecentDelivered ORDER BY sales_invoice_header_id DESC
);

WITH RecentDelivered2 AS (
    SELECT TOP 20 h.sales_invoice_header_id
    FROM dbo.Sales_Invoice_Header h
    JOIN dbo.Sales_Invoice_Body ib ON ib.sales_invoice_header_id = h.sales_invoice_header_id
    JOIN dbo.sales_order_body sob ON sob.sales_order_body_id = ib.sales_order_body_id
    JOIN dbo.sales_order_header soh ON soh.sales_order_id = sob.sales_order_id
    WHERE h.DATE_OF_REMOVAL IS NOT NULL AND h.confirmed = 1
    ORDER BY soh.voucher_date DESC
)
-- Set another 10 to IN_PREPARATION
UPDATE dbo.Sales_Invoice_Header
SET DATE_OF_REMOVAL = NULL, confirmed = 0
WHERE sales_invoice_header_id IN (
    SELECT TOP 10 sales_invoice_header_id FROM RecentDelivered2 ORDER BY sales_invoice_header_id ASC
);

-- And for ALLOCATED_CENTRAL_WAREHOUSE
WITH RecentReceived AS (
    SELECT TOP 10 sob.sales_order_body_id
    FROM dbo.sales_order_body sob
    JOIN dbo.sales_order_header soh ON soh.sales_order_id = sob.sales_order_id
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.Sales_Invoice_Body sib WHERE sib.sales_order_body_id = sob.sales_order_body_id
    )
    ORDER BY soh.voucher_date DESC
)
UPDATE dbo.sales_order_body
SET Order_Forwarded = 1
WHERE sales_order_body_id IN (SELECT sales_order_body_id FROM RecentReceived);
