import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserProfile } from "@/services/auth";

export async function POST(req: Request) {
  const auth = await getCurrentUserProfile();
  if (auth?.profile?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { provider } = await req.json();
    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 });
    }

    // Deactivate all others
    await prisma.aiProviderConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false }
    });

    // Activate the selected
    await prisma.aiProviderConfig.update({
      where: { provider },
      data: { isActive: true }
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
