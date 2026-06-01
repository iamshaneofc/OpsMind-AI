#!/usr/bin/env node
/**
 * Quick smoke test of ERP-mapped SQL Server operations.
 *
 * Runs a few representative functions and prints outputs (first 5 items).
 */
import { readFileSync } from "fs";
import { join } from "path";

function loadEnvFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(join(process.cwd(), ".env"));

const profile = {
  user_id: 0,
  email: "test@example.com",
  full_name: null,
  role_id: 1,
  role: "super_admin",
  company_id: null,
  warehouse_id: null,
};

const ops = await import("../src/sql-server/operations.ts");

async function main() {
  console.log("USE_SQL_SERVER_DATA:", process.env.USE_SQL_SERVER_DATA);
  console.log("DB:", process.env.SQL_SERVER_HOST, process.env.SQL_SERVER_DATABASE);

  console.log("\n1) getAllWarehouses");
  const wh = await ops.sqlServerGetAllWarehouses(profile);
  console.log(JSON.stringify(wh?.slice ? wh.slice(0, 5) : wh, null, 2));

  const firstWarehouseId = Array.isArray(wh) && wh[0]?.warehouse_id ? wh[0].warehouse_id : null;
  if (firstWarehouseId) {
    console.log("\n2) getWarehouseInventory (first warehouse)");
    const inv = await ops.sqlServerGetWarehouseInventory(firstWarehouseId, profile);
    console.log(JSON.stringify(inv, null, 2));
  }

  console.log("\n3) getAllInventory");
  const allInv = await ops.sqlServerGetAllInventory(profile);
  console.log(JSON.stringify(allInv, null, 2));

  console.log("\n4) getCompanyInvoices (latest 5)");
  const invoices = await ops.sqlServerGetCompanyInvoices("", 5, "", profile);
  console.log(JSON.stringify(invoices, null, 2));

  console.log("\n5) getOrderStatus (latest order voucher_number)");
  // Pull a latest voucher_number directly from ERP order header using SQL Server client through ops (best-effort)
  // We call getDispatchQueue and use first order_number.
  const dq = await ops.sqlServerGetDispatchQueue(profile);
  const orderNumber = Array.isArray(dq) && dq[0]?.order_number ? dq[0].order_number : null;
  if (orderNumber) {
    const status = await ops.sqlServerGetOrderStatus(orderNumber, profile);
    console.log(JSON.stringify(status, null, 2));
  } else {
    console.log("No order found to test getOrderStatus.");
  }
}

main().catch((e) => {
  console.error("Test failed:", e.message);
  process.exit(1);
});

