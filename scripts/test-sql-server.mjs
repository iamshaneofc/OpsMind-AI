#!/usr/bin/env node
/**
 * Test SQL Server connection using .env variables.
 * Run from project root: node scripts/test-sql-server.mjs
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Load .env into process.env
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
/** ERP catalog name: `SiscoERP` (connection string / SQL_SERVER_DATABASE). */
const database = process.env.SQL_SERVER_DATABASE || "SiscoERP";

if (!host || !user || !password) {
  console.error("Missing SQL_SERVER_HOST, SQL_SERVER_USER, or SQL_SERVER_PASSWORD in .env");
  process.exit(1);
}

console.log("Connecting to SQL Server...");
console.log("  Host:", host);
console.log("  Port:", port);
console.log("  User:", user);
console.log("  Database:", database);
console.log("");

const sql = await import("mssql");

const encryptRaw = (process.env.SQL_SERVER_ENCRYPT ?? "").toLowerCase();
const trustRaw = (process.env.SQL_SERVER_TRUST_SERVER_CERTIFICATE ?? "").toLowerCase();
const encrypt = encryptRaw === "true" || encryptRaw === "1";
const trustServerCertificate = trustRaw === "true" || trustRaw === "1" || !encrypt;

const config = {
  server: host,
  port,
  user,
  password,
  database,
  options: {
    encrypt,
    trustServerCertificate,
    connectTimeout: 30000,
    requestTimeout: 15000,
  },
};

try {
  const pool = await sql.default.connect(config);
  const result = await pool.request().query("SELECT 1 AS test, @@VERSION AS version");
  console.log("✅ Connection successful!");
  console.log("  Test query result:", result.recordset[0].test);
  console.log("  SQL Server version:", (result.recordset[0].version || "").split("\n")[0]);
  console.log("  Options: encrypt=" + encrypt + ", trustServerCertificate=" + trustServerCertificate);

  try {
    const db = await pool.request().query("SELECT DB_NAME() AS current_database, SUSER_SNAME() AS login_name");
    const currentDb = db.recordset[0].current_database;
    console.log("\n📦 Session:");
    console.log("  Current database:", currentDb);
    console.log("  Login:", db.recordset[0].login_name);
    if (String(currentDb) !== String(database)) {
      console.log("  ⚠️  Expected SQL_SERVER_DATABASE=" + database + " but context is " + currentDb);
    }

    // Debug: all tables (no three-part names — connection is already on the ERP database).
    const allTables = await pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);
    console.log("\n📋 INFORMATION_SCHEMA.TABLES (TABLE_NAME): " + allTables.recordset.length + " row(s)");
    const show = allTables.recordset.slice(0, 40);
    for (const row of show) {
      console.log("  ", row.TABLE_NAME);
    }
    if (allTables.recordset.length > 40) {
      console.log("  ... (" + (allTables.recordset.length - 40) + " more)");
    }

    const narrCols = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE COLUMN_NAME LIKE N'%NARR%'
      ORDER BY TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME
    `);
    console.log("\n🔎 Columns matching %NARR% (use NARRATION; not NARRAATION / NARRRATION):");
    if (narrCols.recordset.length === 0) {
      console.log("  (none)");
    } else {
      for (const row of narrCols.recordset) {
        console.log("  ", row.TABLE_SCHEMA + "." + row.TABLE_NAME + "." + row.COLUMN_NAME);
      }
    }

    const hasSoHeader = await pool.request().query(`
      SELECT CAST(OBJECT_ID(N'dbo.sales_order_header', N'U') AS INT) AS oid
    `);
    if (!hasSoHeader.recordset[0]?.oid) {
      console.log("\n⚠️  dbo.sales_order_header not found — check restore / name.");
    } else {
      try {
        const soh = await pool.request().query(`
          SELECT TOP 3 sales_order_id, voucher_number, voucher_date
          FROM dbo.sales_order_header
          ORDER BY sales_order_id DESC
        `);
        if (soh.recordset.length > 0) {
          console.log("\n🧾 Sample rows from dbo.sales_order_header (latest 3):");
          console.table(soh.recordset);
        } else {
          console.log("\n⚠️  dbo.sales_order_header exists but has no rows.");
        }
      } catch (soErr) {
        console.error("\n⚠️  dbo.sales_order_header sample failed:", soErr.message);
        console.error(
          "   If the error mentions another catalog, a computed column/default may still reference the old database — fix it in SQL Server to use dbo.NARRATION in SiscoERP only.",
        );
      }
    }

    const nar = await pool.request().query(`SELECT TOP 5 * FROM dbo.NARRATION`);
    console.log("\n📄 SELECT TOP 5 * FROM dbo.NARRATION:");
    console.table(nar.recordset);
  } catch (qErr) {
    console.error("\n⚠️  Connected but a follow-up query failed:", qErr.message);
  }

  await pool.close();
  process.exit(0);
} catch (err) {
  console.error("❌ Connection failed:", err.message);
  if (err.code) console.error("  Code:", err.code);
  console.error(
    "\nHints: open TCP 1433 to this machine; SQL Server TCP enabled; if ESOCKET with encrypt=true, try SQL_SERVER_ENCRYPT=false in .env for testing."
  );
  process.exit(1);
}
