import { resolveCentralWarehouseLocationId } from "@/lib/erp-central-warehouse";

/**
 * SQL list heuristic aligned with `deriveOrderLifecycleFromERP` (invoice + forward/factory/logistics/Gap H).
 * Use with `sales_order_header` aliased as `h` (same contract as chat SQL tools).
 */
export function buildErpOrderStatusCaseSql(centralLocationId: number): string {
  const c = Number.isFinite(centralLocationId) && centralLocationId > 0 ? Math.trunc(centralLocationId) : 6;
  return `CASE
  WHEN EXISTS (
    SELECT 1 FROM dbo.sales_order_body sob
    WHERE sob.sales_order_id = h.sales_order_id
      AND ISNULL(CAST(sob.request_initialised AS int), 0) = 1
      AND ISNULL(CAST(sob.request_processed AS int), 0) = 0
  ) THEN 'AWAITING_FACTORY'
  WHEN EXISTS (
    SELECT 1
    FROM dbo.Sales_Invoice_Header ih
    WHERE ih.DATE_OF_REMOVAL IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM dbo.Sales_Invoice_Body ib
        JOIN dbo.sales_order_body sob ON sob.sales_order_body_id = ib.sales_order_body_id
        WHERE ib.sales_invoice_header_id = ih.sales_invoice_header_id
          AND sob.sales_order_id = h.sales_order_id
      )
  ) THEN 'DELIVERED'
  WHEN EXISTS (
    SELECT 1
    FROM dbo.Sales_Invoice_Header ih
    WHERE ih.confirmed = 1
      AND EXISTS (
        SELECT 1
        FROM dbo.Sales_Invoice_Body ib
        JOIN dbo.sales_order_body sob ON sob.sales_order_body_id = ib.sales_order_body_id
        WHERE ib.sales_invoice_header_id = ih.sales_invoice_header_id
          AND sob.sales_order_id = h.sales_order_id
      )
  ) THEN 'DISPATCH_READY'
  WHEN EXISTS (
    SELECT 1
    FROM dbo.Sales_Invoice_Header ih
    WHERE (
        NULLIF(LTRIM(RTRIM(ISNULL(CAST(ih.TRANSPORT_NAME AS NVARCHAR(400)), N''))), N'') IS NOT NULL
        OR NULLIF(LTRIM(RTRIM(ISNULL(CAST(ih.VEHICLE_NUMBER AS NVARCHAR(200)), N''))), N'') IS NOT NULL
      )
      AND EXISTS (
        SELECT 1
        FROM dbo.Sales_Invoice_Body ib
        JOIN dbo.sales_order_body sob ON sob.sales_order_body_id = ib.sales_order_body_id
        WHERE ib.sales_invoice_header_id = ih.sales_invoice_header_id
          AND sob.sales_order_id = h.sales_order_id
      )
  ) THEN 'DISPATCH_READY'
  WHEN EXISTS (
    SELECT 1 FROM dbo.sales_order_body sob
    WHERE sob.sales_order_id = h.sales_order_id
      AND (
        CAST(sob.Order_Forwarded AS int) = 1
        OR sob.Despatch_Location_ID = ${c}
      )
  ) THEN 'ALLOCATED_CENTRAL_WAREHOUSE'
  WHEN EXISTS (
    SELECT 1 FROM dbo.sales_order_body sob
    WHERE sob.sales_order_id = h.sales_order_id
      AND sob.Despatch_Location_ID IS NOT NULL
  ) THEN 'ALLOCATED_LOCAL_WAREHOUSE'
  WHEN EXISTS (
    SELECT 1
    FROM dbo.Sales_Invoice_Header ih
    WHERE EXISTS (
      SELECT 1
      FROM dbo.Sales_Invoice_Body ib
      JOIN dbo.sales_order_body sob ON sob.sales_order_body_id = ib.sales_order_body_id
      WHERE ib.sales_invoice_header_id = ih.sales_invoice_header_id
        AND sob.sales_order_id = h.sales_order_id
    )
  ) THEN 'IN_PREPARATION'
  ELSE 'ORDER_RECEIVED'
END`;
}

/** Cached CASE for `h` alias; same central id resolution as other ERP SQL tools. */
export const ERP_ORDER_STATUS_CASE_SQL = buildErpOrderStatusCaseSql(resolveCentralWarehouseLocationId());
