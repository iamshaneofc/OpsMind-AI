import { getDistributorSqlAccountIds } from "@/lib/distributor-sql-accounts";
import { querySqlServer } from "@/sql-server/client";
import type { UserProfile } from "@/types/auth";

export async function fetchSalesOrderHeaderForAccessGate(
  salesOrderId: number,
): Promise<{ account_id: number; analysis_id: number | null } | null> {
  const sid = Math.trunc(Number(salesOrderId));
  if (!Number.isFinite(sid) || sid <= 0) return null;
  const { data } = await querySqlServer<{ account_id: number; analysis_id: number | null }>(
    `SELECT TOP 1 account_id, analysis_id
     FROM dbo.sales_order_header
     WHERE sales_order_id = @id`,
    { id: sid },
  );
  return data?.[0] ?? null;
}

/** Super admin / warehouse ops may upsert Phase 1 manual allocation rows. */
export function roleCanUpsertManualAllocation(role: UserProfile["role"]): boolean {
  return role === "super_admin" || role === "warehouse";
}

/**
 * Validates that the ERP order exists for non–super-admin callers (distributor tenant + warehouse depot scope).
 */
export async function profileCanAccessSalesOrderForManualAllocationRead(
  profile: UserProfile,
  salesOrderId: number,
): Promise<boolean> {
  const header = await fetchSalesOrderHeaderForAccessGate(salesOrderId);
  if (!header) return false;

  if (profile.role === "super_admin") return true;

  if (profile.role === "distributor") {
    const allowed = getDistributorSqlAccountIds(profile);
    return allowed.includes(Number(header.account_id));
  }

  if (profile.role === "warehouse") {
    return warehouseCanAccessSalesOrder(Number(profile.warehouse_id), salesOrderId);
  }

  return false;
}

async function warehouseCanAccessSalesOrder(warehouseErpLocationId: number | null, salesOrderId: number): Promise<boolean> {
  if (!Number.isFinite(warehouseErpLocationId) || !warehouseErpLocationId || warehouseErpLocationId <= 0) return false;
  const sid = Math.trunc(Number(salesOrderId));

  const { data } = await querySqlServer<{ ok: number }>(
    `SELECT TOP 1 1 AS ok
     FROM dbo.sales_order_header h
     WHERE h.sales_order_id = @id
       AND (
         h.analysis_id = @wid
         OR EXISTS (
           SELECT 1
           FROM dbo.sales_order_body b
           WHERE b.sales_order_id = h.sales_order_id
             AND b.Despatch_Location_ID = @wid
         )
       )`,
    { id: sid, wid: warehouseErpLocationId },
  );

  return Boolean(data?.length);
}

export async function profileCanUpsertManualAllocation(profile: UserProfile, salesOrderId: number): Promise<boolean> {
  if (!roleCanUpsertManualAllocation(profile.role)) return false;
  if (profile.role === "super_admin") return Boolean(await fetchSalesOrderHeaderForAccessGate(salesOrderId));
  if (profile.role === "warehouse") {
    const header = await fetchSalesOrderHeaderForAccessGate(salesOrderId);
    if (!header) return false;
    return warehouseCanAccessSalesOrder(Number(profile.warehouse_id), salesOrderId);
  }
  return false;
}
