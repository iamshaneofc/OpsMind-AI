import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/services/auth";
import { testProviderKey, isProviderName, type ProviderName } from "@/ai/providers";

export async function POST(req: Request) {
  const auth = await getCurrentUserProfile();
  if (auth?.profile?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { provider, apiKey } = await req.json();
    if (!provider || !apiKey) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!isProviderName(provider)) {
      return NextResponse.json({ success: false, error: "Unsupported provider for testing" }, { status: 400 });
    }

    const result = await testProviderKey(provider as ProviderName, apiKey);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, message: "Connection successful" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
