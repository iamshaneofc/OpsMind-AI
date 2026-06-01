#!/usr/bin/env node
/**
 * Snapshot of SiscoERP: row counts per table + health checks for tables the app reads.
 * Uses .env SQL_SERVER_* (same as test-sql-server.mjs).
 * Run: node scripts/verify-erp-database-snapshot.mjs
 */

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
    if (trimmed && !trimmed.startsWith("#")) {
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
          value = value.slice(1, -1);
        process.env[key] = value;
      }
    }
  }
} catch (e) {
  console.error("Could not load .env:", e.message);
  process.exit(1);
}

const host = process.env.SQL_SERVER_HOST;
const port = Number(process.env.SQL_SERVER_PORT) || 1433;
const user = process.env.SQL_SERVER_USER;
const password = process.env.SQL_SERVER_PASSWORD;
const database = process.env.SQL_SERVER_DATABASE || "SiscoERP";

const encryptRaw = (process.env.SQL_SERVER_ENCRYPT ?? "").toLowerCase();
const trustRaw = (process.env.SQL_SERVER_TRUST_SERVER_CERTIFICATE ?? "").toLowerCase();
const encrypt = encryptRaw === "true" || encryptRaw === "1";
const trustServerCertificate = trustRaw === "true" || trustRaw === "1" || !encrypt;

if (!host || !user || !password) {
  console.error("Missing SQL_SERVER_HOST, SQL_SERVER_USER, or SQL_SERVER_PASSWORD");
  process.exit(1);
}

const sql = await import("mssql");
const pool = await sql.default.connect({
  server: host,
  port,
  user,
  password,
  database,
  options: {
    encrypt,
    trustServerCertificate,
    connectTimeout: 30000,
    requestTimeout: 120000,
  },
});

const APP_TABLES = [
  "sales_order_header",
  "sales_order_body",
  "Sales_Invoice_Header",
  "Sales_Invoice_Body",
  "ACCOUNT_MASTER",
  "Location",
  "CurrentStock",
  "Product_Master",
  "NARRATION",
];

try {
  const dbinfo = await pool.request().query(`
    SELECT DB_NAME() AS db_name,
           SUM(CASE WHEN type = 0 THEN size END) * 8.0 / 1024 AS data_mb
    FROM sys.database_files
  `);
  console.log("Database:", dbinfo.recordset[0].db_name, "| approx data size (MB):", Number(dbinfo.recordset[0].data_mb).toFixed(2));

  const counts = await pool.request().query(`
    SELECT s.name AS sch, t.name AS tbl, SUM(p.row_count) AS row_count
    FROM sys.tables t
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    INNER JOIN sys.dm_db_partition_stats p ON t.object_id = p.object_id
    WHERE p.index_id IN (0, 1) AND t.is_ms_shipped = 0
    GROUP BY s.name, t.name
    ORDER BY SUM(p.row_count) DESC
  `);

  const byKey = new Map();
  for (const r of counts.recordset) {
    byKey.set(`${r.sch}.${r.tbl}`, Number(r.row_count));
  }

  console.log("\n--- Tables used by this app (dbo) ---");
  for (const name of APP_TABLES) {
    const key = `dbo.${name}`;
    const n = byKey.get(key);
    if (n === undefined) {
      console.log(`  MISSING OR NON-USER TABLE: ${key}`);
    } else {
      const warn = n === 0 ? " (empty)" : "";
      console.log(`  ${key}: ${n.toLocaleString()} rows${warn}`);
    }
  }

  console.log("\n--- All user tables (row counts, top 40 by size) ---");
  const top = counts.recordset.slice(0, 40);
  for (const r of top) {
    console.log(`  ${r.sch}.${r.tbl}: ${Number(r.row_count).toLocaleString()}`);
  }
  if (counts.recordset.length > 40) {
    console.log(`  ... ${counts.recordset.length - 40} more tables`);
  }
  console.log(`\nTotal user tables: ${counts.recordset.length}`);

  console.log("\n--- Read test: dbo.sales_order_header (TOP 1) ---");
  try {
    const one = await pool.request().query(`SELECT TOP 1 sales_order_id, voucher_number FROM dbo.sales_order_header`);
    console.log("  OK — sample:", one.recordset[0] ?? "(no rows)");
  } catch (e) {
    console.log("  FAIL —", e.message);
    console.log("  Orders/inventory APIs will error until this is fixed in SQL Server.");
  }

  console.log("\n--- Read test: dbo.NARRATION (TOP 1) ---");
  const nar = await pool.request().query(`SELECT TOP 1 NARRATION_ID FROM dbo.NARRATION`);
  console.log("  OK — sample id:", nar.recordset[0]?.NARRATION_ID ?? "(no rows)");
} finally {
  await pool.close();
}

console.log("\nNote: This does not compare to an old AWS backup; it only shows current row counts and read checks.");
console.log("If counts look like your production volumes, the restore is likely complete.");
