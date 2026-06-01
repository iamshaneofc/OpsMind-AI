#!/usr/bin/env node
/**
 * List ERP customer accounts (distributors) from SQL Server: account_id + name + order counts.
 * Helps map public.companies.erp_account_id in Supabase.
 *
 * Usage:
 *   node scripts/list-erp-distributor-accounts.mjs
 *   node scripts/list-erp-distributor-accounts.mjs viraj
 *   node scripts/list-erp-distributor-accounts.mjs krisshna
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

async function main() {
  loadEnv();
  const search = (process.argv[2] || "").trim();

  const config = {
    server: process.env.SQL_SERVER_HOST || process.env.DB_SERVER,
    port: Number(process.env.SQL_SERVER_PORT || process.env.DB_PORT || 1433),
    user: process.env.SQL_SERVER_USER || process.env.DB_USER,
    password: process.env.SQL_SERVER_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.SQL_SERVER_DATABASE || process.env.DB_NAME || "master",
    options: {
      encrypt: String(process.env.SQL_SERVER_ENCRYPT || process.env.DB_ENCRYPT || "true").toLowerCase() === "true",
      trustServerCertificate:
        String(
          process.env.SQL_SERVER_TRUST_SERVER_CERTIFICATE || process.env.DB_TRUST_SERVER_CERTIFICATE || "true"
        ).toLowerCase() === "true",
      connectTimeout: 20000,
      requestTimeout: 60000,
    },
  };

  const pool = await sql.connect(config);

  if (search) {
    const like = `%${search.replace(/%/g, "").replace(/'/g, "''")}%`;
    const r = await pool.request().input("s", sql.NVarChar, like).query(`
      SELECT TOP 10 *
      FROM dbo.ACCOUNT_MASTER am
      WHERE am.FULL_NAME LIKE @s OR CAST(am.ACCOUNT_ID AS VARCHAR(20)) LIKE @s
      ORDER BY am.FULL_NAME
    `);
    console.log(`\nAccounts matching "${search}" (all columns):\n`);
    console.table(r.recordset ?? []);
  } else {
    const r = await pool.request().query(`
      SELECT TOP 80
        h.account_id,
        MAX(am.FULL_NAME) AS account_name,
        MAX(am.GROUP_ID) AS group_id,
        MAX(am.STATE_ID) AS state_id,
        COUNT(1) AS order_count,
        MAX(h.voucher_date) AS last_order_date
      FROM dbo.sales_order_header h
      LEFT JOIN dbo.ACCOUNT_MASTER am ON am.ACCOUNT_ID = h.account_id
      GROUP BY h.account_id
      ORDER BY order_count DESC
    `);
    console.log("\nTop ERP customer accounts by order volume:\n");
    console.table(r.recordset ?? []);
  }

  await pool.close();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
