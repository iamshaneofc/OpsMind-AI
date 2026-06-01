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

loadEnvFile(join(process.cwd(), ".env"));

const server = process.env.SQL_SERVER_HOST || process.env.DB_SERVER;
const port = Number(process.env.SQL_SERVER_PORT || process.env.DB_PORT || 1433);
const user = process.env.SQL_SERVER_USER || process.env.DB_USER;
const password = process.env.SQL_SERVER_PASSWORD || process.env.DB_PASSWORD;
const database = process.env.SQL_SERVER_DATABASE || process.env.DB_NAME || "master";
const encrypt = String(process.env.SQL_SERVER_ENCRYPT || process.env.DB_ENCRYPT || "true").toLowerCase() === "true";
const trustServerCertificate = String(
  process.env.SQL_SERVER_TRUST_SERVER_CERTIFICATE || process.env.DB_TRUST_SERVER_CERTIFICATE || "true",
).toLowerCase() === "true";

if (!server || !user || !password) {
  console.error("Missing SQL Server connection settings in .env");
  process.exit(1);
}

const config = {
  server,
  port,
  user,
  password,
  database,
  options: {
    encrypt,
    trustServerCertificate,
    connectTimeout: 15000,
    requestTimeout: 15000,
  },
};

const preferredTables = [
  "warehouses",
  "companies",
  "products",
  "inventory",
  "orders",
  "invoices",
  "order_items",
  "invoice_orders",
  "invoice_items",
  "proforma_invoices",
];

async function main() {
  const pool = await sql.connect(config);
  console.log(`Connected to ${server}:${port} / ${database}`);
  const tablesRes = await pool.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_SCHEMA, TABLE_NAME
  `);
  const tables = tablesRes.recordset ?? [];
  console.log(`Found ${tables.length} tables`);
  if (!tables.length) {
    await pool.close();
    return;
  }

  const lookup = new Map(tables.map((row) => [String(row.TABLE_NAME).toLowerCase(), row]));
  const chosen = [];
  for (const name of preferredTables) {
    const hit = lookup.get(name.toLowerCase());
    if (hit) chosen.push(hit);
    if (chosen.length >= 5) break;
  }
  if (chosen.length < 5) {
    for (const row of tables) {
      const key = String(row.TABLE_NAME).toLowerCase();
      if (!chosen.some((x) => String(x.TABLE_NAME).toLowerCase() === key)) {
        chosen.push(row);
      }
      if (chosen.length >= 5) break;
    }
  }

  for (const table of chosen.slice(0, 5)) {
    const schema = String(table.TABLE_SCHEMA);
    const name = String(table.TABLE_NAME);
    console.log(`\n=== ${schema}.${name} ===`);
    try {
      const sample = await pool.request().query(`SELECT TOP 5 * FROM [${schema}].[${name}]`);
      console.log(JSON.stringify(sample.recordset, null, 2));
    } catch (err) {
      console.log(`Could not read sample rows: ${err.message}`);
    }
  }

  await pool.close();
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
