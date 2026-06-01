#!/usr/bin/env node
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (process.env[k] === undefined) process.env[k] = v;
}

const sql = (await import("mssql")).default;
const host = process.env.SQL_SERVER_HOST;
const port = Number(process.env.SQL_SERVER_PORT) || 1433;
const user = process.env.SQL_SERVER_USER;
const password = process.env.SQL_SERVER_PASSWORD;
const database = process.env.SQL_SERVER_DATABASE || "SiscoERP";
const enc = (process.env.SQL_SERVER_ENCRYPT ?? "").toLowerCase();
const trust = (process.env.SQL_SERVER_TRUST_SERVER_CERTIFICATE ?? "").toLowerCase();
const encrypt = enc === "true" || enc === "1";
const trustServerCertificate = trust === "true" || trust === "1" || !encrypt;

const ACC = 38085;
const LOC = 6;

if (!host || !user || !password) {
  console.error("Missing SQL credentials");
  process.exit(1);
}

const pool = await sql.connect({
  server: host,
  port,
  user,
  password,
  database,
  options: { encrypt, trustServerCertificate, connectTimeout: 20000, requestTimeout: 60000 },
});

console.log(`Viraj ACCOUNT_ID=${ACC}, Bhiwandi Location_id=${LOC}\n`);
console.log("=== Same WHERE as getOrdersByWarehouse (distributor): analysis_id=LOC OR line Despatch_Location_ID=LOC ===\n");

const match = await pool.request().query(`
SELECT COUNT(*) AS cnt
FROM dbo.sales_order_header h
WHERE h.account_id = ${ACC}
  AND (
    h.analysis_id = ${LOC}
    OR EXISTS (
      SELECT 1 FROM dbo.sales_order_body b
      WHERE b.sales_order_id = h.sales_order_id AND b.Despatch_Location_ID = ${LOC}
    )
  )
`);
console.log("Distinct orders (all time):", match.recordset[0]?.cnt);

const recent = await pool.request().query(`
SELECT TOP 15
  h.sales_order_id,
  h.voucher_number,
  h.voucher_date,
  h.analysis_id,
  h.account_id
FROM dbo.sales_order_header h
WHERE h.account_id = ${ACC}
  AND (
    h.analysis_id = ${LOC}
    OR EXISTS (
      SELECT 1 FROM dbo.sales_order_body b
      WHERE b.sales_order_id = h.sales_order_id AND b.Despatch_Location_ID = ${LOC}
    )
  )
ORDER BY h.voucher_date DESC
`);
console.log("\nSample (latest 15):");
console.table(recent.recordset);

console.log("\n=== Lines only: Despatch_Location_ID=6 for Viraj (6 months) ===\n");
const lines = await pool.request().query(`
SELECT COUNT(*) AS line_count
FROM dbo.sales_order_body b
INNER JOIN dbo.sales_order_header h ON h.sales_order_id = b.sales_order_id
WHERE h.account_id = ${ACC}
  AND b.Despatch_Location_ID = ${LOC}
  AND h.voucher_date >= DATEADD(month, -6, GETDATE())
`);
console.log("Order lines (6 mo):", lines.recordset[0]?.line_count);

console.log("\n=== Viraj despatch mix (6 months) — compare to Delhi 8 etc. ===\n");
const mix = await pool.request().query(`
SELECT b.Despatch_Location_ID, l.Description, COUNT(*) AS lines
FROM dbo.sales_order_body b
INNER JOIN dbo.sales_order_header h ON h.sales_order_id = b.sales_order_id
LEFT JOIN dbo.Location l ON l.Location_id = b.Despatch_Location_ID
WHERE h.account_id = ${ACC}
  AND h.voucher_date >= DATEADD(month, -6, GETDATE())
GROUP BY b.Despatch_Location_ID, l.Description
ORDER BY lines DESC
`);
console.table(mix.recordset);

await pool.close();
