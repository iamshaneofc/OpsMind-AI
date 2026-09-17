import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/services/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { profile } = await requireAuthenticatedUser();

    if (profile.role !== "admin" && profile.role !== "manager") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const body = await request.json();
    const { status } = body;

    const validStatuses = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "DELAYED", "CANCELLED"];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const order = await prisma.order.update({
      where: { id: params.id },
      data: { status },
    });

    return NextResponse.json({ success: true, order });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Unauthorized" }, { status: 401 });
  }
}
