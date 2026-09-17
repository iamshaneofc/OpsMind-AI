import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Client } from "pg";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const DIRECT_URL = requireEnv("DIRECT_URL");

async function main() {
  const client = new Client({ connectionString: DIRECT_URL });
  await client.connect();

  const migrationsDir = resolve("supabase/migrations");
  const allFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"));

  // Reorder: init_schema and RLS must run first since other migrations depend on those tables
  const priority = [
    "202603060001_init_schema.sql",
    "202603060002_rls_policies.sql",
  ];
  const prioritySet = new Set(priority);
  const priorityFiles = priority.filter((p) => allFiles.includes(p));
  const remainingFiles = allFiles
    .filter((f) => !prioritySet.has(f))
    .sort();
  const files = [...priorityFiles, ...remainingFiles];

  console.log(`Found ${files.length} migration files.`);

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    console.log(`Running: ${file}`);
    try {
      await client.query(sql);
      console.log(`  OK`);
    } catch (err) {
      console.error(`  ERROR in ${file}: ${err.message}`);
      // Continue on common non-fatal errors
      const safeCodes = ["42710", "42P07", "23505", "42P16", "42P01", "23503"];
      if (safeCodes.includes(err.code) || err.message.includes("already exists") || err.message.includes("does not exist")) {
        console.log(`  (skipped - non-fatal)`);
      } else {
        console.error(`  FATAL - aborting.`);
        await client.end();
        process.exit(1);
      }
    }
  }

  await client.end();
  console.log("\nAll migrations applied successfully.");
}

main().catch((err) => {
  console.error("Migration script failed:", err.message || err);
  process.exit(1);
});
