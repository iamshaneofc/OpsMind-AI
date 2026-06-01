#!/usr/bin/env node
/**
 * List companies + user counts from Supabase using .env (SUPABASE_SERVICE_ROLE_KEY).
 * Run from project root: npm run supabase:list-companies
 *
 * Does not print secrets. Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) {
    console.error("No .env file found. Copy .env.example to .env and add Supabase keys.");
    process.exit(1);
  }
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

console.log("Project:", url.replace(/^https?:\/\//, "").split(".")[0], "…\n");

const { data: companies, error: cErr } = await supabase
  .from("companies")
  .select("*")
  .order("company_id", { ascending: true });

if (cErr) {
  console.error("companies query failed:", cErr.message);
  process.exit(1);
}

console.log("=== public.companies ===\n");
for (const r of companies ?? []) {
  const line = [
    `company_id=${r.company_id}`,
    `name=${JSON.stringify(String(r.company_name ?? "").slice(0, 50))}`,
    `erp_account_id=${r.erp_account_id ?? "null"}`,
    `erp_account_ids=${r.erp_account_ids != null ? JSON.stringify(r.erp_account_ids) : "null"}`,
    `base_warehouse_id=${r.base_warehouse_id ?? "null"}`,
  ].join("  |  ");
  console.log(line);
}
console.log("\nRows:", (companies ?? []).length);

const { data: users, error: uErr } = await supabase
  .from("users")
  .select("user_id, email, name, role_id, company_id, warehouse_id")
  .order("user_id", { ascending: true });

if (uErr) {
  console.error("\nusers query failed:", uErr.message);
  process.exit(1);
}

console.log("\n=== public.users (summary) ===\n");
for (const r of users ?? []) {
  console.log(
    `  ${r.user_id}  ${String(r.email ?? "").padEnd(36)}  role_id=${r.role_id}  company_id=${r.company_id ?? "null"}  warehouse_id=${r.warehouse_id ?? "null"}`,
  );
}
console.log("\nTotal users:", (users ?? []).length);
