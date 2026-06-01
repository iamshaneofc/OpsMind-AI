import dns from "dns";
import sql from "mssql";
import { getSqlServerConfig } from "./config";

/** Prefer IPv4 when resolving hostnames (reduces tedious "connect (sequence)" failures on some networks). */
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

let pool: sql.ConnectionPool | null = null;
/** In-flight connect so parallel RSC/API calls share one attempt instead of N concurrent `sql.connect`s. */
let connecting: Promise<sql.ConnectionPool | null> | null = null;
let lastConnectFailureAt = 0;
/** After a failed connect, skip retries for a while to avoid log spam and long timeouts on every navigation. */
const CONNECT_FAILURE_COOLDOWN_MS = 60_000;

/**
 * SQL Server text fields can occasionally include ASCII control chars that break downstream JSON parsing.
 * Strip them centrally before API routes return data.
 */
function sanitizeString(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, "");
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") return sanitizeRow(value as Record<string, unknown>);
  return value;
}

export function sanitizeRow<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, sanitizeValue(value)]),
  ) as T;
}

export function safeParse<T = unknown>(value: string): T | string {
  try {
    return JSON.parse(value) as T;
  } catch {
    return value;
  }
}

export async function getSqlServerPool(): Promise<sql.ConnectionPool | null> {
  const { config, enabled } = getSqlServerConfig();
  if (!enabled || !config.user || !config.password || !config.server || !config.database) {
    return null;
  }

  if (pool) {
    return pool;
  }

  const now = Date.now();
  if (now - lastConnectFailureAt < CONNECT_FAILURE_COOLDOWN_MS) {
    return null;
  }

  if (connecting) {
    return connecting;
  }

  connecting = (async () => {
    try {
      pool = await sql.connect(config);
      return pool;
    } catch (err) {
      lastConnectFailureAt = Date.now();
      console.error(
        "SQL Server connection failed (check VPN/firewall/SQL TCP; retries paused ~60s):",
        err
      );
      pool = null;
      return null;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

function logErpSql(queryText: string, params?: Record<string, string | number | null>) {
  if (process.env.LOG_ERP_SQL !== "1" && process.env.LOG_ERP_SQL !== "true") return;
  const q = queryText.replace(/\s+/g, " ").trim().slice(0, 500);
  const safeParams =
    params == null
      ? {}
      : Object.fromEntries(
          Object.entries(params).map(([k, v]) => [k, typeof v === "string" && v.length > 80 ? `${v.slice(0, 80)}…` : v]),
        );
  console.log("[ERP SQL]", q, safeParams);
}

export async function querySqlServer<T = Record<string, unknown>>(
  queryText: string,
  params?: Record<string, string | number | null>
): Promise<{ data: T[]; error: Error | null }> {
  const p = await getSqlServerPool();
  if (!p) {
    return { data: [], error: new Error("SQL Server not configured or connection failed.") };
  }

  try {
    logErpSql(queryText, params);
    const request = p.request();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === null || value === undefined) continue;
        request.input(key, value);
      }
    }
    const result = await request.query<T>(queryText);
    const rows = (result.recordset ?? []) as Record<string, unknown>[];
    const cleanData = rows.map((row) => sanitizeRow(row)) as T[];
    return { data: cleanData, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("SQL Server query error:", error.message);
    return { data: [], error };
  }
}
