/**
 * Verifies local dev prerequisites without printing secret values.
 * Usage: node scripts/check-local-env.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function main() {
  const envPath = path.join(root, ".env");
  const hasNodeModules = fs.existsSync(path.join(root, "node_modules"));

  console.log("Local dev check (srl-operations-ai)\n");

  if (!hasNodeModules) {
    console.log("  [ ] node_modules missing — run: npm install\n");
  } else {
    console.log("  [x] node_modules present\n");
  }

  if (!fs.existsSync(envPath)) {
    console.log("  [ ] .env missing — copy from .env.example:\n");
    console.log("        copy .env.example .env   (Windows PowerShell/cmd)\n");
    process.exitCode = 1;
    return;
  }

  console.log("  [x] .env file exists\n");

  const env = { ...process.env, ...loadEnvFile(envPath) };
  let ok = true;
  for (const key of required) {
    const v = env[key];
    const set = typeof v === "string" && v.length > 0 && !/^your_|^sk-your|^https:\/\/YOUR_/i.test(v);
    if (!set) {
      console.log(`  [ ] ${key} — set a real value in .env`);
      ok = false;
    } else {
      console.log(`  [x] ${key} — set`);
    }
  }

  console.log(
    "\n  Database: apply pending SQL migrations in Supabase Dashboard → SQL Editor when online.",
  );
  console.log("  See: supabase/migrations/ (e.g. base_warehouse column on companies).\n");

  if (!ok || !hasNodeModules) process.exitCode = 1;
}

main();
