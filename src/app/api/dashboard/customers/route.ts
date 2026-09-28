import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/services/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    // The page is reachable by admin, manager and analyst (see canAccessSection),
    // so any authenticated user may read. Customer has no company/warehouse
    // column, so there is nothing to scope by — it is globally readable.
    await requireAuthenticatedUser();

    const customers = await prisma.customer.findMany({
      orderBy: { name: "asc" },
    });

    return NextResponse.json(customers, {
      headers: {
        "Cache-Control": "private, max-age=10, stale-while-revalidate=20",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { profile } = await requireAuthenticatedUser();

    if (profile.role !== "admin" && profile.role !== "manager") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, phone, address } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const customer = await prisma.customer.create({
      data: {
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
      },
    });

    return NextResponse.json({ success: true, customer });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Unauthorized" }, { status: 401 });
  }
}
