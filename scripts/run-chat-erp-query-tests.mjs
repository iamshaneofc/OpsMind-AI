/**
 * Runs ERP-focused chat queries against the real POST /api/chat backend.
 *
 * Auth (pick one):
 *   - CHAT_API_BEARER_TOKEN — Supabase user JWT (e.g. from browser after login)
 *   - CHAT_TEST_PASSWORD — signs in with anon key (optional CHAT_TEST_EMAIL; defaults to
 *     distributor@srlchemicals.com, same seed as scripts/test-dataflow.mjs)
 *
 * Other:
 *   - APP_BASE_URL — default http://localhost:3000 (server must be running)
 *
 * Note: The chat API loads recent history for the signed-in user, so these
 * turns are not fully isolated unless you use a fresh user or clear history.
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const BASE_URL = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

const QUERIES = [
  "Where is my order 830138",
  "Where is my order 830139",
  "Where is my order 829773",
  "Where is my order 829298",
  "Where is my order 829587",
  "Check my order",
  "My order from last week",
  "I placed something recently",
  "Where is my order XYZ999",
  "Status of order 000000",
  "Do you have Product ABCXYZ",
  "When will my order 830138 arrive",
  "When will my order 829773 arrive",
  "Do you have Product X",
  "Where is Product X available",
  "Which warehouse has Product X",
  "Show last orders for Product X",
  "When did I last order this product",
  "What should I do now for order 830138",
  "Should I wait or escalate order 829773",
  "I want everything",
  "My order is wrong",
  "Show another distributor order",
  "Give all order data",
];

const ROOT = process.cwd();
const OUT_JSON = path.join(ROOT, "test-results.json");
const OUT_MD = path.join(ROOT, "test-report.md");

const PREVIEW_LEN = 900;

const DEFAULT_CHAT_TEST_EMAIL = "distributor@srlchemicals.com";

async function getBearerToken() {
  const direct = process.env.CHAT_API_BEARER_TOKEN?.trim();
  if (direct) {
    return { token: direct, mode: "bearer_env" };
  }

  const password = process.env.CHAT_TEST_PASSWORD?.trim();
  const email = (process.env.CHAT_TEST_EMAIL?.trim() || DEFAULT_CHAT_TEST_EMAIL).trim();
  if (!password) {
    throw new Error(
      [
        "No auth configured. Add one of the following to your .env:",
        "  CHAT_API_BEARER_TOKEN=<Supabase JWT from the app after login>",
        "  CHAT_TEST_PASSWORD=<password>   (optional CHAT_TEST_EMAIL, default " + DEFAULT_CHAT_TEST_EMAIL + ")",
      ].join("\n"),
    );
  }

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anon = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const client = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) {
    throw new Error(`Sign-in failed: ${error?.message ?? "No session"}`);
  }
  return { token: data.session.access_token, mode: "password" };
}

function classifyOutcome({ httpStatus, text, fetchError }) {
  if (fetchError) {
    return { ok: false, label: "FAIL", insight: `Request error: ${fetchError}` };
  }
  if (httpStatus == null || httpStatus < 200 || httpStatus >= 300) {
    let detail = `HTTP ${httpStatus ?? "?"}`;
    const errBody = String(text ?? "").trim();
    if (errBody) {
      try {
        const j = JSON.parse(errBody);
        if (j && typeof j === "object" && j.error != null) detail += ` — ${String(j.error)}`;
      } catch {
        if (errBody.length < 200) detail += ` — ${errBody}`;
      }
    }
    return {
      ok: false,
      label: "FAIL",
      insight: detail,
    };
  }
  const body = String(text ?? "").trim();
  if (!body.length) {
    return { ok: false, label: "FAIL", insight: "Empty response body" };
  }
  const head = body.slice(0, 800).toLowerCase();
  if (head.includes("<!doctype html") || (head.includes("<html") && /login|sign in|supabase/.test(head))) {
    return {
      ok: false,
      label: "FAIL",
      insight: "HTML response (check auth token and that the app is running)",
    };
  }
  try {
    const j = JSON.parse(body);
    if (j && typeof j === "object" && "error" in j) {
      return { ok: false, label: "FAIL", insight: `API error: ${String(j.error)}` };
    }
  } catch {
    /* plain text success */
  }
  return {
    ok: true,
    label: "PASS",
    insight: `OK (${body.length} chars)`,
  };
}

