import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/services/auth";
import { prisma } from "@/lib/db";
import { getActiveIndustry } from "@/lib/industry-server";

export async function GET() {
  try {
    await requireAuthenticatedUser();
    const industry = getActiveIndustry();

    const customers = await prisma.customer.findMany({
      where: { industry },
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
    const industry = getActiveIndustry();

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const customer = await prisma.customer.create({
      data: {
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        industry,
      },
    });

    return NextResponse.json({ success: true, customer });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Unauthorized" }, { status: 401 });
  }
}
