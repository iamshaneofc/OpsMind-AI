import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/services/auth";
import { getOrdersForRole } from "@/services/operations";

export async function GET() {
  console.log("🔥 API HIT");
  try {
    const { profile } = await requireAuthenticatedUser();
    const rows = await getOrdersForRole(profile);
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Unauthorized" }, { status: 401 });
  }
}

