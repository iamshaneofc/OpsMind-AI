import { connect } from "mssql";
import * as fs from "fs";
import * as path from "path";

/**
 * SQL Server connection config for reading operations data from SQL Server.
 * Set USE_SQL_SERVER_DATA=true to enable ERP-backed operations reads.
 */
type SqlServerConnectConfig = Parameters<typeof connect>[0];

function getManualEnvValue(key: string): string | undefined {
  try {
    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return undefined;
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eq = trimmed.indexOf("=");
        if (eq > 0) {
          const k = trimmed.slice(0, eq).trim();
          if (k === key) {
            let value = trimmed.slice(eq + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            return value;
          }
        }
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return undefined;
}

export function getSqlServerConfig(): { config: SqlServerConnectConfig; enabled: boolean } {
  // Use manual parsing for the password to avoid variable expansion issues with $co
  const password = getManualEnvValue("SQL_SERVER_PASSWORD") || process.env.SQL_SERVER_PASSWORD || "";

  const config: SqlServerConnectConfig = {
    user: process.env.SQL_SERVER_USER ?? "",
    password: password,
    server: process.env.SQL_SERVER_HOST ?? "",
    port: parseInt(process.env.SQL_SERVER_PORT || "1433", 10),
    database: process.env.SQL_SERVER_DATABASE ?? "",
    options: {
      encrypt: process.env.SQL_SERVER_ENCRYPT === "true",
      trustServerCertificate: true,
      enableArithAbort: true,
    },
  };

  return {
    config,
    enabled: process.env.USE_SQL_SERVER_DATA === "true" || process.env.USE_SQL_SERVER_DATA === "1",
  };
}

/** Whether to use SQL Server for operations data (env USE_SQL_SERVER_DATA). Not a React hook. */
export function isSqlServerDataEnabled(): boolean {
  return getSqlServerConfig().enabled;
}
