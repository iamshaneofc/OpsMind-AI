#!/usr/bin/env node
/**
 * Check if OPENAI_API_KEY on this device is overridden by Windows env (causing 401).
 * Run from project root: node scripts/check-env-openai.mjs
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const root = process.cwd();
const envPath = join(root, ".env");

// 1. Key from process.env (set by Windows / shell before this script)
const fromProcess = (process.env.OPENAI_API_KEY || "").replace(/\r\n|\r|\n/g, "").trim();
const lenProcess = fromProcess.length;

// 2. Key from .env file (what we want)
let fromFile = "";
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    if (key !== "OPENAI_API_KEY") continue;
    fromFile = t.slice(eq + 1).trim().replace(/\r\n|\r|\n/g, "");
    if ((fromFile.startsWith('"') && fromFile.endsWith('"')) || (fromFile.startsWith("'") && fromFile.endsWith("'")))
      fromFile = fromFile.slice(1, -1);
    break;
  }
}
const lenFile = fromFile.length;

console.log("OPENAI_API_KEY from .env file: length", lenFile, fromFile ? "(starts with sk-)" : "(missing)");
console.log("OPENAI_API_KEY from process.env: length", lenProcess, fromProcess ? "(starts with sk-)" : "(unset)");

const fingerprint = (s) => (s.length >= 10 ? s.slice(0, 6) + ".." + s.slice(-4) : "");
const same = lenProcess === lenFile && fingerprint(fromProcess) === fingerprint(fromFile);

if (lenProcess > 0 && lenFile > 0 && !same) {
  console.warn("\n*** MISMATCH: process.env.OPENAI_API_KEY differs from .env ***");
  console.warn("On this device OPENAI_API_KEY is likely set in Windows Environment Variables,");
  console.warn("so it overrides .env and can cause 401 (wrong or old key).");
  console.warn("\nFix: Remove it from Windows:");
  console.warn("  1. Win + R → sysdm.cpl → Advanced → Environment Variables");
  console.warn("  2. Under User and System, look for OPENAI_API_KEY and delete it.");
  console.warn("  3. Restart terminal and run: npm run dev");
  process.exit(1);
}

if (lenFile === 0) {
  console.warn("\nOPENAI_API_KEY not found in .env. Add it and restart the dev server.");
  process.exit(1);
}

console.log("\nKey source is consistent. Expected length for sk-proj- keys is ~164.");
if (lenFile !== 164) console.warn("(Length is", lenFile + "; if you see 401, try re-copying the key from OpenAI and save .env with LF line endings.)");
process.exit(0);
