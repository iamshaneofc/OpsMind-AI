import OpenAI from "openai";
import { prisma } from "@/lib/db";

/** Normalize API key: trim and strip Windows CRLF so key is valid on all platforms. */
export function normalizeApiKey(raw: string | undefined): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\r\n|\r|\n/g, "").trim();
}

export async function getOpenAIClient() {
  const config = await prisma.aiProviderConfig.findFirst({
    where: {
      provider: "OpenAI",
      isActive: true,
    },
  });

  let apiKey = normalizeApiKey(config?.apiKey);
  
  // Fallback to environment variable if no active config in DB
  if (!apiKey) {
    apiKey = normalizeApiKey(process.env.OPENAI_API_KEY);
  }

  if (!apiKey) {
    throw new Error("NO_API_KEY_CONFIGURED");
  }

  if (!apiKey.startsWith("sk-")) {
    throw new Error("INVALID_API_KEY_FORMAT");
  }

  return new OpenAI({
    apiKey,
    baseURL: "https://api.openai.com/v1",
  });
}
