-- 1. Create 10 'DISPATCH_READY' by stripping the DATE_OF_REMOVAL from 10 recent DELIVERED invoices
UPDATE TOP (10) dbo.Sales_Invoice_Header
SET DATE_OF_REMOVAL = NULL
WHERE DATE_OF_REMOVAL IS NOT NULL AND confirmed = 1;

-- 2. Create 10 'IN_PREPARATION' by stripping both DATE_OF_REMOVAL and confirmed from 10 other DELIVERED invoices
UPDATE TOP (10) dbo.Sales_Invoice_Header
SET DATE_OF_REMOVAL = NULL, confirmed = 0
WHERE DATE_OF_REMOVAL IS NOT NULL AND confirmed = 1;

-- 3. Create 10 'ALLOCATED_CENTRAL_WAREHOUSE' by setting Order_Forwarded = 1 on 10 recent ORDER_RECEIVED lines
UPDATE dbo.sales_order_body
SET Order_Forwarded = 1
WHERE sales_order_id IN (
    SELECT TOP 10 h.sales_order_id 
    FROM dbo.sales_order_header h
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.Sales_Invoice_Body sib 
        JOIN dbo.sales_order_body sob ON sob.sales_order_body_id = sib.sales_order_body_id
        WHERE sob.sales_order_id = h.sales_order_id
    )
);
