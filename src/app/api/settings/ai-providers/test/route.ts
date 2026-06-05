import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/services/auth";
import { normalizeApiKey } from "@/ai/openai";
import OpenAI from "openai";

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

    const cleanKey = normalizeApiKey(apiKey);

    if (provider === "OpenAI") {
      const client = new OpenAI({ apiKey: cleanKey, baseURL: "https://api.openai.com/v1" });
      
      try {
        // Lightweight call to verify key
        await client.models.list();
        return NextResponse.json({ success: true, message: "Connection successful" });
      } catch (openAiError: any) {
        return NextResponse.json({ success: false, error: openAiError.message }, { status: 400 });
      }
    } else {
      return NextResponse.json({ success: false, error: "Unsupported provider for testing" }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
