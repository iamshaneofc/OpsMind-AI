/**
 * P1 matrix — automated checks for tool layer + Lane A (no OpenAI).
 * Conversational behavior (vague queries, "soon", repeat phrasing) is manual QA.
 *
 * Run: npx vitest run src/p1-matrix-tool-verification.test.ts
 *      npm run test:p1
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { executeTool } from "@/ai/tools";
import { querySqlServer } from "@/sql-server/client";
import type { UserProfile } from "@/types/auth";

function loadDotenv() {
  const p = join(process.cwd(), ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

/** Must run before `it.skipIf(sqlEnabled)` is evaluated at load time. */
loadDotenv();

const superAdmin: UserProfile = {
  user_id: 0,
  email: "p1-test@local",
  full_name: "P1 Test",
  role: "super_admin",
  role_id: 1,
  company_id: null,
  warehouse_id: null,
  base_warehouse_id: null,
  erp_account_id: null,
  erp_account_ids: null,
};

const DEMO_EXPECTED: Array<[number, string]> = [
  [1, "ORDER_RECEIVED"],
  [2, "ALLOCATED_LOCAL_WAREHOUSE"],
  [3, "ALLOCATED_CENTRAL_WAREHOUSE"],
  [4, "IN_PREPARATION"],
  [5, "AWAITING_FACTORY"],
  [6, "DISPATCH_READY"],
  [7, "DELIVERED"],
];

describe("P1 — getDemoOrder (7 lifecycle states)", () => {
  it.each(DEMO_EXPECTED)("step %s → status %s with full lane_a", async (step, expectedStatus) => {
    const r = (await executeTool("getDemoOrder", { step }, superAdmin)) as Record<string, unknown>;
    expect(r.error).toBeUndefined();
    expect(r.document_type).toBe("erp_sales_order");
    const lane = r.lane_a as Record<string, unknown>;
    expect(lane).toBeTruthy();
    expect(lane.external_status).toBe(expectedStatus);
    expect(String(lane.explanation ?? "").length).toBeGreaterThan(10);
    expect(lane.expected_delivery_band).toBeTruthy();
    expect(lane.next_update_by === null || typeof lane.next_update_by === "string").toBe(true);
    if (expectedStatus === "DELIVERED") {
      expect(String((lane.expected_delivery_band as { label?: string }).label ?? "")).toMatch(/delivered|removal|completed/i);
      expect(lane.next_update_by).toBeNull();
    } else {
      expect(lane.next_update_by).toBeTruthy();
    }
  });
});

const sqlEnabled = () =>
  process.env.USE_SQL_SERVER_DATA === "true" || process.env.USE_SQL_SERVER_DATA === "1";

describe("P1 — live ERP (SQL Server)", () => {
  it.skipIf(!sqlEnabled())(
    "invalid order number returns not found",
    async () => {
      const r = (await executeTool(
        "getOrderStatus",
        { orderNumber: "XYZ999-INVALID-ORDER" },
        superAdmin,
      )) as { error?: string };
      expect(r.error).toMatch(/not found/i);
    },
    60_000,
  );

  it.skipIf(!sqlEnabled())(
    "real order returns lane_a + no error (super_admin)",
    async () => {
    const { data, error } = await querySqlServer<{ voucher_number: string }>(
      `SELECT TOP 1 voucher_number FROM dbo.sales_order_header ORDER BY sales_order_id DESC`,
    );
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
    const v = String(data![0].voucher_number);
    const r = (await executeTool("getOrderStatus", { orderNumber: v }, superAdmin)) as {
      error?: string;
      lane_a?: { external_status: string; explanation: string };
      order_number?: string;
    };
      expect(r.error).toBeUndefined();
      expect(r.lane_a?.external_status).toBeTruthy();
      expect(r.lane_a?.explanation).toBeTruthy();
    },
    60_000,
  );

  it.skipIf(!sqlEnabled())(
    "distributor with wrong erp_account_id cannot read another account order",
    async () => {
    const { data, error } = await querySqlServer<{ voucher_number: string; account_id: number }>(
      `SELECT TOP 1 voucher_number, account_id FROM dbo.sales_order_header ORDER BY sales_order_id DESC`,
    );
    expect(error).toBeNull();
    const row = data?.[0];
    expect(row).toBeTruthy();
    const wrongDistributor: UserProfile = {
      ...superAdmin,
      role: "distributor",
      role_id: 2,
      company_id: 1,
      erp_account_id: Number(row!.account_id) + 999_999_999,
      erp_account_ids: null,
    };
    const r = (await executeTool("getOrderStatus", { orderNumber: String(row!.voucher_number) }, wrongDistributor)) as {
      error?: string;
    };
      // ERP layer uses the same "not found" response for missing and cross-tenant orders (no existence leak).
      expect(String(r.error ?? "").toLowerCase()).toMatch(/not found|access denied|not linked/);
    },
    60_000,
  );

  it.skipIf(!sqlEnabled())(
    "nonsense product query returns structured result (no crash)",
    async () => {
    const r = (await executeTool(
      "getProductTrackingAndInventory",
      { productQuery: "ABCXYZNONEXISTENTPRODUCT999", includeOtherWarehouses: 1 },
      superAdmin,
    )) as Record<string, unknown>;
      expect(r).toBeDefined();
      expect(typeof r).toBe("object");
    },
    60_000,
  );

  it.skipIf(!sqlEnabled())(
    "resolved product returns product_card with order_history (super_admin)",
    async () => {
      const { data, error } = await querySqlServer<{ catalogue_no: string }>(
        `SELECT TOP 1 LTRIM(RTRIM(catalogue_no)) AS catalogue_no
         FROM dbo.Product_Master
         WHERE catalogue_no IS NOT NULL AND LTRIM(RTRIM(catalogue_no)) <> ''`,
      );
      expect(error).toBeNull();
      expect(data?.length).toBeGreaterThan(0);
      const sku = String(data![0].catalogue_no);
      const r = (await executeTool(
        "getProductTrackingAndInventory",
        { productQuery: sku, includeOtherWarehouses: 0 },
        superAdmin,
      )) as { error?: string; product_card?: { order_history?: { latest_orders?: unknown[] } } };
      expect(r.error).toBeUndefined();
      expect(r.product_card).toBeTruthy();
      expect(r.product_card?.order_history).toBeTruthy();
      expect(Array.isArray(r.product_card?.order_history?.latest_orders)).toBe(true);
    },
    120_000,
  );

  it.skipIf(!sqlEnabled())(
    "same order twice — stable status",
    async () => {
    const { data } = await querySqlServer<{ voucher_number: string }>(
      `SELECT TOP 1 voucher_number FROM dbo.sales_order_header ORDER BY sales_order_id DESC`,
    );
    const v = String(data![0].voucher_number);
    const a = (await executeTool("getOrderStatus", { orderNumber: v }, superAdmin)) as {
      lane_a?: { external_status: string };
    };
    const b = (await executeTool("getOrderStatus", { orderNumber: v }, superAdmin)) as {
      lane_a?: { external_status: string };
    };
      expect(a.lane_a?.external_status).toBe(b.lane_a?.external_status);
    },
    60_000,
  );
});
