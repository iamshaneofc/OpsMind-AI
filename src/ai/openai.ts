import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";

/**
 * Create OpenAI client. Pass key from route so it always uses current env (no cache).
 * baseURL forces direct OpenAI API (no proxy that could substitute key).
 */
/** Normalize API key: trim and strip Windows CRLF so key is valid on all platforms. */
export function normalizeApiKey(raw: string | undefined): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\r\n|\r|\n/g, "").trim();
}

function readOpenAIKeyFromDotEnv(): string {
  try {
    const envPath = path.join(process.cwd(), ".env");
    const text = fs.readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*OPENAI_API_KEY\s*=\s*(.*)\s*$/);
      if (!match) continue;
      return normalizeApiKey(match[1]?.replace(/^["']|["']$/g, ""));
    }
  } catch {
    return "";
  }
  return "";
}

export function getOpenAIClient(apiKeyOverride?: string) {
  const raw = apiKeyOverride ?? process.env.OPENAI_API_KEY;
  // Dev-only: detect if key was corrupted by CRLF or overridden by system env
  if (typeof raw === "string" && process.env.NODE_ENV === "development") {
    const hasCR = raw.includes("\r");
    const hasNL = raw.includes("\n");
    const len = raw.length;
    if (hasCR || hasNL || len > 200)
      console.warn("[OpenAI] OPENAI_API_KEY: length=" + len + " hasCR=" + hasCR + " hasNL=" + hasNL + ". If length!=164 or hasCR/hasNL, fix .env (use LF line endings) or remove OPENAI_API_KEY from Windows Environment Variables.");
  }
  let apiKey = normalizeApiKey(raw);
  if (process.env.NODE_ENV === "development" && apiKey && !apiKey.startsWith("sk-")) {
    const fileKey = readOpenAIKeyFromDotEnv();
    if (fileKey.startsWith("sk-")) {
      console.warn(
        "[OpenAI] process OPENAI_API_KEY is invalid; using OPENAI_API_KEY from .env for local development.",
      );
      apiKey = fileKey;
    }
  }
  if (process.env.NODE_ENV === "development" && apiKey) {
    const g = globalThis as typeof globalThis & { __openaiKeyDiagLogged?: boolean };
    if (!g.__openaiKeyDiagLogged) {
      const fp = apiKey.length >= 10 ? `${apiKey.slice(0, 6)}..${apiKey.slice(-4)}` : "short-key";
      console.info(`[OpenAI] runtime key len=${apiKey.length} fp=${fp} platform=${process.platform}`);
      g.__openaiKeyDiagLogged = true;
    }
  }
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in .env. Add it and restart the dev server (npm run dev).");
  }
  if (!apiKey.startsWith("sk-")) {
    throw new Error("OPENAI_API_KEY should start with sk-. Check .env and get a key from https://platform.openai.com/api-keys");
  }
  return new OpenAI({
    apiKey,
    baseURL: "https://api.openai.com/v1",
  });
}
