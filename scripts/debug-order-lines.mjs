#!/usr/bin/env node
/**
 * Debug one ERP sales order: header row(s) + sales_order_body lines.
 * Usage: node scripts/debug-order-lines.mjs 6.105.260219.2
 */
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
  const voucher = (process.argv[2] || "").trim();
  if (!voucher) {
    console.error("Usage: node scripts/debug-order-lines.mjs <voucher_number>");
    process.exit(1);
  }

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
  console.log("\n--- Headers (exact match) ---");
  const exact = await pool.request().input("v", sql.NVarChar(200), voucher).query(`
    SELECT sales_order_id, voucher_number, voucher_date, account_id, Total_Order_Amount
    FROM dbo.sales_order_header
    WHERE voucher_number = @v
  `);
  console.table(exact.recordset);

  console.log("\n--- Headers (trim match, like app) ---");
  const trim = await pool.request().input("v", sql.NVarChar(200), voucher).query(`
    SELECT sales_order_id, voucher_number, voucher_date, account_id, Total_Order_Amount
    FROM dbo.sales_order_header
    WHERE LTRIM(RTRIM(CAST(voucher_number AS NVARCHAR(200)))) = LTRIM(RTRIM(CAST(@v AS NVARCHAR(200))))
  `);
  console.table(trim.recordset);

  const ids = [...new Set((trim.recordset || []).map((r) => r.sales_order_id))];
  if (!ids.length) {
    console.log("\nNo header rows for this voucher (check spelling / DB).");
    await pool.close();
    return;
  }

  for (const id of ids) {
    console.log(`\n--- sales_order_body WHERE sales_order_id = ${id} ---`);
    const body = await pool.request().input("id", sql.Int, id).query(`
      SELECT TOP 100 sales_order_body_id, sales_order_id, packing_id, order_qty, net_order_qty,
             Item_Total_Amount, printing_name, Despatch_Location_ID
      FROM dbo.sales_order_body
      WHERE sales_order_id = @id
      ORDER BY sales_order_body_id ASC
    `);
    console.table(body.recordset);
    console.log(`Row count: ${body.recordset?.length ?? 0}`);
  }

  console.log("\n--- dbo.sales_order_body columns (schema) ---");
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'sales_order_body'
    ORDER BY ORDINAL_POSITION
  `);
  console.table(cols.recordset);

  await pool.close();
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
