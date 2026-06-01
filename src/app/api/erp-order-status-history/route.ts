import { NextResponse, type NextRequest } from "next/server";
import { fetchStatusSnapshotJournal } from "@/lib/erp-order-status-journal";
import { profileCanAccessSalesOrderForManualAllocationRead } from "@/lib/erp-order-allocation-access";
import { getCurrentUserProfile } from "@/services/auth";

function parsePositiveInt(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

/** GET: derived status snapshot history for an ERP sales_order_id (same access rules as manual allocation read). */
export async function GET(request: NextRequest) {
  const auth = await getCurrentUserProfile();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const salesOrderId = parsePositiveInt(request.nextUrl.searchParams.get("sales_order_id"));
  if (!salesOrderId) {
    return NextResponse.json({ error: "sales_order_id is required (positive integer)." }, { status: 400 });
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.min(200, Math.max(1, Math.floor(Number(limitParam)))) : 50;

  const allowed = await profileCanAccessSalesOrderForManualAllocationRead(auth.profile, salesOrderId);
  if (!allowed) return NextResponse.json({ error: "Not found or access denied." }, { status: 404 });

  const snapshots = await fetchStatusSnapshotJournal(salesOrderId, limit);

  return NextResponse.json(
    {
      sales_order_id: salesOrderId,
      snapshots,
      showing: snapshots.length,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
