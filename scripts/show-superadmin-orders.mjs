#!/usr/bin/env node
/**
 * Show latest 50 order numbers for superadmin (from SQL Server).
 * Run: node scripts/show-superadmin-orders.mjs
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import sql from "mssql";

function loadEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
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

loadEnv();

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
const result = await pool.request().query(`
  SELECT TOP 50 sales_order_id, voucher_number AS order_number, voucher_date AS created_at, account_id
  FROM dbo.sales_order_header
  ORDER BY voucher_date DESC
`);
console.table(result.recordset ?? []);
await pool.close();
