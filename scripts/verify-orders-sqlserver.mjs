#!/usr/bin/env node
import { readFileSync } from "fs";
import { join } from "path";
import sql from "mssql";

function loadEnvFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
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
}

async function main() {
  loadEnvFile(join(process.cwd(), ".env"));

  const config = {
    server: process.env.SQL_SERVER_HOST || process.env.DB_SERVER,
    port: Number(process.env.SQL_SERVER_PORT || process.env.DB_PORT || 1433),
    user: process.env.SQL_SERVER_USER || process.env.DB_USER,
    password: process.env.SQL_SERVER_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.SQL_SERVER_DATABASE || process.env.DB_NAME || "master",
    options: {
      encrypt: String(process.env.SQL_SERVER_ENCRYPT || process.env.DB_ENCRYPT || "true").toLowerCase() === "true",
      trustServerCertificate:
        String(process.env.SQL_SERVER_TRUST_SERVER_CERTIFICATE || process.env.DB_TRUST_SERVER_CERTIFICATE || "true").toLowerCase() === "true",
      connectTimeout: 20000,
      requestTimeout: 30000,
    },
  };

  const pool = await sql.connect(config);
  console.log(`Connected to ${config.server}:${config.port}/${config.database}`);

  // 1) Confirm columns available in dbo.sales_order_header
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='sales_order_header'
    ORDER BY ORDINAL_POSITION
  `);
  console.log("\nColumns in dbo.sales_order_header:");
  console.table(cols.recordset);

  // 2) Total order count
  const total = await pool.request().query(`
    SELECT COUNT(1) AS total_orders
    FROM dbo.sales_order_header
  `);
  console.log("\nTotal orders:", total.recordset?.[0]?.total_orders ?? 0);

  // 3) What page currently shows (TOP 25 latest by voucher_date)
  const top25 = await pool.request().query(`
    SELECT TOP 25 sales_order_id, voucher_number, voucher_date
    FROM dbo.sales_order_header
    ORDER BY voucher_date DESC
  `);
  console.log("\nTop 25 shown by current super admin query:");
  console.table(top25.recordset);

  // 4) Verify if there is a real status-like field in header
  const statusColumns = cols.recordset.filter((c) => /status|state|confirm|approve|dispatch|close/i.test(c.COLUMN_NAME));
  console.log("\nStatus-like columns in header:");
  console.table(statusColumns);

  // 5) Sample invoice join to infer open/invoiced
  const invoiceLink = await pool.request().query(`
    SELECT TOP 25
      h.sales_order_id,
      h.voucher_number,
      h.voucher_date,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM dbo.sales_order_body sob
          JOIN dbo.Sales_Invoice_Body sib ON sib.sales_order_body_id = sob.sales_order_body_id
          WHERE sob.sales_order_id = h.sales_order_id
        ) THEN 'INVOICED'
        ELSE 'OPEN'
      END AS derived_status
    FROM dbo.sales_order_header h
    ORDER BY h.voucher_date DESC
  `);
  console.log("\nDerived status (OPEN/INVOICED) for latest 25:");
  console.table(invoiceLink.recordset);

  await pool.close();
}

main().catch((err) => {
  console.error("Verification failed:", err?.message || err);
  process.exit(1);
});

