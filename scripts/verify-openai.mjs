#!/usr/bin/env node
/**
 * Verify OPENAI_API_KEY from .env (no cache). Run: node scripts/verify-openai.mjs
 */
import { readFileSync } from "fs";
import { join } from "path";

const root = join(process.cwd());
let content;
try {
  content = readFileSync(join(root, ".env"), "utf8");
} catch (e) {
  console.error("No .env file found.");
  process.exit(1);
}

for (const line of content.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) continue;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim().replace(/\r\n|\r|\n/g, "");
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    value = value.slice(1, -1);
  process.env[key] = value;
}

// Strip CR/LF (Windows .env CRLF can leave \r on the value)
const key = (process.env.OPENAI_API_KEY || "").replace(/\r\n|\r|\n/g, "").trim();
if (!key) {
  console.error("OPENAI_API_KEY is missing in .env");
  process.exit(1);
}
if (!key.startsWith("sk-")) {
  console.error("OPENAI_API_KEY should start with sk-. Current value does not.");
  process.exit(1);
}

console.log("OPENAI_API_KEY: present, length", key.length, ", starts with sk-");

const OpenAI = (await import("openai")).default;
const client = new OpenAI({ apiKey: key });
try {
  const list = await client.models.list();
  console.log("OpenAI API: OK (models list succeeded).");
  process.exit(0);
} catch (err) {
  const msg = err?.message || String(err);
  const status = err?.status || err?.code;
  console.error("OpenAI API error:", status || "", msg);
  if (msg.includes("401") || msg.includes("Incorrect API key")) {
    console.error("Fix: Get a new key from https://platform.openai.com/api-keys and set OPENAI_API_KEY=sk-... in .env");
  }
  process.exit(1);
}
