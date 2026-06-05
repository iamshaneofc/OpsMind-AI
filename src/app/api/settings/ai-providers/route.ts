import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserProfile } from "@/services/auth";
import { normalizeApiKey } from "@/ai/openai";

export async function GET() {
  const auth = await getCurrentUserProfile();
  if (auth?.profile?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configs = await prisma.aiProviderConfig.findMany({
    orderBy: { provider: "asc" }
  });

  // Mask the API keys
  const safeConfigs = configs.map(c => {
    const maskedKey = c.apiKey && c.apiKey.length > 10 
      ? `${c.apiKey.slice(0, 6)}...${c.apiKey.slice(-4)}`
      : '***';
    return {
      id: c.id,
      provider: c.provider,
      isActive: c.isActive,
      updatedAt: c.updatedAt,
      maskedKey
    };
  });

  return NextResponse.json(safeConfigs);
}

export async function POST(req: Request) {
  const auth = await getCurrentUserProfile();
  if (auth?.profile?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { provider, apiKey, isActive } = await req.json();
    if (!provider || !apiKey) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const cleanKey = normalizeApiKey(apiKey);

    // If making this active, deactivate all others
    if (isActive) {
      await prisma.aiProviderConfig.updateMany({
        where: { isActive: true },
        data: { isActive: false }
      });
    }

    const config = await prisma.aiProviderConfig.upsert({
      where: { provider },
      update: {
        apiKey: cleanKey,
        ...(isActive !== undefined && { isActive }),
      },
      create: {
        provider,
        apiKey: cleanKey,
        isActive: isActive || false,
      }
    });

    return NextResponse.json({ success: true, id: config.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
