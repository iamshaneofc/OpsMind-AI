#!/usr/bin/env node
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

try {
  const envPath = join(root, ".env");
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
} catch (e) {
  console.error("Could not load .env:", e.message);
  process.exit(1);
}

const sql = await import("mssql");

const pool = await sql.default.connect({
  server: process.env.SQL_SERVER_HOST,
  port: Number(process.env.SQL_SERVER_PORT) || 1433,
  user: process.env.SQL_SERVER_USER,
  password: process.env.SQL_SERVER_PASSWORD,
  database: process.env.SQL_SERVER_DATABASE || "SiscoERP",
  options: {
    encrypt: String(process.env.SQL_SERVER_ENCRYPT || "").toLowerCase() === "true",
    trustServerCertificate: true,
    connectTimeout: 30000,
    requestTimeout: 120000,
  },
});

try {
  const columns = await pool.request().query(`
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME IN ('sales_order_header', 'sales_order_body', 'Sales_Invoice_Header', 'Sales_Invoice_Body', 'Location')
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `);

  const requiredColumns = [
    "is_local_allocated",
    "local_allocated_at",
    "local_allocated_by",
    "allocated_location_id",
    "next_update_by",
    "next_update_owner_role",
    "next_update_reason",
    "eta_band_code",
    "eta_start_date",
    "eta_end_date",
    "dispatch_status",
    "dispatched_at",
    "awb_or_consignment_no",
    "factory_dependency_type",
    "factory_request_id",
    "warehouse_role",
    "servicing_warehouse_id",
    "allocation_source_warehouse_id",
  ];

  const available = new Set(columns.recordset.map((r) => String(r.COLUMN_NAME).toLowerCase()));
  const missing = requiredColumns.filter((c) => !available.has(c.toLowerCase()));

  const locations = await pool.request().query(`
    SELECT TOP 20 Location_id, Description, Address
    FROM dbo.Location
    ORDER BY Location_id
  `);

  const bhiwandi = await pool.request().query(`
    SELECT TOP 20 Location_id, Description
    FROM dbo.Location
    WHERE Description LIKE '%Bhiwandi%'
    ORDER BY Location_id
  `);

  const statusCounts = await pool.request().query(`
    WITH OrderSignals AS (
      SELECT TOP 50000
        h.sales_order_id,
        inv.DATE_OF_REMOVAL,
        inv.confirmed,
        CASE WHEN inv.has_invoice = 1 THEN 1 ELSE 0 END AS has_invoice,
        ISNULL(b.Order_Forwarded, 0) AS Order_Forwarded,
        ISNULL(b.request_initialised, 0) AS request_initialised,
        ISNULL(b.request_processed, 0) AS request_processed
      FROM dbo.sales_order_header h
      OUTER APPLY (
        SELECT TOP 1 sh.DATE_OF_REMOVAL, sh.confirmed, 1 AS has_invoice
        FROM dbo.Sales_Invoice_Header sh
        JOIN dbo.Sales_Invoice_Body sib ON sib.sales_invoice_header_id = sh.sales_invoice_header_id
        JOIN dbo.sales_order_body sob ON sob.sales_order_body_id = sib.sales_order_body_id
        WHERE sob.sales_order_id = h.sales_order_id
        ORDER BY sh.voucher_date DESC, sh.sales_invoice_header_id DESC
      ) inv
      OUTER APPLY (
        SELECT
          CAST(MAX(CAST(Order_Forwarded AS int)) AS bit) AS Order_Forwarded,
          CAST(MAX(CAST(request_initialised AS int)) AS bit) AS request_initialised,
          CAST(MAX(CAST(request_processed AS int)) AS bit) AS request_processed
        FROM dbo.sales_order_body
        WHERE sales_order_id = h.sales_order_id
      ) b
      ORDER BY h.voucher_date DESC
    ),
    DerivedStatus AS (
      SELECT
        CASE
          WHEN has_invoice = 0 THEN
            CASE
              WHEN Order_Forwarded = 1 THEN 'ALLOCATED_CENTRAL_WAREHOUSE'
              WHEN request_initialised = 1 AND request_processed = 0 THEN 'AWAITING_FACTORY'
              ELSE 'ORDER_RECEIVED'
            END
          ELSE
            CASE
              WHEN DATE_OF_REMOVAL IS NOT NULL THEN 'DELIVERED'
              WHEN confirmed = 1 THEN 'DISPATCH_READY'
              WHEN Order_Forwarded = 1 THEN 'ALLOCATED_CENTRAL_WAREHOUSE'
              WHEN request_initialised = 1 AND request_processed = 0 THEN 'AWAITING_FACTORY'
              ELSE 'IN_PREPARATION'
            END
        END AS status
      FROM OrderSignals
    )
    SELECT status, COUNT(*) AS status_count
    FROM DerivedStatus
    GROUP BY status
    ORDER BY status_count DESC
  `);

  const dispatchProxy = await pool.request().query(`
    SELECT COUNT(*) AS confirmed_with_no_removal
    FROM dbo.Sales_Invoice_Header
    WHERE confirmed = 1 AND DATE_OF_REMOVAL IS NULL
  `);

  const awaitingProxy = await pool.request().query(`
    SELECT COUNT(DISTINCT sales_order_id) AS awaiting_factory_orders
    FROM dbo.sales_order_body
    WHERE ISNULL(request_initialised, 0) = 1
      AND ISNULL(request_processed, 0) = 0
  `);

  console.log("MISSING_COLUMNS", missing);
  console.log("LOCATIONS", locations.recordset);
  console.log("BHIWANDI_ROWS", bhiwandi.recordset);
  console.log("STATUS_COUNTS_TOP50K", statusCounts.recordset);
  console.log("DISPATCH_PROXY", dispatchProxy.recordset[0]);
  console.log("AWAITING_FACTORY_PROXY", awaitingProxy.recordset[0]);
} finally {
  await pool.close();
}
