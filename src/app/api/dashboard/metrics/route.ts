import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/services/auth";
import { getDashboardMetrics } from "@/services/operations";

export async function GET() {
  try {
    const { profile } = await requireAuthenticatedUser();
    const metrics = await getDashboardMetrics(profile);
    return NextResponse.json(metrics, {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Unauthorized" }, { status: 401 });
  }
}

