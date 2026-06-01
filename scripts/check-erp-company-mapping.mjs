#!/usr/bin/env node
/**
 * Gap G sanity: distributors (role_id distributor) linked to erp_account_id(s).
 * Load .env, use Supabase service role. Exit 1 if orphans found.
 *
 * Usage: node scripts/check-erp-company-mapping.mjs
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

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
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    }
  }
} catch (e) {
  console.error("Could not load .env:", e.message);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sql = await import("@supabase/supabase-js");

const supabase = sql.createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: users, error: uErr } = await supabase
  .from("users")
  .select("user_id, email, role_id, company_id")
  .eq("role_id", 2);

if (uErr) {
  console.error("Failed to read users:", uErr.message);
  process.exit(1);
}

const distributorCompanyIds = [
  ...new Set((users ?? []).map((u) => u.company_id).filter((id) => id != null)),
];

if (!distributorCompanyIds.length) {
  console.log("No distributor-role users — nothing to check.");
  process.exit(0);
}

const { data: companies, error: cErr } = await supabase
  .from("companies")
  .select("company_id, company_name, erp_account_id, erp_account_ids")
  .in(
    "company_id",
    distributorCompanyIds.map((x) => Number(x)),
  );

if (cErr) {
  console.error("Failed to read companies:", cErr.message);
  process.exit(1);
}

const problems = [];

for (const c of companies ?? []) {
  const id = Number(c.company_id ?? c.COMPANY_ID);
  const ids = Array.isArray(c.erp_account_ids) ? c.erp_account_ids : [];
  const single = c.erp_account_id != null ? Number(c.erp_account_id) : null;

  const hasAny =
    (single != null && Number.isFinite(single) && single > 0) ||
    (ids.length && ids.some((x) => Number(x) > 0));

  if (!hasAny) {
    problems.push({
      company_id: id,
      company_name: c.company_name ?? c.COMPANY_NAME,
      issue: "no erp_account_id / erp_account_ids",
    });
  }
}

if (problems.length) {
  console.error(`Found ${problems.length} distributor company(ies) without ERP account mapping:\n`);
  console.table(problems);
  process.exit(1);
}

console.log(`OK — ${companies?.length ?? 0} distributor-linked companies have ERP account IDs defined.`);
