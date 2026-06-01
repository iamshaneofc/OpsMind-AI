import { createSupabaseAdminClient } from "@/supabase/admin";
import type { OrderLifecycleFromErp } from "@/sql-server/order-lifecycle";
import type { ErpManualAllocationSnapshot } from "@/lib/erp-manual-allocation";

/** Raw ERP-driven inputs used to derive lifecycle (excluding manual allocation overlay). */
export type ErpDerivedSignalsSnapshot = {
  has_linked_invoice: boolean;
  sales_invoice_header_id: number | null;
  invoice_confirmed: boolean | null;
  /** Normalized yyyy-mm-dd or null when not delivered per invoice removal */
  invoice_date_of_removal: string | null;
  order_forwarded: boolean;
  /** Gap H — any sales_order_body line has `Despatch_Location_ID` = central depot. */
  central_despatch_hub?: boolean;
  request_initialised: boolean;
  request_processed: boolean;
  awaiting_factory: boolean;
  has_transport_hint: boolean;
  /** Gap E: how dispatch-ready came about when inferred */
  dispatch_ready_source?: "confirmed" | "logistics_proxy" | null;
};

function journalReadsEnabled(): boolean {
  const v = process.env.SKIP_ERP_STATUS_JOURNAL;
  return v !== "true" && v !== "1";
}

/** Stable fingerprint to skip duplicate snapshots for the same logical state. */
export function fingerprintDerivedLifecycle(lifecycle: OrderLifecycleFromErp): string {
  const removal = lifecycle.removalDate ?? "";
  const manual = lifecycle.manual_allocation
    ? JSON.stringify({
        t: lifecycle.manual_allocation.allocation_type,
        loc: lifecycle.manual_allocation.allocated_location_id,
        n: lifecycle.manual_allocation.notes ?? "",
      })
    : "";
  return `${lifecycle.status}|${removal}|${manual}`;
}

type LastRow = {
  derived_status: string;
  removal_date: string | null;
  manual_allocation: ErpManualAllocationSnapshot | Record<string, unknown> | null;
};

function fingerprintFromDbRow(row: LastRow): string {
  const removal = row.removal_date ? String(row.removal_date).slice(0, 10) : "";
  let manualPayload = "";
  if (row.manual_allocation != null && typeof row.manual_allocation === "object") {
    const ma = row.manual_allocation as Partial<ErpManualAllocationSnapshot>;
    manualPayload = JSON.stringify({
      t: ma.allocation_type ?? "",
      loc: ma.allocated_location_id ?? null,
      n: ma.notes ?? "",
    });
  }
  return `${row.derived_status}|${removal}|${manualPayload}`;
}

function toDateColumnNullable(isoDay: string | null | undefined): string | null {
  if (isoDay == null || isoDay === "") return null;
  const s = String(isoDay).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * If the derived lifecycle differs from the latest snapshot row, inserts a new row.
 * Silent no-op when misconfigured or on error — never fails caller.
 */
export async function appendStatusSnapshotJournalIfNeeded(
  salesOrderId: number,
  lifecycle: OrderLifecycleFromErp,
  erpSignals: ErpDerivedSignalsSnapshot,
): Promise<void> {
  if (!journalReadsEnabled()) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return;

  const sid = Math.trunc(Number(salesOrderId));
  if (!Number.isFinite(sid) || sid <= 0) return;

  try {
    const supabase = createSupabaseAdminClient();
    const fp = fingerprintDerivedLifecycle(lifecycle);

    const { data: last, error: lastErr } = await supabase
      .from("erp_order_status_snapshots")
      .select("derived_status, removal_date, manual_allocation")
      .eq("sales_order_id", sid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastErr) return;
    if (last != null && fingerprintFromDbRow(last as LastRow) === fp) return;

    await supabase.from("erp_order_status_snapshots").insert({
      sales_order_id: sid,
      derived_status: lifecycle.status,
      removal_date: toDateColumnNullable(lifecycle.removalDate),
      manual_allocation: lifecycle.manual_allocation ?? null,
      erp_signals: erpSignals as unknown as Record<string, unknown>,
    });
  } catch {
    /* never throw */
  }
}

export async function fetchStatusSnapshotJournal(
  salesOrderId: number,
  limitRows: number,
): Promise<Array<{
  id: string;
  derived_status: string;
  removal_date: string | null;
  manual_allocation: unknown;
  erp_signals: unknown;
  created_at: string;
}>> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return [];

  const sid = Math.trunc(Number(salesOrderId));
  if (!Number.isFinite(sid) || sid <= 0) return [];

  try {
    const supabase = createSupabaseAdminClient();
    const cap = Math.min(Math.max(1, Math.floor(limitRows)), 200);
    const { data, error } = await supabase
      .from("erp_order_status_snapshots")
      .select("id, derived_status, removal_date, manual_allocation, erp_signals, created_at")
      .eq("sales_order_id", sid)
      .order("created_at", { ascending: false })
      .limit(cap);

    if (error || !data) return [];
    return data.map((row) => ({
      id: String((row as { id: string }).id),
      derived_status: String((row as { derived_status: string }).derived_status),
      removal_date:
        (row as { removal_date?: string }).removal_date != null
          ? String((row as { removal_date: string }).removal_date).slice(0, 10)
          : null,
      manual_allocation: (row as { manual_allocation?: unknown }).manual_allocation ?? null,
      erp_signals: (row as { erp_signals?: unknown }).erp_signals ?? {},
      created_at:
        (row as { created_at?: string }).created_at != null
          ? String((row as { created_at: string }).created_at)
          : "",
    }));
  } catch {
    return [];
  }
}
