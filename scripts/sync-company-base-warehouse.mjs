#!/usr/bin/env node
/**
 * Sync public.companies.base_warehouse_id from ERP sales_order_header.analysis_id.
 *
 * Strategy:
 * - For each company with ERP account mapping, compute the most frequent analysis_id
 *   across recent ERP orders for its account(s).
 * - Update companies.base_warehouse_id to that inferred location id.
 *
 * Usage:
 *   node scripts/sync-company-base-warehouse.mjs          # dry run
 *   node scripts/sync-company-base-warehouse.mjs --apply  # write updates
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
    if (process.env[key] == null) process.env[key] = value;
  }
}

async function supabaseFetch(path) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  const res = await fetch(`${base}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supabasePatchCompany(companyId, baseWarehouseId) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  const res = await fetch(`${base}/rest/v1/companies?company_id=eq.${companyId}`, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ base_warehouse_id: baseWarehouseId }),
  });
  if (!res.ok) throw new Error(`Supabase patch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function normalizeAccountIds(row) {
  const ids = [];
  if (row.erp_account_id != null) ids.push(Number(row.erp_account_id));
  if (Array.isArray(row.erp_account_ids)) {
    for (const raw of row.erp_account_ids) ids.push(Number(raw));
  }
  return Array.from(new Set(ids.filter((n) => Number.isFinite(n) && n > 0).map((n) => Math.trunc(n))));
}

async function inferWarehouseIdFromErp(pool, accountIds) {
  if (!accountIds.length) return null;
  const inSql = accountIds.join(",");
  const q = `
    SELECT TOP 1 h.analysis_id AS warehouse_id, COUNT(1) AS cnt
    FROM dbo.sales_order_header h
    WHERE h.account_id IN (${inSql}) AND h.analysis_id IS NOT NULL
    GROUP BY h.analysis_id
    ORDER BY cnt DESC, h.analysis_id ASC
  `;
  const res = await pool.request().query(q);
  const row = res.recordset?.[0];
  const id = Number(row?.warehouse_id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return Math.trunc(id);
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");

  const sqlConfig = {
    server: process.env.SQL_SERVER_HOST || process.env.DB_SERVER,
    port: Number(process.env.SQL_SERVER_PORT || process.env.DB_PORT || 1433),
    user: process.env.SQL_SERVER_USER || process.env.DB_USER,
    password: process.env.SQL_SERVER_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.SQL_SERVER_DATABASE || process.env.DB_NAME,
    options: {
      encrypt: String(process.env.SQL_SERVER_ENCRYPT ?? "true").toLowerCase() === "true",
      trustServerCertificate: String(process.env.SQL_SERVER_TRUST_SERVER_CERTIFICATE ?? "true").toLowerCase() === "true",
    },
  };

  const companies = await supabaseFetch(
    "companies?select=company_id,company_name,erp_account_id,erp_account_ids,base_warehouse_id&order=company_id.asc",
  );
  const pool = await sql.connect(sqlConfig);
  try {
    const report = [];
    for (const c of companies ?? []) {
      const accountIds = normalizeAccountIds(c);
      if (!accountIds.length) {
        report.push({
          company_id: c.company_id,
          company_name: c.company_name,
          current_base_warehouse_id: c.base_warehouse_id,
          inferred_base_warehouse_id: null,
          action: "skip:no_erp_account",
        });
        continue;
      }
      const inferred = await inferWarehouseIdFromErp(pool, accountIds);
      if (inferred == null) {
        report.push({
          company_id: c.company_id,
          company_name: c.company_name,
          current_base_warehouse_id: c.base_warehouse_id,
          inferred_base_warehouse_id: null,
          action: "skip:no_orders_or_analysis_id",
        });
        continue;
      }
      const unchanged = Number(c.base_warehouse_id) === inferred;
      if (!unchanged && apply) {
        await supabasePatchCompany(c.company_id, inferred);
      }
      report.push({
        company_id: c.company_id,
        company_name: c.company_name,
        current_base_warehouse_id: c.base_warehouse_id,
        inferred_base_warehouse_id: inferred,
        action: unchanged ? "unchanged" : apply ? "updated" : "would_update",
      });
    }

    console.table(report);
    const updated = report.filter((r) => r.action === "updated").length;
    const wouldUpdate = report.filter((r) => r.action === "would_update").length;
    console.log(apply ? `Updated ${updated} companies.` : `Dry run complete. ${wouldUpdate} companies would be updated.`);
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});

