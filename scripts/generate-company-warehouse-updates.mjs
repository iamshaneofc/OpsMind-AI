#!/usr/bin/env node
/**
 * Reads public.companies from Supabase, queries ERP for the most common
 * sales_order_header.analysis_id per erp_account_id (maps to dbo.Location.Location_id),
 * prints SQL you can run in Supabase SQL Editor to set base_warehouse_id.
 *
 * Requires .env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * and SQL Server vars (USE_SQL_SERVER_DATA=true, SQL_SERVER_*).
 *
 * Run: npm run supabase:plan-warehouse-updates
 */

import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  const p = join(root, ".env");
  if (!existsSync(p)) {
    console.error("Missing .env");
    process.exit(1);
  }
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const skey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !skey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
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

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(url, skey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: companies, error: cErr } = await supabase.from("companies").select("*").order("company_id");
if (cErr) {
  console.error("Supabase companies error:", cErr.message);
  process.exit(1);
}

const sql = await import("mssql");
let pool;
try {
  pool = await sql.default.connect({
    server: host,
    port,
    user,
    password,
    database,
    options: { encrypt, trustServerCertificate, connectTimeout: 30000, requestTimeout: 60000 },
  });
} catch (err) {
  const msg = err?.message ?? String(err);
  console.error("Could not connect to SQL Server at", host + ":" + port);
  console.error(msg);
  console.error(`
Fix: ECONNREFUSED / ESOCKET means nothing is accepting TCP on that host:port from this PC.

Check:
  • VPN or office network if the VM only allows certain IPs
  • Windows + cloud firewall: inbound TCP 1433 to the VM
  • SQL Server Configuration Manager: TCP/IP enabled; SQL Browser if using named instance
  • .env SQL_SERVER_HOST / SQL_SERVER_PORT

Workaround (no Node ERP access): run scripts/erp-discover-warehouses-for-accounts.sql in SSMS on the server,
then paste UPDATE public.companies ... into Supabase SQL Editor manually.
`);
  process.exit(1);
}

async function dominantAnalysisIdForAccount(accountId) {
  const r = await pool.request().input("aid", accountId).query(`
    SELECT TOP 1 analysis_id, cnt
    FROM (
      SELECT analysis_id, COUNT(*) AS cnt
      FROM dbo.sales_order_header
      WHERE account_id = @aid AND analysis_id IS NOT NULL
      GROUP BY analysis_id
    ) x
    ORDER BY cnt DESC
  `);
  const row = r.recordset?.[0];
  if (!row?.analysis_id) return { analysis_id: null, cnt: 0, note: "no orders with analysis_id" };
  return { analysis_id: Number(row.analysis_id), cnt: Number(row.cnt), note: null };
}

async function locationExists(locationId) {
  const r = await pool.request().input("id", locationId).query(`SELECT 1 AS ok FROM dbo.Location WHERE Location_id = @id`);
  return (r.recordset?.length ?? 0) > 0;
}

async function erpAccountName(accountId) {
  const r = await pool.request().input("id", accountId).query(`SELECT TOP 1 FULL_NAME FROM dbo.ACCOUNT_MASTER WHERE ACCOUNT_ID = @id`);
  return r.recordset?.[0]?.FULL_NAME ?? null;
}

console.log("-- Generated: assign base_warehouse_id (ERP Location_id = sales_order_header.analysis_id mode)\n");
console.log("-- Review each line, then run in Supabase → SQL Editor.\n");

const updates = [];
const skipped = [];

for (const c of companies ?? []) {
  const cid = c.company_id;
  const name = c.company_name ?? "";
  const eid = c.erp_account_id;

  if (eid == null || !Number.isFinite(Number(eid))) {
    skipped.push({ company_id: cid, company_name: name, reason: "erp_account_id is null — set ERP account first" });
    continue;
  }

  const dom = await dominantAnalysisIdForAccount(Number(eid));
  const erpName = await erpAccountName(Number(eid));

  if (dom.analysis_id == null) {
    skipped.push({
      company_id: cid,
      company_name: name,
      erp_account_id: eid,
      reason: dom.note || "could not infer warehouse from orders",
    });
    continue;
  }

  const ok = await locationExists(dom.analysis_id);
  if (!ok) {
    skipped.push({
      company_id: cid,
      company_name: name,
      erp_account_id: eid,
      reason: `analysis_id ${dom.analysis_id} not in dbo.Location — verify ERP`,
    });
    continue;
  }

  updates.push({
    company_id: cid,
    company_name: name,
    erp_account_id: Number(eid),
    erp_full_name: erpName,
    base_warehouse_id: dom.analysis_id,
    order_rows_supporting: dom.cnt,
  });
}

for (const u of updates) {
  console.log(
    `-- company_id=${u.company_id} ${u.company_name} | ERP account ${u.erp_account_id} (${u.erp_full_name ?? "?"}) | mode analysis_id=${u.base_warehouse_id} (${u.order_rows_supporting} order headers)`,
  );
  console.log(`UPDATE public.companies SET base_warehouse_id = ${u.base_warehouse_id} WHERE company_id = ${u.company_id};`);
  console.log("");
}

if (skipped.length) {
  console.log("\n-- === Skipped (manual ERP account or warehouse needed) ===\n");
  for (const s of skipped) {
    console.log(`-- company_id=${s.company_id} "${s.company_name}" | ${s.reason}${s.erp_account_id != null ? ` | erp_account_id=${s.erp_account_id}` : ""}`);
  }
}

await pool.close();

console.log(
  "\n-- Companies without erp_account_id: link dbo.ACCOUNT_MASTER.ACCOUNT_ID to public.companies.erp_account_id first, then re-run this script.",
);