async function postChat(token, message) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message }),
    });
    const text = await res.text();
    const durationMs = Date.now() - started;
    return { httpStatus: res.status, text, durationMs, fetchError: null };
  } catch (e) {
    const durationMs = Date.now() - started;
    return {
      httpStatus: null,
      text: "",
      durationMs,
      fetchError: e instanceof Error ? e.message : String(e),
    };
  }
}

function preview(s) {
  const t = String(s ?? "");
  if (t.length <= PREVIEW_LEN) return t;
  return `${t.slice(0, PREVIEW_LEN)}\n\n… (${t.length} characters total; see test-results.json)`;
}

async function main() {
  const startedAt = new Date().toISOString();
  const { token, mode } = await getBearerToken();

  /** @type {Array<Record<string, unknown>>} */
  const results = [];
  let pass = 0;
  let fail = 0;

  for (let i = 0; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    const ts = new Date().toISOString();
    const { httpStatus, text, durationMs, fetchError } = await postChat(token, query);
    const outcome = classifyOutcome({ httpStatus, text, fetchError });
    if (outcome.ok) pass++;
    else fail++;

    results.push({
      index: i + 1,
      query,
      response: fetchError ? null : text,
      timestamp: ts,
      durationMs,
      httpStatus,
      ok: outcome.ok,
      outcomeLabel: outcome.label,
      insight: outcome.insight,
      error: fetchError ?? (outcome.ok ? null : outcome.insight),
    });
  }

  const finishedAt = new Date().toISOString();

  const payload = {
    meta: {
      baseUrl: BASE_URL,
      startedAt,
      finishedAt,
      authMode: mode,
      queryCount: QUERIES.length,
      sessionNote:
        "Results use one continuous chat session per user (server loads recent history); later queries may be influenced by earlier turns.",
    },
    summary: { pass, fail, total: QUERIES.length },
    results,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2), "utf8");

  const insights = [];
  if (fail === 0) {
    insights.push("All requests completed with a non-empty successful HTTP response.");
  } else {
    const failed = results.filter((r) => !r.ok);
    insights.push(`${fail} request(s) did not meet the success criteria (HTTP 2xx, non-empty body, no JSON error field).`);
    for (const r of failed.slice(0, 8)) {
      insights.push(`- Query #${r.index}: ${r.insight}`);
    }
    if (failed.length > 8) insights.push(`- … and ${failed.length - 8} more`);
  }
  const slow = results.filter((r) => r.durationMs > 60000);
  if (slow.length) {
    insights.push(`${slow.length} response(s) took over 60s (likely LLM + tools).`);
  }

  const md = [
    "# Chat / ERP query validation report",
    "",
    "Generated by `scripts/run-chat-erp-query-tests.mjs`. Criteria: HTTP success, non-empty body, no `{ error: ... }` JSON envelope.",
    "",
    "## Summary",
    "",
    "| Metric | Value |",
    "|--------|-------|",
    `| Base URL | \`${BASE_URL}\` |`,
    `| Auth | ${mode} |`,
    `| Started | ${startedAt} |`,
    `| Finished | ${finishedAt} |`,
    `| **PASS** | ${pass} |`,
    `| **FAIL** | ${fail} |`,
    `| Total | ${QUERIES.length} |`,
    "",
    "## Pass / fail insights",
    "",
    ...insights.map((l) => `- ${l}`),
    "",
    "> Full assistant text for each turn is in `test-results.json` under `results[].response`.",
    "",
    "## Results",
    "",
  ];

  for (const r of results) {
    const flag = r.ok ? "PASS" : "FAIL";
    md.push(`### ${r.index}. [${flag}] ${r.query}`);
    md.push("");
    md.push(`- **Time:** ${r.timestamp}  |  **Duration:** ${r.durationMs} ms  |  **HTTP:** ${r.httpStatus ?? "—"}`);
    md.push(`- **Insight:** ${r.insight}`);
    if (r.error && r.error !== r.insight) md.push(`- **Error:** ${r.error}`);
    md.push("");
    md.push("**Response (preview)**");
    md.push("");
    md.push("```");
    md.push(r.fetchError ? `(no body) ${r.fetchError}` : preview(r.response ?? ""));
    md.push("```");
    md.push("");
  }

  fs.writeFileSync(OUT_MD, md.join("\n"), "utf8");

  console.log(`Wrote ${OUT_JSON}`);
  console.log(`Wrote ${OUT_MD}`);
  console.log(`PASS ${pass} / FAIL ${fail} (total ${QUERIES.length})`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
