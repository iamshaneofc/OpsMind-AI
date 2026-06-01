import { createSupabaseAdminClient } from "@/supabase/admin";

export type ErpManualAllocationSnapshot = {
  allocation_type: "LOCAL" | "CENTRAL";
  allocated_location_id: number | null;
  notes: string | null;
};

export type ErpManualAllocationRow = ErpManualAllocationSnapshot & {
  sales_order_id: number;
  sales_order_body_id: number | null;
  updated_at: string | null;
};

/** When false or unset, skip Supabase read (ERP-only mode / tests). */
function manualAllocationReadsEnabled(): boolean {
  const v = process.env.SKIP_ERP_MANUAL_ALLOCATION;
  return v !== "true" && v !== "1";
}

/**
 * Loads manual LOCAL/CENTRAL allocation row from Supabase (service-role only in production).
 */
export async function fetchErpManualAllocationBySalesOrderId(
  salesOrderId: number,
): Promise<ErpManualAllocationRow | null> {
  if (!manualAllocationReadsEnabled()) return null;

  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return null;

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("erp_order_manual_allocation")
      .select(
        "sales_order_id, sales_order_body_id, allocation_type, allocated_location_id, notes, updated_at",
      )
      .eq("sales_order_id", salesOrderId)
      .maybeSingle();

    if (error || !data) return null;

    const allocation_type = String((data as { allocation_type?: string }).allocation_type ?? "").toUpperCase();
    if (allocation_type !== "LOCAL" && allocation_type !== "CENTRAL") return null;

    return {
      sales_order_id: Number((data as { sales_order_id?: number }).sales_order_id),
      sales_order_body_id:
        (data as { sales_order_body_id?: number | null }).sales_order_body_id != null
          ? Number((data as { sales_order_body_id: number | null }).sales_order_body_id)
          : null,
      allocation_type,
      allocated_location_id:
        (data as { allocated_location_id?: number | null }).allocated_location_id != null
          ? Number((data as { allocated_location_id: number | null }).allocated_location_id)
          : null,
      notes:
        typeof (data as { notes?: string | null }).notes === "string"
          ? (data as { notes: string | null }).notes
          : null,
      updated_at:
        (data as { updated_at?: string }).updated_at != null
          ? String((data as { updated_at?: string }).updated_at)
          : null,
    };
  } catch {
    return null;
  }
}

export type UpsertErpManualAllocationInput = {
  sales_order_id: number;
  sales_order_body_id?: number | null;
  allocation_type: "LOCAL" | "CENTRAL";
  allocated_location_id?: number | null;
  notes?: string | null;
  updated_by_user_id: number | null;
};

/** Insert or replace the manual allocation row for a sales_order_id (API / server only). */
export async function upsertErpManualAllocation(
  input: UpsertErpManualAllocationInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return { ok: false, error: "Supabase service role key is not configured." };
  }
  try {
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();
    const payload = {
      sales_order_id: Math.trunc(Number(input.sales_order_id)),
      sales_order_body_id:
        input.sales_order_body_id != null ? Math.trunc(Number(input.sales_order_body_id)) : null,
      allocation_type: input.allocation_type,
      allocated_location_id:
        input.allocated_location_id != null ? Math.trunc(Number(input.allocated_location_id)) : null,
      notes: input.notes ?? null,
      updated_by: input.updated_by_user_id != null ? Math.trunc(Number(input.updated_by_user_id)) : null,
      updated_at: now,
    };
    const { error } = await supabase.from("erp_order_manual_allocation").upsert(payload, {
      onConflict: "sales_order_id",
    });
    if (error) return { ok: false, error: error.message ?? "Upsert failed" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upsert failed" };
  }
}
