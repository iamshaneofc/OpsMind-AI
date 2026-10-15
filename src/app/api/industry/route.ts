import { NextResponse } from "next/server";
import {
  DEFAULT_INDUSTRY,
  INDUSTRY_COOKIE,
  isIndustryId,
  parseIndustry,
} from "@/lib/industry";
import { getCurrentUserProfile } from "@/services/auth";

export async function GET() {
  const auth = await getCurrentUserProfile();
  if (!auth?.profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { cookies } = await import("next/headers");
  const industry = parseIndustry(cookies().get(INDUSTRY_COOKIE)?.value);
  return NextResponse.json({ industry });
}

export async function POST(req: Request) {
  const auth = await getCurrentUserProfile();
  if (!auth?.profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { industry?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (!isIndustryId(body.industry)) {
    return NextResponse.json(
      { error: "Invalid industry", allowed: ["chemical", "automobile", "pharma", "agriculture"] },
      { status: 400 },
    );
  }

  const industry = body.industry;
  const res = NextResponse.json({ industry, ok: true });
  res.cookies.set(INDUSTRY_COOKIE, industry, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

export async function DELETE() {
  const auth = await getCurrentUserProfile();
  if (!auth?.profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const res = NextResponse.json({ industry: DEFAULT_INDUSTRY, ok: true });
  res.cookies.set(INDUSTRY_COOKIE, DEFAULT_INDUSTRY, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
