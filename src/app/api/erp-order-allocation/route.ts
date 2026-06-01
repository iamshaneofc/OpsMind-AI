import { NextResponse, type NextRequest } from "next/server";
import { fetchErpManualAllocationBySalesOrderId, upsertErpManualAllocation } from "@/lib/erp-manual-allocation";
import {
  profileCanAccessSalesOrderForManualAllocationRead,
  profileCanUpsertManualAllocation,
} from "@/lib/erp-order-allocation-access";
import { getCurrentUserProfile } from "@/services/auth";

function parsePositiveInt(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

/**
 * GET: read Phase 1 manual allocation for an ERP sales_order_id (authorized users only).
 * PUT: upsert manual allocation (super_admin / warehouse scoped to ERP order depot).
 */
export async function GET(request: NextRequest) {
  const auth = await getCurrentUserProfile();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const salesOrderId = parsePositiveInt(request.nextUrl.searchParams.get("sales_order_id"));
  if (!salesOrderId)
    return NextResponse.json({ error: "sales_order_id is required (positive integer)." }, { status: 400 });

  const allowed = await profileCanAccessSalesOrderForManualAllocationRead(auth.profile, salesOrderId);
  if (!allowed) return NextResponse.json({ error: "Not found or access denied." }, { status: 404 });

  const row = await fetchErpManualAllocationBySalesOrderId(salesOrderId);
  return NextResponse.json(
    {
      sales_order_id: salesOrderId,
      manual_allocation: row
        ? {
            allocation_type: row.allocation_type,
            allocated_location_id: row.allocated_location_id,
            sales_order_body_id: row.sales_order_body_id,
            notes: row.notes,
            updated_at: row.updated_at,
          }
        : null,
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function PUT(request: NextRequest) {
  const auth = await getCurrentUserProfile();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const salesOrderId =
    typeof b.sales_order_id === "number" ? Math.trunc(b.sales_order_id) : Number(b.sales_order_id);
  if (!Number.isFinite(salesOrderId) || salesOrderId <= 0) {
    return NextResponse.json({ error: "sales_order_id must be a positive integer." }, { status: 400 });
  }

  const canWrite = await profileCanUpsertManualAllocation(auth.profile, salesOrderId);
  if (!canWrite) return NextResponse.json({ error: "Forbidden or order not found." }, { status: 403 });

  const typeRaw = String(b.allocation_type ?? "")
    .trim()
    .toUpperCase();
  if (typeRaw !== "LOCAL" && typeRaw !== "CENTRAL") {
    return NextResponse.json({ error: "allocation_type must be LOCAL or CENTRAL." }, { status: 400 });
  }

  let sales_order_body_id: number | null | undefined;
  if (Object.prototype.hasOwnProperty.call(b, "sales_order_body_id")) {
    if (b.sales_order_body_id === null) {
      sales_order_body_id = null;
    } else {
      const sb = Number(b.sales_order_body_id);
      if (!Number.isFinite(sb) || sb <= 0) {
        return NextResponse.json({ error: "sales_order_body_id must be a positive integer or null." }, { status: 400 });
      }
      sales_order_body_id = Math.trunc(sb);
    }
  }

  let allocated_location_id: number | null | undefined;
  if (Object.prototype.hasOwnProperty.call(b, "allocated_location_id")) {
    if (b.allocated_location_id === null) allocated_location_id = null;
    else {
      const loc = Number(b.allocated_location_id);
      allocated_location_id = Number.isFinite(loc) && loc > 0 ? Math.trunc(loc) : null;
    }
  }

  const notes =
    b.notes === undefined || b.notes === null
      ? undefined
      : typeof b.notes === "string"
        ? b.notes
        : String(b.notes);

  const res = await upsertErpManualAllocation({
    sales_order_id: Math.trunc(salesOrderId),
    sales_order_body_id,
    allocation_type: typeRaw === "LOCAL" ? "LOCAL" : "CENTRAL",
    allocated_location_id,
    notes,
    updated_by_user_id: auth.userId,
  });

  if (!res.ok) return NextResponse.json({ error: res.error ?? "Save failed." }, { status: 502 });

  return NextResponse.json({ ok: true, sales_order_id: Math.trunc(salesOrderId) });
}
