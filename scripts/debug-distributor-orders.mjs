#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sql from "mssql";

function loadEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function main() {
  loadEnv();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: users, error } = await supabase
    .from("users")
    .select("email,role_id,company_id,warehouse_id")
    .or("email.ilike.%viraj%,email.ilike.%krissh%,email.ilike.%opsmindchemicals.com%")
    .limit(100);

  if (error) {
    throw new Error(`Supabase users query failed: ${error.message}`);
  }

  console.log("Supabase user profiles:");
  console.table(users ?? []);

  const pool = await sql.connect({
    server: process.env.SQL_SERVER_HOST || process.env.DB_SERVER,
    port: Number(process.env.SQL_SERVER_PORT || process.env.DB_PORT || 1433),
    user: process.env.SQL_SERVER_USER || process.env.DB_USER,
    password: process.env.SQL_SERVER_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.SQL_SERVER_DATABASE || process.env.DB_NAME || "master",
    options: {
      encrypt:
        String(process.env.SQL_SERVER_ENCRYPT || process.env.DB_ENCRYPT || "true").toLowerCase() ===
        "true",
      trustServerCertificate:
        String(
          process.env.SQL_SERVER_TRUST_SERVER_CERTIFICATE ||
            process.env.DB_TRUST_SERVER_CERTIFICATE ||
            "true"
        ).toLowerCase() === "true",
      connectTimeout: 20000,
      requestTimeout: 30000,
    },
  });

  for (const user of users ?? []) {
    if (!user.company_id) {
      console.log(`${user.email}: no company_id in Supabase profile`);
      continue;
    }
    const req = pool.request();
    req.input("aid", sql.Int, Number(user.company_id));
    const match = await req.query(
      "SELECT COUNT(1) as c FROM dbo.sales_order_header WHERE account_id = @aid"
    );
    const count = Number(match.recordset?.[0]?.c ?? 0);
    console.log(
      `${user.email}: company_id=${user.company_id} -> SQL account_id=${user.company_id}, matching orders=${count}`
    );
  }

  await pool.close();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

