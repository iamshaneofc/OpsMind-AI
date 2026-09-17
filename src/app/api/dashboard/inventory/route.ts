import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/services/auth";
import { getInventoryForRole } from "@/services/operations";

export async function GET() {
  try {
    const { profile } = await requireAuthenticatedUser();
    const rows = await getInventoryForRole(profile);
    return NextResponse.json(rows, {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Unauthorized" }, { status: 401 });
  }
}

