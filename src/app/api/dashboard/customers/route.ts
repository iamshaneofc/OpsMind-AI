import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuthenticatedUser } from "@/services/auth";

export async function GET() {
  try {
    const { profile } = await requireAuthenticatedUser();
    
    // Fetch actual customers from the database
    const customers = await prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50, // Limit to recent 50 for the CRM view
    });

    return NextResponse.json(customers);
  } catch (error) {
    console.error("GET /api/dashboard/customers error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
